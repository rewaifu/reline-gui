use serde::Serialize;
use std::net::TcpListener;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::Emitter;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

use crate::deps::check_deps_sync;
use crate::logging::{append_reline_ws_log, push_log};
use crate::util::{find_free_port, get_workspace_path, lock, path_str, venv_python};

// ─── Stage / Status ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Stage {
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

pub(crate) fn emit_status(
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

// ─── State ────────────────────────────────────────────────────────────────────

pub(crate) struct BackendProcess(pub(crate) Mutex<Option<BackendHandle>>);
pub(crate) struct BackendPort(pub(crate) Mutex<Option<u16>>);

pub(crate) struct BackendHandle {
    pub(crate) child: CommandChild,
    pub(crate) stopping: Arc<AtomicBool>,
}

pub(crate) fn kill_backend(app: &tauri::AppHandle, state: &BackendProcess) {
    if let Some(handle) = lock(&state.0).take() {
        handle.stopping.store(true, Ordering::SeqCst);
        let _ = handle.child.kill();
        push_log(app, "info", "Backend process killed");
    }
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
pub(crate) async fn initialize(
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
        let deadline = Instant::now() + Duration::from_millis(1500);
        let mut buffered: Vec<CommandEvent> = Vec::new();
        let mut terminated = false;
        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
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

// ─── Backend commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub(crate) fn stop_backend(
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
pub(crate) fn get_backend_port(state: tauri::State<'_, BackendPort>) -> Option<u16> {
    *lock(&state.0)
}
