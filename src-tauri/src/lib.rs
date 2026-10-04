use git2::Repository;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;
use tokio::fs;

// ─── Stage / Status ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
enum Stage {
    Idle,
    Cloning,
    CreatingVenv,
    Installing,
    Starting,
    Running,
    Error,
}

#[derive(Debug, Serialize, Clone)]
struct StatusEvent {
    stage: Stage,
    message: String,
    port: Option<u16>,
}

fn emit_status(
    app: &tauri::AppHandle,
    stage: Stage,
    message: impl Into<String>,
    port: Option<u16>,
) {
    let _ = app.emit(
        "backend-status",
        StatusEvent {
            stage,
            message: message.into(),
            port,
        },
    );
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
struct LogEntry {
    timestamp: String,
    level: String,
    message: String,
}

struct BackendLogs(Mutex<Vec<LogEntry>>);

fn timestamp() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let h = (secs / 3600) % 24;
    let m = (secs / 60) % 60;
    let s = secs % 60;
    format!("{:02}:{:02}:{:02}", h, m, s)
}

fn push_log(app: &tauri::AppHandle, level: &str, message: &str) {
    let entry = LogEntry {
        timestamp: timestamp(),
        level: level.to_string(),
        message: message.to_string(),
    };
    let state = app.state::<BackendLogs>();
    state.0.lock().unwrap().push(entry.clone());
    let _ = app.emit("backend-log", entry);
}

// ─── UV progress parsing ──────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
struct UvProgress {
    stage: String,
    current: u32,
    total: u32,
    raw_message: String,
}

fn ansi_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\x1B\[[0-?]*[ -/]*[@-~]").unwrap())
}

fn progress_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"(?i)(Prepared|Installed|Downloaded|Downloading|Built|Unpacked)\s+(\d+)(?:\s+of\s+|\s*/\s*)\s*(\d+)",
        )
        .unwrap()
    })
}

fn normalize_stage(verb: &str) -> &str {
    match verb {
        "prepared" => "preparing",
        "downloaded" | "downloading" => "downloading",
        "built" => "building",
        "unpacked" => "unpacking",
        _ => verb,
    }
}

fn emit_uv_progress(app: &tauri::AppHandle, stage: &str, current: u32, total: u32, raw_message: String) {
    let _ = app.emit(
        "uv-progress-update",
        UvProgress {
            stage: stage.to_string(),
            current,
            total,
            raw_message,
        },
    );
}

fn parse_and_emit_uv_progress(app: &tauri::AppHandle, raw_line: &str) {
    let clean = ansi_regex().replace_all(raw_line, "");
    if let Some(caps) = progress_regex().captures(&clean) {
        let verb = caps[1].to_lowercase();
        let stage = normalize_stage(&verb);
        let current: u32 = caps[2].parse().unwrap_or(0);
        let total: u32 = caps[3].parse().unwrap_or(0);
        if total > 0 {
            emit_uv_progress(app, stage, current, total, clean.trim().to_string());
        }
    }
}

// ─── Debug log file ───────────────────────────────────────────────────────────

fn debug_log_path() -> Option<PathBuf> {
    app_data_dir().ok().map(|d| d.join("uv_debug.log"))
}

fn append_debug_log(bytes: &[u8]) {
    let Some(path) = debug_log_path() else { return };
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = f.write_all(bytes);
        let _ = f.flush();
    }
}

fn append_debug_log_header(args: &[&str]) {
    let Some(path) = debug_log_path() else { return };
    let header = format!("\n=== uv {} ===\n", args.join(" "));
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = f.write_all(header.as_bytes());
        let _ = f.flush();
    }
}

// ─── reline_ws log file ──────────────────────────────────────────────────────

fn reline_ws_log_path() -> Option<PathBuf> {
    app_data_dir().ok().map(|d| d.join("reline_ws.log"))
}

fn append_reline_ws_log(line: &str) {
    let Some(path) = reline_ws_log_path() else { return };
    let line_with_ts = format!("{} {}\n", timestamp(), line.trim_end());
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = f.write_all(line_with_ts.as_bytes());
        let _ = f.flush();
    }
}

