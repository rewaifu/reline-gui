use std::net::TcpListener;
use tauri::Manager;

// ─── Splashscreen ─────────────────────────────────────────────────────────────

#[tauri::command]
pub(crate) fn show_main_window(app: tauri::AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
    if let Some(splash) = app.get_webview_window("splashscreen") {
        let _ = splash.close();
    }
}

// ─── Other commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub(crate) fn check_port_free(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

#[tauri::command]
pub(crate) fn open_folder(path: String) -> Result<(), String> {
    tauri_plugin_opener::open_path(&path, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn open_url(url: String) -> Result<(), String> {
    tauri_plugin_opener::open_url(&url, None::<&str>).map_err(|e| e.to_string())
}

// ─── Custom titlebar ──────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
pub(crate) fn use_custom_titlebar() -> bool {
    false
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn use_custom_titlebar() -> bool {
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
pub(crate) fn get_window_mode() -> bool {
    use_custom_titlebar()
}
