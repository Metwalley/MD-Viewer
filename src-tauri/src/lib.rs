use encoding_rs::WINDOWS_1256;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WindowEvent};
use tauri_plugin_dialog::DialogExt;

pub struct StartupPaths(pub Mutex<Vec<String>>);

#[derive(Serialize)]
pub struct LoadedFile {
    pub path: String,
    pub name: String,
    pub content: String,
    pub encoding: String,
}

fn is_markdown(p: &str) -> bool {
    matches!(
        PathBuf::from(p)
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .as_deref(),
        Some("md") | Some("markdown") | Some("mdx")
    )
}

fn read_file(path: &str) -> Result<LoadedFile, String> {
    let bytes = fs::read(path).map_err(|e| format!("{path}: {e}"))?;
    let (content, encoding) = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        (String::from_utf8_lossy(&bytes[3..]).into_owned(), "UTF-8 BOM")
    } else {
        match String::from_utf8(bytes.clone()) {
            Ok(s) => (s, "UTF-8"),
            Err(_) => {
                let (decoded, _, had_errors) = WINDOWS_1256.decode(&bytes);
                if had_errors {
                    let (fallback, _, _) = encoding_rs::WINDOWS_1252.decode(&bytes);
                    (fallback.into_owned(), "Windows-1252")
                } else {
                    (decoded.into_owned(), "Windows-1256")
                }
            }
        }
    };
    let name = PathBuf::from(path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string());
    Ok(LoadedFile {
        path: path.to_string(),
        name,
        content,
        encoding: encoding.to_string(),
    })
}

#[tauri::command]
async fn open_dialog(app: AppHandle) -> Result<Option<LoadedFile>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("Markdown files", &["md", "markdown", "mdx"])
        .add_filter("All files", &["*"])
        .blocking_pick_file();
    match picked {
        Some(f) => {
            let p = f.into_path().map_err(|e| e.to_string())?;
            Ok(Some(read_file(&p.to_string_lossy())?))
        }
        None => Ok(None),
    }
}

#[tauri::command]
async fn read_markdown(path: String) -> Result<LoadedFile, String> {
    read_file(&path)
}

#[tauri::command]
async fn save_markdown(path: String, content: String, bom: bool) -> Result<(), String> {
    let mut data = content.into_bytes();
    if bom {
        let mut prefixed = vec![0xEF, 0xBB, 0xBF];
        prefixed.extend_from_slice(&data);
        data = prefixed;
    }
    fs::write(&path, data).map_err(|e| format!("{path}: {e}"))
}

#[tauri::command]
async fn open_external(url: String) -> Result<(), String> {
    let allowed =
        url.starts_with("http://") || url.starts_with("https://") || url.starts_with("mailto:");
    if !allowed {
        return Err("Only http(s) and mailto links can be opened".into());
    }
    open::that_detached(url).map_err(|e| e.to_string())
}

#[tauri::command]
fn initial_paths(state: State<'_, StartupPaths>) -> Vec<String> {
    state.0.lock().unwrap().drain(..).collect()
}

fn emit_paths(app: &AppHandle, paths: Vec<String>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.emit("open-paths", paths);
    }
}

pub fn run() {
    let startup: Vec<String> = std::env::args()
        .skip(1)
        .filter(|a| is_markdown(a))
        .collect();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let paths: Vec<String> = argv
                .iter()
                .skip(1)
                .filter(|a| is_markdown(a))
                .cloned()
                .collect();
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
            if !paths.is_empty() {
                emit_paths(app, paths);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(StartupPaths(Mutex::new(startup)))
        .invoke_handler(tauri::generate_handler![
            open_dialog,
            read_markdown,
            save_markdown,
            open_external,
            initial_paths
        ])
        .build(tauri::generate_context!())
        .expect("failed to build MD-Viewer")
        .run(|app, event| {
            if let RunEvent::WindowEvent {
                event: WindowEvent::DragDrop(drag),
                ..
            } = event
            {
                if let tauri::DragDropEvent::Drop { paths, .. } = drag {
                    let md: Vec<String> = paths
                        .iter()
                        .map(|p| p.to_string_lossy().into_owned())
                        .filter(|p| is_markdown(p))
                        .collect();
                    if !md.is_empty() {
                        emit_paths(app, md);
                    }
                }
            }
        });
}
