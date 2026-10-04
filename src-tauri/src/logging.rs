use serde::Serialize;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;
use tauri::Manager;

use crate::util::{app_data_dir, lock};

// ─── Logs ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub(crate) struct LogEntry {
    timestamp: String,
    level: String,
    message: String,
}

pub(crate) struct BackendLogs(pub(crate) Mutex<Vec<LogEntry>>);

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

pub(crate) fn push_log(app: &tauri::AppHandle, level: &str, message: &str) {
    let entry = LogEntry {
        timestamp: timestamp(),
        level: level.to_string(),
        message: message.to_string(),
    };
    let state = app.state::<BackendLogs>();
    lock(&state.0).push(entry.clone());
    let _ = app.emit("backend-log", entry);
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

pub(crate) fn append_debug_log(bytes: &[u8]) {
    if let Some(path) = debug_log_path() {
        append_log(&path, bytes, &UV_LOG_BYTES);
    }
}

pub(crate) fn append_debug_log_header(args: &[&str]) {
    if let Some(path) = debug_log_path() {
        let header = format!("\n=== uv {} ===\n", args.join(" "));
        append_log(&path, header.as_bytes(), &UV_LOG_BYTES);
    }
}

pub(crate) fn append_reline_ws_log(line: &str) {
    if let Some(path) = reline_ws_log_path() {
        let line_with_ts = format!("{} {}\n", timestamp(), line.trim_end());
        append_log(&path, line_with_ts.as_bytes(), &RELINE_LOG_BYTES);
    }
}

// ─── Log commands ─────────────────────────────────────────────────────────────

#[tauri::command]
pub(crate) fn get_logs(state: tauri::State<'_, BackendLogs>) -> Vec<LogEntry> {
    lock(&state.0).clone()
}

#[tauri::command]
pub(crate) fn clear_logs(state: tauri::State<'_, BackendLogs>) {
    lock(&state.0).clear();
}