// ─── State ────────────────────────────────────────────────────────────────────

struct BackendProcess(Mutex<Option<BackendHandle>>);
struct BackendPort(Mutex<Option<u16>>);

struct BackendHandle {
    child: CommandChild,
    stopping: Arc<AtomicBool>,
}

// ─── Paths ────────────────────────────────────────────────────────────────────

fn exe_dir() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("failed to get current exe: {e}"))?;
    exe.parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "failed to get exe parent dir".to_string())
}

fn xdg_data_dir() -> PathBuf {
    let base = std::env::var("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            dirs::home_dir()
                .unwrap_or_else(|| PathBuf::from("/tmp"))
                .join(".local")
                .join("share")
        });
    base.join("easy_reline")
}

fn app_data_dir() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        return exe_dir();
    }

    #[cfg(not(target_os = "windows"))]
    {
        if std::env::var("APPIMAGE").is_ok() {
            return Ok(xdg_data_dir());
        }

        let exe_d = exe_dir()?;
        if is_dir_writable(&exe_d) {
            return Ok(exe_d);
        }

        Ok(xdg_data_dir())
    }
}

fn is_dir_writable(dir: &PathBuf) -> bool {
    let test = dir.join(".write_test_easy_reline");
    match std::fs::File::create(&test) {
        Ok(_) => {
            let _ = std::fs::remove_file(&test);
            true
        }
        Err(_) => false,
    }
}

fn get_workspace_path() -> Result<PathBuf, String> {
    Ok(app_data_dir()?.join("reline_ws"))
}

fn venv_python(workspace: &PathBuf) -> PathBuf {
    if cfg!(windows) {
        workspace.join(".venv").join("Scripts").join("python.exe")
    } else {
        workspace.join(".venv").join("bin").join("python")
    }
}

fn find_free_port(start: u16, end: u16) -> Option<u16> {
    (start..=end).find(|&port| TcpListener::bind(("127.0.0.1", port)).is_ok())
}

// ─── UV ───────────────────────────────────────────────────────────────────────

const UV_VERSION: &str = "0.10.4";

fn uv_platform() -> Option<(&'static str, &'static str, &'static str)> {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;

    match (os, arch) {
        ("linux", "x86_64") => Some(("linux-x86_64", "uv-x86_64-unknown-linux-gnu.tar.gz", "uv")),
        ("windows", "x86_64") => {
            Some(("windows-x86_64", "uv-x86_64-pc-windows-msvc.zip", "uv.exe"))
        }
        ("macos", "x86_64") => Some(("macos-x86_64", "uv-x86_64-apple-darwin.tar.gz", "uv")),
        ("macos", "aarch64") => Some(("macos-aarch64", "uv-aarch64-apple-darwin.tar.gz", "uv")),
        _ => None,
    }
}

fn uv_in_path() -> Option<PathBuf> {
    which::which("uv").ok()
}

fn uv_local_path(subdir: &str, bin_name: &str) -> Result<PathBuf, String> {
    Ok(app_data_dir()?.join("uv_bin").join(subdir).join(bin_name))
}

async fn find_or_install_uv(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Some(path) = uv_in_path() {
        push_log(app, "info", &format!("Found system uv: {}", path.display()));
        return Ok(path);
    }

    let (subdir, asset, bin_name) = match uv_platform() {
        Some(p) => p,
        None => {
            let msg = format!(
                "No prebuilt uv for {}/{}, please install uv manually: https://docs.astral.sh/uv/getting-started/installation/",
                std::env::consts::OS, std::env::consts::ARCH
            );
            push_log(app, "error", &msg);
            return Err(msg);
        }
    };

    let local_path = uv_local_path(subdir, bin_name)?;
    if local_path.exists() {
        push_log(app, "info", &format!("Found local uv: {}", local_path.display()));
        ensure_executable(&local_path)?;
        return Ok(local_path);
    }

    push_log(app, "info", &format!("Downloading uv v{UV_VERSION}..."));
    let url = format!("https://github.com/astral-sh/uv/releases/download/{UV_VERSION}/{asset}");

    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to download uv: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed with status: {}",
            response.status()
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read uv download: {e}"))?;

    push_log(app, "info", "Extracting uv...");

    let parent = local_path.parent().unwrap();
    fs::create_dir_all(parent)
        .await
        .map_err(|e| format!("Failed to create uv dir: {e}"))?;

    let local_path_clone = local_path.clone();
    let bin_name_owned = bin_name.to_string();
    let asset_owned = asset.to_string();
    let bytes_vec = bytes.to_vec();

    tokio::task::spawn_blocking(move || {
        if asset_owned.ends_with(".tar.gz") {
            extract_tar_gz(&bytes_vec, &bin_name_owned, &local_path_clone)
        } else if asset_owned.ends_with(".zip") {
            extract_zip(&bytes_vec, &bin_name_owned, &local_path_clone)
        } else {
            Err(format!("Unknown archive format: {asset_owned}"))
        }
    })
        .await
        .map_err(|e| format!("Extract task failed: {e}"))??;

    ensure_executable(&local_path)?;

    push_log(app, "info", &format!("uv installed to {}", local_path.display()));
    Ok(local_path)
}

