use git2::Repository;
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri_plugin_shell::ShellExt;

use crate::backend::{emit_status, kill_backend, BackendPort, BackendProcess, Stage};
use crate::logging::{append_debug_log, append_debug_log_header, push_log};
use crate::util::{app_data_dir, get_workspace_path, lock, path_str, uvicorn_path, ChildGuard};
use crate::uv::{
    check_nvidia_gpu, emit_uv_progress, find_or_install_uv, parse_and_emit_uv_progress, uv_in_path,
    uv_local_path, uv_platform,
};

// ─── Deps status / versions ───────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub(crate) struct DepsStatus {
    pub(crate) uv_installed: bool,
    pub(crate) repo_cloned: bool,
    pub(crate) venv_created: bool,
    pub(crate) deps_installed: bool,
    pub(crate) has_nvidia_gpu: bool,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct DepsVersions {
    torch_version: Option<String>,
    torch_cuda: bool,
    resselt_version: Option<String>,
    reline_version: Option<String>,
}

pub(crate) fn check_deps_sync() -> DepsStatus {
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
pub(crate) async fn check_deps() -> DepsStatus {
    // check_deps_sync() runs blocking console subprocesses for the NVIDIA probe;
    // keep it off the IPC/main thread so it can't stall the UI.
    tokio::task::spawn_blocking(check_deps_sync)
        .await
        .unwrap_or(DepsStatus {
            uv_installed: false,
            repo_cloned: false,
            venv_created: false,
            deps_installed: false,
            has_nvidia_gpu: false,
        })
}

#[tauri::command]
pub(crate) async fn check_versions(app: tauri::AppHandle, uv_path: Option<PathBuf>) -> DepsVersions {
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

// ─── Cleanup / size ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone, Default)]
pub(crate) struct CleanupInfo {
    /// Bytes used by the cloned `reline_ws` repository (incl. `.venv`).
    pub(crate) workspace_bytes: u64,
    /// Bytes used by the app-managed `uv` download. Zero when a system `uv` is used.
    pub(crate) uv_bin_bytes: u64,
    pub(crate) total_bytes: u64,
    /// Whether `uv_bin` is part of the computation (i.e. no system `uv` is present).
    pub(crate) includes_uv_bin: bool,
}

fn dir_size(path: &Path) -> u64 {
    if !path.exists() {
        return 0;
    }
    if path.is_file() {
        return std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    }
    let entries = match std::fs::read_dir(path) {
        Ok(e) => e,
        Err(_) => return 0,
    };
    let mut total = 0u64;
    for entry in entries.flatten() {
        match entry.file_type() {
            Ok(ft) if ft.is_dir() => total += dir_size(&entry.path()),
            Ok(_) => total += entry.metadata().map(|m| m.len()).unwrap_or(0),
            Err(_) => {}
        }
    }
    total
}

fn uv_bin_dir() -> Option<PathBuf> {
    app_data_dir().ok().map(|d| d.join("uv_bin"))
}

fn compute_cleanup_info() -> CleanupInfo {
    let workspace = get_workspace_path().unwrap_or_else(|_| PathBuf::from(""));
    let workspace_bytes = dir_size(&workspace);
    let includes_uv_bin = uv_in_path().is_none();
    let uv_bin_bytes = if includes_uv_bin {
        uv_bin_dir().map(|d| dir_size(&d)).unwrap_or(0)
    } else {
        0
    };

    CleanupInfo {
        workspace_bytes,
        uv_bin_bytes,
        total_bytes: workspace_bytes + uv_bin_bytes,
        includes_uv_bin,
    }
}

/// Returns how much disk space the removable dependencies currently occupy.
#[tauri::command]
pub(crate) async fn get_cleanup_size() -> CleanupInfo {
    tokio::task::spawn_blocking(compute_cleanup_info)
        .await
        .unwrap_or_default()
}

/// Stops the backend and removes the heavy dependency folders (`reline_ws` and,
/// when no system `uv` is used, `uv_bin`). Logs and other app data are kept.
#[tauri::command]
pub(crate) async fn cleanup_deps(
    app: tauri::AppHandle,
    backend_state: tauri::State<'_, BackendProcess>,
    port_state: tauri::State<'_, BackendPort>,
) -> Result<CleanupInfo, String> {
    kill_backend(&app, &backend_state);
    *lock(&port_state.0) = None;

    let workspace = get_workspace_path()?;
    let remove_uv = uv_in_path().is_none();
    let uv_dir = uv_bin_dir();

    match tokio::task::spawn_blocking(move || -> Result<(), String> {
        if workspace.exists() {
            std::fs::remove_dir_all(&workspace)
                .map_err(|e| format!("Failed to remove workspace: {e}"))?;
        }
        if remove_uv {
            if let Some(dir) = uv_dir {
                if dir.exists() {
                    std::fs::remove_dir_all(&dir)
                        .map_err(|e| format!("Failed to remove uv: {e}"))?;
                }
            }
        }
        Ok(())
    })
    .await
    {
        Ok(Ok(())) => {}
        Ok(Err(e)) => {
            emit_status(&app, Stage::Error, &e, None);
            return Err(e);
        }
        Err(e) => {
            let msg = format!("cleanup task failed: {e}");
            emit_status(&app, Stage::Error, &msg, None);
            return Err(msg);
        }
    }

    push_log(&app, "info", "Dependencies removed");
    emit_status(&app, Stage::Idle, "Dependencies removed", None);

    Ok(tokio::task::spawn_blocking(compute_cleanup_info)
        .await
        .unwrap_or_default())
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
pub(crate) async fn install_deps(app: tauri::AppHandle, full: bool) -> Result<(), String> {
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
