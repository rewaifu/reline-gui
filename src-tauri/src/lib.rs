use git2::Repository;
use regex::Regex;
use serde::Serialize;
use std::io::Write;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::fs;

// ─── Small helpers ────────────────────────────────────────────────────────────

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn path_str(path: &Path) -> Result<&str, String> {
    path.to_str()
        .ok_or_else(|| format!("invalid path (not valid UTF-8): {}", path.display()))
}

// Kills the child process when dropped, so an in-flight `uv` install does not
// outlive the app (or a cancelled command future).
struct ChildGuard(Option<CommandChild>);

impl Drop for ChildGuard {
    fn drop(&mut self) {
        if let Some(child) = self.0.take() {
            let _ = child.kill();
        }
    }
}

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
    lock(&state.0).push(entry.clone());
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

// ─── Log files (size-capped, one backup) ──────────────────────────────────────

const MAX_LOG_BYTES: u64 = 10 * 1024 * 1024;

static UV_LOG_BYTES: AtomicU64 = AtomicU64::new(0);
static RELINE_LOG_BYTES: AtomicU64 = AtomicU64::new(0);

fn debug_log_path() -> Option<PathBuf> {
    app_data_dir().ok().map(|d| d.join("uv_debug.log"))
}

fn reline_ws_log_path() -> Option<PathBuf> {
    app_data_dir().ok().map(|d| d.join("reline_ws.log"))
}

// When the file reaches the cap, rename it to `<name>.1` (replacing the previous
// backup) and start a fresh file.
fn rotate_log(path: &Path) {
    let mut backup = path.as_os_str().to_owned();
    backup.push(".1");
    let backup = PathBuf::from(backup);
    let _ = std::fs::remove_file(&backup);
    let _ = std::fs::rename(path, &backup);
}

fn append_log(path: &Path, bytes: &[u8], written: &AtomicU64) {
    let mut current = written.load(Ordering::Relaxed);
    if current == 0 {
        current = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    }
    if current >= MAX_LOG_BYTES {
        rotate_log(path);
        current = 0;
    }
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        if f.write_all(bytes).is_ok() {
            let _ = f.flush();
            written.store(current + bytes.len() as u64, Ordering::Relaxed);
        }
    }
}

fn append_debug_log(bytes: &[u8]) {
    if let Some(path) = debug_log_path() {
        append_log(&path, bytes, &UV_LOG_BYTES);
    }
}

fn append_debug_log_header(args: &[&str]) {
    if let Some(path) = debug_log_path() {
        let header = format!("\n=== uv {} ===\n", args.join(" "));
        append_log(&path, header.as_bytes(), &UV_LOG_BYTES);
    }
}