fn ensure_executable(path: &PathBuf) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
        let mut perms = meta.permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(path, perms).map_err(|e| e.to_string())?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

fn extract_tar_gz(bytes: &[u8], bin_name: &str, dest: &PathBuf) -> Result<(), String> {
    use flate2::read::GzDecoder;
    use tar::Archive;

    let gz = GzDecoder::new(bytes);
    let mut archive = Archive::new(gz);

    for entry in archive.entries().map_err(|e| e.to_string())? {
        let mut entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path().map_err(|e| e.to_string())?;
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        if file_name == bin_name {
            let mut out = std::fs::File::create(dest)
                .map_err(|e| format!("Failed to create {}: {e}", dest.display()))?;
            std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
            return Ok(());
        }
    }
    Err(format!("'{bin_name}' not found inside archive"))
}

fn extract_zip(bytes: &[u8], bin_name: &str, dest: &PathBuf) -> Result<(), String> {
    use std::io::{Cursor, Read};
    use zip::ZipArchive;

    let cursor = Cursor::new(bytes);
    let mut archive = ZipArchive::new(cursor).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().to_string();
        let file_name = PathBuf::from(&name)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        if file_name == bin_name {
            let mut buf = Vec::new();
            file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            std::fs::write(dest, &buf)
                .map_err(|e| format!("Failed to write {}: {e}", dest.display()))?;
            return Ok(());
        }
    }
    Err(format!("'{bin_name}' not found inside zip"))
}

// ─── NVIDIA GPU check ─────────────────────────────────────────────────────────

fn check_nvidia_gpu() -> bool {
    #[cfg(target_os = "windows")]
    {
        if let Ok(out) = std::process::Command::new("wmic")
            .args(["path", "win32_VideoController", "get", "name"])
            .output()
        {
            let text = String::from_utf8_lossy(&out.stdout);
            if text.to_lowercase().contains("nvidia") {
                return true;
            }
        }
        if let Ok(out) = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name",
            ])
            .output()
        {
            let text = String::from_utf8_lossy(&out.stdout);
            if text.to_lowercase().contains("nvidia") {
                return true;
            }
        }
        false
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(out) = std::process::Command::new("lspci").output() {
            let text = String::from_utf8_lossy(&out.stdout);
            return text.to_lowercase().contains("nvidia");
        }
        false
    }

    #[cfg(target_os = "macos")]
    {
        false
    }
}

// ─── Config ───────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ConfigReline {
    pub in_dir: String,
    pub out_dir: String,
    pub model_path: String,
    pub model_tile_size: u32,
    pub model_scale: Option<u32>,
    pub model_dtype: String,
    pub model_allow_cpu_scale: bool,
    pub color_fix: bool,
    pub target_size: Option<u32>,
    pub resize_mode: String,
    pub resize_down_format: String,
    pub recursive: bool,
}

fn default_config() -> ConfigReline {
    ConfigReline {
        in_dir: "".into(),
        out_dir: "".into(),
        model_path: "".into(),
        model_tile_size: 512,
        model_scale: None,
        model_dtype: "F32".into(),
        model_allow_cpu_scale: true,
        color_fix: true,
        target_size: None,
        resize_mode: "width".into(),
        resize_down_format: "linear".into(),
        recursive: true,
    }
}

