use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tokio::io::AsyncWriteExt;

use crate::util::lock;

const MODELS_URL: &str = "https://mdb.yor.ovh/v1/files";
const PROGRESS_EVENT: &str = "model-download-progress";

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct RemoteModel {
    pub(crate) filename: String,
    pub(crate) name: String,
    pub(crate) ext: String,
    #[serde(default)]
    pub(crate) size: u64,
    pub(crate) url: String,
}

#[derive(Debug, Serialize, Clone)]
struct DownloadProgress {
    filename: String,
    progress: u8,
    downloaded: u64,
    total: u64,
    stage: &'static str,
}

// ─── State ────────────────────────────────────────────────────────────────────

#[derive(Default)]
pub(crate) struct ModelDownloads(pub(crate) Mutex<HashMap<String, Arc<AtomicBool>>>);

fn emit_progress(app: &tauri::AppHandle, filename: &str, progress: u8, downloaded: u64, total: u64, stage: &'static str) {
    let _ = app.emit(
        PROGRESS_EVENT,
        DownloadProgress {
            filename: filename.to_string(),
            progress,
            downloaded,
            total,
            stage,
        },
    );
}

// ─── Commands ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub(crate) async fn list_remote_models() -> Result<Vec<RemoteModel>, String> {
    let client = reqwest::Client::new();
    let resp = client.get(MODELS_URL).send().await.map_err(|e| {
        if e.is_connect() || e.is_timeout() || e.is_request() {
            format!("No internet connection: {e}")
        } else {
            e.to_string()
        }
    })?;

    if !resp.status().is_success() {
        return Err(format!("Failed to fetch models list: HTTP {}", resp.status()));
    }

    resp.json::<Vec<RemoteModel>>().await.map_err(|e| format!("Failed to parse models list: {e}"))
}

#[tauri::command]
pub(crate) async fn download_model(
    app: tauri::AppHandle,
    state: tauri::State<'_, ModelDownloads>,
    url: String,
    filename: String,
    target_dir: String,
) -> Result<String, String> {
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut map = lock(&state.0);
        if map.contains_key(&filename) {
            return Err("This model is already downloading".to_string());
        }
        map.insert(filename.clone(), cancel.clone());
    }

    let result = do_download(&app, &url, &filename, &target_dir, &cancel).await;

    lock(&state.0).remove(&filename);

    result
}

#[tauri::command]
pub(crate) fn cancel_model_download(state: tauri::State<'_, ModelDownloads>, filename: String) -> Result<(), String> {
    if let Some(flag) = lock(&state.0).get(&filename) {
        flag.store(true, Ordering::SeqCst);
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn delete_model(folder: String, model_name: String) -> Result<(), String> {
    let dir = PathBuf::from(folder);
    let mut deleted = false;
    for ext in [".pth", ".safetensors"] {
        let path = dir.join(format!("{model_name}{ext}"));
        if path.exists() {
            std::fs::remove_file(&path).map_err(|e| format!("Failed to delete {}: {e}", path.display()))?;
            deleted = true;
        }
    }
    if !deleted {
        return Err(format!("Model {model_name} not found"));
    }
    Ok(())
}

// ─── Download implementation ──────────────────────────────────────────────────

fn is_cancelled(cancel: &AtomicBool) -> bool {
    cancel.load(Ordering::SeqCst)
}

async fn do_download(
    app: &tauri::AppHandle,
    url: &str,
    filename: &str,
    target_dir: &str,
    cancel: &AtomicBool,
) -> Result<String, String> {
    let target = PathBuf::from(target_dir);
    tokio::fs::create_dir_all(&target)
        .await
        .map_err(|e| format!("Failed to create models folder: {e}"))?;

    let client = reqwest::Client::new();
    let mut resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to download {filename}: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Failed to download {filename}: HTTP {}", resp.status()));
    }

    let total = resp.content_length().unwrap_or(0);
    let tmp_path = std::env::temp_dir().join(filename);

    emit_progress(app, filename, 0, 0, total, "downloading");

    let mut file = tokio::fs::File::create(&tmp_path)
        .await
        .map_err(|e| format!("Failed to create temp file: {e}"))?;

    let mut downloaded: u64 = 0;
    let mut last_percent: i64 = -1;

    while let Some(chunk) = resp.chunk().await.map_err(|e| format!("Download interrupted: {e}"))? {
        if is_cancelled(cancel) {
            drop(file);
            let _ = tokio::fs::remove_file(&tmp_path).await;
            return Err("cancelled".to_string());
        }

        downloaded += chunk.len() as u64;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Failed to write to temp file: {e}"))?;

        let percent = if total > 0 { ((downloaded * 100) / total) as i64 } else { 0 };
        if percent != last_percent {
            last_percent = percent;
            emit_progress(app, filename, percent.clamp(0, 100) as u8, downloaded, total, "downloading");
        }
    }

    file.flush().await.map_err(|e| format!("Failed to flush temp file: {e}"))?;
    drop(file);

    if is_cancelled(cancel) {
        let _ = tokio::fs::remove_file(&tmp_path).await;
        return Err("cancelled".to_string());
    }

    let res = if filename.ends_with(".tar.xz") {
        emit_progress(app, filename, 100, downloaded, total, "extracting");
        let tmp = tmp_path.clone();
        let base = filename.trim_end_matches(".tar.xz").to_string();
        let dest_dir = target.clone();
        let extracted = tokio::task::spawn_blocking(move || extract_tar_xz(&tmp, &dest_dir, &base))
            .await
            .map_err(|e| format!("Extraction task failed: {e}"))?;
        let _ = tokio::fs::remove_file(&tmp_path).await;
        extracted
    } else if filename.ends_with(".pth") || filename.ends_with(".safetensors") {
        let dest = target.join(filename);
        tokio::fs::copy(&tmp_path, &dest)
            .await
            .map_err(|e| format!("Failed to move model file: {e}"))?;
        let _ = tokio::fs::remove_file(&tmp_path).await;
        Ok(dest)
    } else {
        let _ = tokio::fs::remove_file(&tmp_path).await;
        Err(format!("Unsupported file format: {filename}"))
    };

    res.map(|p| p.to_string_lossy().to_string())
}

fn extract_tar_xz(tmp_path: &Path, dest_dir: &Path, base: &str) -> Result<PathBuf, String> {
    let file = std::fs::File::open(tmp_path).map_err(|e| format!("Failed to open archive: {e}"))?;
    let decoder = xz2::read::XzDecoder::new(file);
    let mut archive = tar::Archive::new(decoder);

    let entries = archive.entries().map_err(|e| format!("Failed to read archive: {e}"))?;
    for entry in entries {
        let mut entry = entry.map_err(|e| format!("Failed to read archive entry: {e}"))?;
        let path = entry.path().map_err(|e| format!("Invalid archive entry path: {e}"))?.into_owned();
        let name = path.to_string_lossy();
        if name.ends_with(".pth") || name.ends_with(".safetensors") {
            let ext = path
                .extension()
                .map(|e| format!(".{}", e.to_string_lossy()))
                .ok_or_else(|| "Missing model file extension".to_string())?;
            let dest = dest_dir.join(format!("{base}{ext}"));
            let mut out = std::fs::File::create(&dest).map_err(|e| format!("Failed to create {}: {e}", dest.display()))?;
            std::io::copy(&mut entry, &mut out).map_err(|e| format!("Failed to extract model: {e}"))?;
            return Ok(dest);
        }
    }

    Err(format!("No model file (.pth or .safetensors) found in {base}.tar.xz"))
}
