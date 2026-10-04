use regex::Regex;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::Emitter;
use tokio::fs;

use crate::logging::push_log;
use crate::util::app_data_dir;

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

pub(crate) fn emit_uv_progress(app: &tauri::AppHandle, stage: &str, current: u32, total: u32, raw_message: String) {
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

pub(crate) fn parse_and_emit_uv_progress(app: &tauri::AppHandle, raw_line: &str) {
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

// ─── UV ───────────────────────────────────────────────────────────────────────

const UV_VERSION: &str = "0.10.4";

pub(crate) fn uv_platform() -> Option<(&'static str, &'static str, &'static str)> {
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

pub(crate) fn uv_in_path() -> Option<PathBuf> {
    which::which("uv").ok()
}

pub(crate) fn uv_local_path(subdir: &str, bin_name: &str) -> Result<PathBuf, String> {
    Ok(app_data_dir()?.join("uv_bin").join(subdir).join(bin_name))
}

pub(crate) async fn find_or_install_uv(app: &tauri::AppHandle) -> Result<PathBuf, String> {
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

pub(crate) fn check_nvidia_gpu() -> bool {
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