fn config_path() -> Result<PathBuf, String> {
    Ok(get_workspace_path()?.join("config.json"))
}

#[tauri::command]
async fn open_reline_config() -> ConfigReline {
    let config_path = match config_path() {
        Ok(p) => p,
        Err(_) => return default_config(),
    };
    if let Ok(data) = fs::read_to_string(&config_path).await {
        if !data.is_empty() {
            if let Ok(cfg) = serde_json::from_str::<ConfigReline>(&data) {
                return cfg;
            }
        }
    }
    let cfg = default_config();
    if let Some(parent) = config_path.parent() {
        let _ = fs::create_dir_all(parent).await;
    }
    let _ = fs::write(&config_path, serde_json::to_string_pretty(&cfg).unwrap()).await;
    cfg
}

#[tauri::command]
async fn save_config_reline(config: ConfigReline) -> bool {
    let config_path = match config_path() {
        Ok(p) => p,
        Err(_) => return false,
    };
    if let Some(parent) = config_path.parent() {
        let _ = fs::create_dir_all(parent).await;
    }
    fs::write(&config_path, serde_json::to_string_pretty(&config).unwrap())
        .await
        .is_ok()
}

// ─── Deps status / versions ───────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
struct DepsStatus {
    uv_installed: bool,
    repo_cloned: bool,
    venv_created: bool,
    deps_installed: bool,
    has_nvidia_gpu: bool,
}

#[derive(Debug, Serialize, Clone)]
struct DepsVersions {
    torch_version: Option<String>,
    torch_cuda: bool,
    resselt_version: Option<String>,
    reline_version: Option<String>,
}

fn uvicorn_path(workspace: &PathBuf) -> PathBuf {
    if cfg!(windows) {
        workspace.join(".venv").join("Scripts").join("uvicorn.exe")
    } else {
        workspace.join(".venv").join("bin").join("uvicorn")
    }
}

fn check_deps_sync() -> DepsStatus {
    let uv_installed = uv_in_path().is_some()
        || uv_platform()
            .and_then(|(s, _, n)| uv_local_path(s, n).ok())
            .map(|p| p.exists())
            .unwrap_or(false);

    let workspace = get_workspace_path().unwrap_or_else(|_| PathBuf::from(""));
    let repo_cloned = workspace.join(".git").exists();
    let venv_created = workspace.join(".venv").exists();
    let deps_installed = uvicorn_path(&workspace).exists();

    DepsStatus {
        uv_installed,
        repo_cloned,
        venv_created,
        deps_installed,
        has_nvidia_gpu: check_nvidia_gpu(),
    }
}

// ─── Check commands ───────────────────────────────────────────────────────────

#[tauri::command]
fn check_deps() -> DepsStatus {
    check_deps_sync()
}

#[tauri::command]
async fn check_versions(app: tauri::AppHandle) -> DepsVersions {
    let empty = DepsVersions {
        torch_version: None,
        torch_cuda: false,
        resselt_version: None,
        reline_version: None,
    };

    let uv_path = match find_or_install_uv(&app).await {
        Ok(p) => p,
        Err(_) => return empty,
    };

    let workspace = match get_workspace_path() {
        Ok(p) => p,
        Err(_) => return empty,
    };

    if !workspace.join(".venv").exists() {
        return empty;
    }

    let out = match app
        .shell()
        .command(uv_path.to_str().unwrap())
        .args(["pip", "freeze"])
        .current_dir(&workspace)
        .output()
        .await
    {
        Ok(o) => o,
        Err(_) => return empty,
    };

    let stdout = String::from_utf8_lossy(&out.stdout);
    let mut versions = empty;

    for line in stdout.lines() {
        let line = line.trim();
        if let Some(ver) = line.strip_prefix("torch==") {
            versions.torch_version = Some(ver.to_string());
            versions.torch_cuda = ver.contains("+cu");
        } else if let Some(ver) = line.strip_prefix("resselt==") {
            versions.resselt_version = Some(ver.to_string());
        } else if let Some(ver) = line.strip_prefix("reline==") {
            versions.reline_version = Some(ver.to_string());
        }
    }

    versions
}

