mod backend;
mod commands;
mod deps;
mod logging;
mod util;
mod uv;

use std::sync::Mutex;
use tauri::Manager;

use backend::{kill_backend, BackendPort, BackendProcess};
use commands::use_custom_titlebar;
use logging::BackendLogs;

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
            backend::initialize,
            backend::stop_backend,
            backend::get_backend_port,
            commands::check_port_free,
            commands::open_folder,
            commands::open_url,
            commands::get_window_mode,
            deps::check_deps,
            deps::check_versions,
            deps::install_deps,
            logging::get_logs,
            logging::clear_logs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