fn append_reline_ws_log(line: &str) {
    if let Some(path) = reline_ws_log_path() {
        let line_with_ts = format!("{} {}\n", timestamp(), line.trim_end());
        append_log(&path, line_with_ts.as_bytes(), &RELINE_LOG_BYTES);
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

fn app_data_dir() -> Result<PathBuf, String> {
    if let Some(base) = dirs::data_local_dir() {
        let dir = base.join("reline-configurator");
        if std::fs::create_dir_all(&dir).is_ok() {
            return Ok(dir);
        }
    }

    let exe_d = exe_dir()?;
    if is_dir_writable(&exe_d) {
        return Ok(exe_d);
    }

    Err("could not determine a writable data directory".to_string())
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
    static CACHE: OnceLock<bool> = OnceLock::new();
    *CACHE.get_or_init(detect_nvidia_gpu)
}

fn detect_nvidia_gpu() -> bool {
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
async fn check_versions(app: tauri::AppHandle, uv_path: Option<PathBuf>) -> DepsVersions {
    let empty = DepsVersions {
        torch_version: None,
        torch_cuda: false,
        resselt_version: None,
        reline_version: None,
    };

    let uv_path = match uv_path {
        Some(p) => p,
        None => match find_or_install_uv(&app).await {
            Ok(p) => p,
            Err(_) => return empty,
        },
    };

    let workspace = match get_workspace_path() {
        Ok(p) => p,
        Err(_) => return empty,
    };

    if !workspace.join(".venv").exists() {
        return empty;
    }

    let uv_str = match path_str(&uv_path) {
        Ok(s) => s,
        Err(_) => return empty,
    };

    let out = match app
        .shell()
        .command(uv_str)
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
        .command(path_str(uv_path)?)
        .args(final_args)
        .current_dir(workspace);

    let (mut rx, child) = cmd
        .spawn()
        .map_err(|e| format!("spawn failed: {e}"))?;
    let _guard = ChildGuard(Some(child));

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
            let clone_workspace = workspace.clone();
            let clone_result = tokio::task::spawn_blocking(move || {
                unsafe {
                    let _ = git2::opts::set_verify_owner_validation(false);
                }
                Repository::clone(repo_url, &clone_workspace)
            })
            .await
            .map_err(|e| format!("Clone task failed: {e}"))?;
            if let Err(e) = clone_result {
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
                .command(path_str(&uv_path)?)
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

    // First install: install the project itself in editable mode (also pulls deps).
    // "Update libs" (full = false): refresh only the dependencies from pyproject,
    // so the local project is never rebuilt/reinstalled.
    let install_args: &[&str] = if full {
        &["pip", "install", "-e", ".", "--index-strategy", "unsafe-best-match", "--no-cache", "--link-mode=copy"]
    } else {
        &["pip", "install", "-r", "pyproject.toml", "--index-strategy", "unsafe-best-match", "--no-cache", "--link-mode=copy"]
    };

    spawn_and_stream(&app, &uv_path, install_args, &workspace).await?;

    // Verify torch CUDA
    let versions = check_versions(app.clone(), Some(uv_path)).await;
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

fn handle_backend_event(app: &tauri::AppHandle, stopping: &AtomicBool, event: CommandEvent) {
    match event {
        CommandEvent::Stdout(line) => {
            let text = String::from_utf8_lossy(&line);
            append_reline_ws_log(&text);
            push_log(app, "stdout", &text);
        }
        CommandEvent::Stderr(line) => {
            let text = String::from_utf8_lossy(&line);
            append_reline_ws_log(&text);
            push_log(app, "stderr", &text);
        }
        CommandEvent::Terminated(status) => {
            if stopping.load(Ordering::SeqCst) {
                push_log(app, "info", "Backend stopped by user");
            } else {
                push_log(app, "error", &format!("Backend terminated: {:?}", status.code));
                emit_status(app, Stage::Error, "Backend process terminated unexpectedly", None);
            }
        }
        _ => {}
    }
}

#[tauri::command]
async fn initialize(
    app: tauri::AppHandle,
    backend_state: tauri::State<'_, BackendProcess>,
    port_state: tauri::State<'_, BackendPort>,
    port: Option<u16>,
) -> Result<(), String> {
    kill_backend(&app, &backend_state);
    *lock(&port_state.0) = None;

    let deps = check_deps_sync();
    if !deps.uv_installed || !deps.repo_cloned || !deps.venv_created || !deps.deps_installed {
        let msg = "Dependencies not installed. Please install them in Settings.";
        emit_status(&app, Stage::Error, msg, None);
        return Err(msg.into());
    }

    let workspace = get_workspace_path()?;
    let python_bin = venv_python(&workspace);

    let requested_port = port;

    if let Some(p) = requested_port {
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
    }

    let python_str = path_str(&python_bin)?;

    let mut attempts = 0u32;
    let (mut rx, child, port, first_events) = loop {
        let port = match requested_port {
            Some(p) => p,
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
            .command(python_str)
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

        // Collect early output for a short grace period. If the process dies
        // right away (e.g. the port was grabbed in between), retry with another
        // free port. Otherwise assume it is booting (importing torch can take a
        // while) and hand the buffered lines over to the log streamer.
        let deadline = std::time::Instant::now() + Duration::from_millis(1500);
        let mut buffered: Vec<CommandEvent> = Vec::new();
        let mut terminated = false;
        loop {
            let remaining = deadline.saturating_duration_since(std::time::Instant::now());
            if remaining.is_zero() {
                break;
            }
            match tokio::time::timeout(remaining, rx.recv()).await {
                Ok(Some(CommandEvent::Terminated(_))) => {
                    terminated = true;
                    break;
                }
                Ok(Some(event)) => buffered.push(event),
                Ok(None) => {
                    terminated = true;
                    break;
                }
                Err(_) => break,
            }
        }

        if terminated {
            let _ = child.kill();
            if requested_port.is_none() && attempts < 5 {
                attempts += 1;
                continue;
            }
            let msg = format!("Backend failed to start on port {port} (process exited)");
            emit_status(&app, Stage::Error, &msg, None);
            return Err(msg);
        }

        break (rx, child, port, buffered);
    };

    let stopping = Arc::new(AtomicBool::new(false));
    *lock(&backend_state.0) = Some(BackendHandle {
        child,
        stopping: stopping.clone(),
    });
    *lock(&port_state.0) = Some(port);

    emit_status(
        &app,
        Stage::Running,
        format!("Backend running on ws://127.0.0.1:{port}"),
        Some(port),
    );

    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        for event in first_events {
            handle_backend_event(&app_clone, &stopping, event);
        }
        while let Some(event) = rx.recv().await {
            handle_backend_event(&app_clone, &stopping, event);
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
    kill_backend(&app, &backend_state);
    *lock(&port_state.0) = None;
    emit_status(&app, Stage::Idle, "Backend stopped", None);
    Ok(())
}

#[tauri::command]
fn get_backend_port(state: tauri::State<'_, BackendPort>) -> Option<u16> {
    *lock(&state.0)
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

fn kill_backend(app: &tauri::AppHandle, state: &BackendProcess) {
    if let Some(handle) = lock(&state.0).take() {
        handle.stopping.store(true, Ordering::SeqCst);
        let _ = handle.child.kill();
        push_log(app, "info", "Backend process killed");
    }
}

// ─── Log commands ─────────────────────────────────────────────────────────────

#[tauri::command]
fn get_logs(state: tauri::State<'_, BackendLogs>) -> Vec<LogEntry> {
    lock(&state.0).clone()
}

#[tauri::command]
fn clear_logs(state: tauri::State<'_, BackendLogs>) {
    lock(&state.0).clear();
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
                let handle = window.app_handle();
                let backend = handle.state::<BackendProcess>();
                kill_backend(handle, &backend);
            }
        })
        .invoke_handler(tauri::generate_handler![
            initialize,
            stop_backend,
            get_backend_port,
            check_port_free,
            open_folder,
            open_url,
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