// ─── Install deps ─────────────────────────────────────────────────────────────

async fn spawn_and_stream(
    app: &tauri::AppHandle,
    uv_path: &PathBuf,
    args: &[&str],
    workspace: &PathBuf,
) -> Result<(), String> {
    let mut final_args = vec!["--color", "always"];
    final_args.extend_from_slice(args);

    append_debug_log_header(args);
    emit_uv_progress(app, "reset", 0, 0, String::new());

    let cmd = app
        .shell()
        .command(uv_path.to_str().unwrap())
        .args(final_args)
        .current_dir(workspace);

    let (mut rx, _child) = cmd
        .spawn()
        .map_err(|e| format!("spawn failed: {e}"))?;

    let mut stderr_buffer = String::new();

    while let Some(event) = rx.recv().await {
        match event {
            tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                append_debug_log(&line);
                let text = String::from_utf8_lossy(&line);
                parse_and_emit_uv_progress(app, &text);
                push_log(app, "stdout", &text);
            }
            tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                append_debug_log(&line);
                let text = String::from_utf8_lossy(&line);
                stderr_buffer.push_str(&text);

                while let Some(pos) = stderr_buffer.find(|c| c == '\n' || c == '\r') {
                    let line_content: String = stderr_buffer.drain(..=pos).collect();
                    let line_trimmed = line_content.trim_end_matches(['\r', '\n']).to_string();
                    if !line_trimmed.is_empty() {
                        parse_and_emit_uv_progress(app, &line_trimmed);
                        push_log(app, "stderr", &line_trimmed);
                    }
                }
            }
            tauri_plugin_shell::process::CommandEvent::Terminated(status) => {
                if !stderr_buffer.trim().is_empty() {
                        push_log(app, "stderr", stderr_buffer.trim());
                }

                if status.code != Some(0) {
                    let msg = format!("Command failed with exit code: {:?}", status.code);
                    push_log(app, "error", &msg);
                    return Err(msg);
                }
                break;
            }
            _ => {}
        }
    }

    emit_uv_progress(app, "done", 0, 0, String::new());

    Ok(())
}

#[tauri::command]
async fn install_deps(app: tauri::AppHandle, full: bool) -> Result<(), String> {
    if !full {
        let deps = check_deps_sync();
        if !deps.uv_installed {
            return Err("UV not found. Run full installation first.".into());
        }
        if !deps.repo_cloned {
            return Err("Repository not found. Run full installation first.".into());
        }
        if !deps.venv_created {
            return Err("Virtual environment not found. Run full installation first.".into());
        }
    }

    let workspace = get_workspace_path()?;

    emit_status(&app, Stage::Cloning, "Setting up UV...", None);
    let uv_path = find_or_install_uv(&app).await?;

    if full {
        let repo_url = "https://github.com/rewaifu/reline_ws";
        if !workspace.join(".git").exists() {
            emit_status(&app, Stage::Cloning, "Cloning repository...", None);
            if workspace.exists() {
                std::fs::remove_dir_all(&workspace).map_err(|e| e.to_string())?;
            }
            unsafe {
                git2::opts::set_verify_owner_validation(false).unwrap();
            }
            if let Err(e) = Repository::clone(repo_url, &workspace) {
                let msg = format!("Clone failed: {e:?}");
                emit_status(&app, Stage::Error, &msg, None);
                return Err(msg);
            }
            push_log(&app, "info", "Repository cloned");
        } else {
            push_log(&app, "info", "Repository already exists, skipping clone");
        }

        let venv_dir = workspace.join(".venv");
        if !venv_dir.exists() {
            emit_status(&app, Stage::CreatingVenv, "Creating virtual environment...", None);
            let out = app
                .shell()
                .command(uv_path.to_str().unwrap())
                .args(["venv", ".venv"])
                .current_dir(&workspace)
                .output()
                .await
                .map_err(|e| format!("uv venv failed: {e}"))?;
            if !out.status.success() {
                let msg = format!("venv error: {}", String::from_utf8_lossy(&out.stderr));
                emit_status(&app, Stage::Error, &msg, None);
                return Err(msg);
            }
            push_log(&app, "info", "Virtual environment created");
        } else {
            push_log(&app, "info", "Virtual environment already exists, skipping");
        }
    }

    emit_status(&app, Stage::Installing, "Installing dependencies...", None);

    if full && cfg!(windows) {
        emit_status(&app, Stage::Installing, "Installing PyTorch (CUDA)...", None);
        spawn_and_stream(
            &app,
            &uv_path,
            &[
                "pip",
                "install",
                "torch",
                "--index-url",
                "https://download.pytorch.org/whl/cu128",
                "--index-strategy",
                "unsafe-best-match",
                "--no-cache",
                "--link-mode=copy",
            ],
            &workspace,
        )
        .await?;
    }

    spawn_and_stream(
        &app,
        &uv_path,
        &[
            "pip",
            "install",
            "-e",
            ".",
            "--index-strategy",
            "unsafe-best-match",
            "--no-cache",
            "--link-mode=copy",
        ],
        &workspace,
    )
    .await?;

    // Verify torch CUDA
    let versions = check_versions(app.clone()).await;
    if let Some(ref v) = versions.torch_version {
        if versions.torch_cuda {
            push_log(&app, "info", &format!("Torch {} with CUDA ✓", v));
        } else {
            let msg = format!("Torch {} installed WITHOUT CUDA support. Check PyTorch CUDA wheel availability.", v);
            push_log(&app, "error", &msg);
        }
    }

    let deps = check_deps_sync();
    if !deps.has_nvidia_gpu {
        push_log(&app, "info", "No NVIDIA GPU detected. Processing on CPU will be extremely slow.");
    }

    emit_status(&app, Stage::Idle, "Dependencies installed", None);
    Ok(())
}

