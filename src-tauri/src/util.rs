use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri_plugin_shell::process::CommandChild;

// ─── Small helpers ────────────────────────────────────────────────────────────

pub(crate) fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

pub(crate) fn path_str(path: &Path) -> Result<&str, String> {
    path.to_str()
        .ok_or_else(|| format!("invalid path (not valid UTF-8): {}", path.display()))
}

// Kills the child process when dropped, so an in-flight `uv` install does not
// outlive the app (or a cancelled command future).
pub(crate) struct ChildGuard(pub(crate) Option<CommandChild>);

impl Drop for ChildGuard {
    fn drop(&mut self) {
        if let Some(child) = self.0.take() {
            let _ = child.kill();
        }
    }
}

// ─── Paths ────────────────────────────────────────────────────────────────────

fn exe_dir() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("failed to get current exe: {e}"))?;
    exe.parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "failed to get exe parent dir".to_string())
}

pub(crate) fn app_data_dir() -> Result<PathBuf, String> {
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

pub(crate) fn get_workspace_path() -> Result<PathBuf, String> {
    Ok(app_data_dir()?.join("reline_ws"))
}

pub(crate) fn venv_python(workspace: &PathBuf) -> PathBuf {
    if cfg!(windows) {
        workspace.join(".venv").join("Scripts").join("python.exe")
    } else {
        workspace.join(".venv").join("bin").join("python")
    }
}

pub(crate) fn uvicorn_path(workspace: &PathBuf) -> PathBuf {
    if cfg!(windows) {
        workspace.join(".venv").join("Scripts").join("uvicorn.exe")
    } else {
        workspace.join(".venv").join("bin").join("uvicorn")
    }
}

pub(crate) fn find_free_port(start: u16, end: u16) -> Option<u16> {
    (start..=end).find(|&port| TcpListener::bind(("127.0.0.1", port)).is_ok())
}