// ─── Initialize (start backend) ───────────────────────────────────────────────

#[tauri::command]
async fn initialize(
    app: tauri::AppHandle,
    backend_state: tauri::State<'_, BackendProcess>,
    port_state: tauri::State<'_, BackendPort>,
    port: Option<u16>,
) -> Result<(), String> {
    kill_backend(&backend_state);
    *port_state.0.lock().unwrap() = None;

    let deps = check_deps_sync();
    if !deps.uv_installed || !deps.repo_cloned || !deps.venv_created || !deps.deps_installed {
        let msg = "Dependencies not installed. Please install them in Settings.";
        emit_status(&app, Stage::Error, msg, None);
        return Err(msg.into());
    }

    let workspace = get_workspace_path()?;
    let python_bin = venv_python(&workspace);

    let port = match port {
        Some(p) => {
            if p < 1024 {
                let msg = format!("Invalid port {p}. Use a port between 1024 and 65535.");
                emit_status(&app, Stage::Error, &msg, None);
                return Err(msg);
            }
            if TcpListener::bind(("127.0.0.1", p)).is_err() {
                let msg = format!("Port {p} is already in use.");
                emit_status(&app, Stage::Error, &msg, None);
                return Err(msg);
            }
            p
        }
        None => match find_free_port(8000, 9000) {
            Some(p) => p,
            None => {
                let msg = "No free port in range 8000-9000".to_string();
                emit_status(&app, Stage::Error, &msg, None);
                return Err(msg);
            }
        },
    };

    emit_status(
        &app,
        Stage::Starting,
        format!("Starting server on port {port}..."),
        None,
    );

    let port_str = port.to_string();
    let (mut rx, child) = app
        .shell()
        .command(python_bin.to_str().unwrap())
        .args([
            "-m",
            "uvicorn",
            "app:app",
            "--host",
            "127.0.0.1",
            "--port",
            &port_str,
        ])
        .current_dir(&workspace)
        .spawn()
        .map_err(|e| {
            let msg = format!("uvicorn spawn failed: {e}");
            emit_status(&app, Stage::Error, &msg, None);
            msg
        })?;

    let stopping = Arc::new(AtomicBool::new(false));
    *backend_state.0.lock().unwrap() = Some(BackendHandle {
        child,
        stopping: stopping.clone(),
    });
    *port_state.0.lock().unwrap() = Some(port);

    emit_status(
        &app,
        Stage::Running,
        format!("Backend running on ws://127.0.0.1:{port}"),
        Some(port),
    );

    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
                    append_reline_ws_log(&text);
                    push_log(&app_clone, "stdout", &text);
                }
                tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                    let text = String::from_utf8_lossy(&line);
                    append_reline_ws_log(&text);
                    push_log(&app_clone, "stderr", &text);
                }
                tauri_plugin_shell::process::CommandEvent::Terminated(status) => {
                    if stopping.load(Ordering::SeqCst) {
                        push_log(&app_clone, "info", "Backend stopped by user");
                    } else {
                        push_log(&app_clone, "error", &format!("Backend terminated: {:?}", status.code));
                        emit_status(
                            &app_clone,
                            Stage::Error,
                            "Backend process terminated unexpectedly",
                            None,
                        );
                    }
                }
                _ => {}
            }
        }
    });

    Ok(())
}

// ─── Other commands ───────────────────────────────────────────────────────────

#[tauri::command]
fn stop_backend(
    app: tauri::AppHandle,
    backend_state: tauri::State<'_, BackendProcess>,
    port_state: tauri::State<'_, BackendPort>,
) -> Result<(), String> {
    kill_backend(&backend_state);
    *port_state.0.lock().unwrap() = None;
    emit_status(&app, Stage::Idle, "Backend stopped", None);
    Ok(())
}

#[tauri::command]
fn get_backend_port(state: tauri::State<'_, BackendPort>) -> Option<u16> {
    *state.0.lock().unwrap()
}

#[tauri::command]
fn check_port_free(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    tauri_plugin_opener::open_path(&path, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    tauri_plugin_opener::open_url(&url, None::<&str>).map_err(|e| e.to_string())
}

fn kill_backend(state: &BackendProcess) {
    if let Some(handle) = state.0.lock().unwrap().take() {
        handle.stopping.store(true, Ordering::SeqCst);
        let _ = handle.child.kill();
        push_log_simple("Backend process killed");
    }
}

fn push_log_simple(message: &str) {
    println!("[backend] {message}");
}

// ─── Log commands ─────────────────────────────────────────────────────────────

#[tauri::command]
fn get_logs(state: tauri::State<'_, BackendLogs>) -> Vec<LogEntry> {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
fn clear_logs(state: tauri::State<'_, BackendLogs>) {
    state.0.lock().unwrap().clear();
}

// ─── Custom titlebar ──────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
fn use_custom_titlebar() -> bool {
    false
}

#[cfg(not(target_os = "macos"))]
fn use_custom_titlebar() -> bool {
    #[cfg(target_os = "linux")]
    {
        let desktop = std::env::var("XDG_CURRENT_DESKTOP")
            .unwrap_or_default()
            .to_lowercase();
        let session = std::env::var("XDG_SESSION_TYPE")
            .unwrap_or_default()
            .to_lowercase();
        let is_kde = desktop.split([':', ';']).any(|part| part.trim() == "kde");
        let is_x11 = session == "x11"
            || (session.is_empty() && std::env::var("WAYLAND_DISPLAY").is_err());
        if is_kde && is_x11 {
            return false;
        }
    }
    true
}

#[tauri::command]
fn get_window_mode() -> bool {
    use_custom_titlebar()
}

// ─── Entry point ──────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            app.manage(BackendProcess(Mutex::new(None)));
            app.manage(BackendPort(Mutex::new(None)));
            app.manage(BackendLogs(Mutex::new(Vec::new())));
            if let Some(window) = app.get_webview_window("main") {
                if use_custom_titlebar() {
                    let _ = window.set_decorations(false);
                }
                let _ = window.show();
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let backend = window.app_handle().state::<BackendProcess>();
                kill_backend(&backend);
            }
        })
        .invoke_handler(tauri::generate_handler![
            initialize,
            stop_backend,
            get_backend_port,
            check_port_free,
            open_folder,
            open_url,
            open_reline_config,
            save_config_reline,
            check_deps,
            check_versions,
            install_deps,
            get_logs,
            clear_logs,
            get_window_mode,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
