// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, RunEvent};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub id: String,
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub children: Option<Vec<FileEntry>>,
}

fn read_dir_recursive(dir: &Path, max_depth: usize) -> Vec<FileEntry> {
    if max_depth == 0 {
        return Vec::new();
    }
    let mut entries = Vec::new();
    if let Ok(read_dir) = fs::read_dir(dir) {
        let mut items: Vec<_> = read_dir.filter_map(|e| e.ok()).collect();
        // Sort: directories first, then alphabetical
        items.sort_by(|a, b| {
            let a_is_dir = a.file_type().map(|t| t.is_dir()).unwrap_or(false);
            let b_is_dir = b.file_type().map(|t| t.is_dir()).unwrap_or(false);
            b_is_dir.cmp(&a_is_dir).then_with(|| a.file_name().cmp(&b.file_name()))
        });

        for item in items {
            let file_name = item.file_name().to_string_lossy().to_string();
            // Skip hidden files and build caches
            if file_name.starts_with('.') || file_name == "node_modules" || file_name == "target" || file_name == "dist" {
                continue;
            }
            let item_path = item.path();
            let is_dir = item_path.is_dir();
            let children = if is_dir {
                Some(read_dir_recursive(&item_path, max_depth - 1))
            } else {
                None
            };

            entries.push(FileEntry {
                id: item_path.to_string_lossy().to_string(),
                name: file_name,
                path: item_path.to_string_lossy().to_string(),
                is_directory: is_dir,
                children,
            });
        }
    }
    entries
}

#[tauri::command]
fn read_project_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err("Directory does not exist".to_string());
    }
    Ok(read_dir_recursive(p, 6))
}

// ---------------------------------------------------------------------------
// Python Agent Sidecar Management
// ---------------------------------------------------------------------------
pub struct SidecarState(pub Mutex<Option<Child>>);

fn normalize_path(path: &Path) -> PathBuf {
    use std::path::Component;
    let mut out = PathBuf::new();
    for comp in path.components() {
        match comp {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            _ => out.push(comp),
        }
    }
    out
}

fn find_agent_paths() -> Option<(PathBuf, PathBuf)> {
    // Check environment override first
    if let Ok(py_override) = std::env::var("AGENT_PYTHON_PATH") {
        let py_path = PathBuf::from(py_override);
        if py_path.exists() {
            let dir_path = py_path
                .parent()
                .and_then(|p| p.parent())
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| PathBuf::from("."));
            return Some((normalize_path(&py_path), normalize_path(&dir_path)));
        }
    }

    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));

    #[cfg(windows)]
    let python_subpath = "Scripts/python.exe";
    #[cfg(not(windows))]
    let python_subpath = "bin/python";

    let candidate_dirs = [
        "server",
        "../server",
        "../../server",
        "agent",
        "../agent",
        "../../agent",
    ];

    for dir_rel in candidate_dirs {
        let raw_dir = cwd.join(dir_rel);
        let raw_py = raw_dir.join(".venv").join(python_subpath);

        if raw_py.exists() && raw_dir.exists() {
            let dir_path = normalize_path(&raw_dir);
            let py_path = normalize_path(&raw_py);
            return Some((py_path, dir_path));
        }
    }
    None
}

fn start_sidecar() -> Result<Child, String> {
    if let Some((python_bin, srv_dir)) = find_agent_paths() {
        let module_name = if srv_dir.join("src").join("server").exists() {
            "server.server"
        } else {
            "agent.server"
        };
        eprintln!(
            "[Statikor Sidecar] Launching Python daemon: {:?} (module: {}) in {:?}",
            python_bin, module_name, srv_dir
        );
        Command::new(&python_bin)
            .args(["-m", module_name])
            .current_dir(&srv_dir)
            .env("PYTHONPATH", srv_dir.join("src"))
            .spawn()
            .map_err(|e| format!("Failed to spawn Python sidecar: {}", e))
    } else {
        eprintln!("[Statikor Sidecar] Sidecar venv not found. Attempting fallback 'python3 -m server.server'...");
        Command::new("python3")
            .args(["-m", "server.server"])
            .spawn()
            .map_err(|e| format!("Failed to spawn fallback python3: {}", e))
    }
}

#[tauri::command]
fn get_sidecar_status(state: tauri::State<SidecarState>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(child) = guard.as_mut() {
        match child.try_wait() {
            Ok(Some(status)) => Ok(format!("exited ({})", status)),
            Ok(None) => Ok("running".to_string()),
            Err(e) => Err(e.to_string()),
        }
    } else {
        Ok("not_started".to_string())
    }
}

fn main() {
    let sidecar_child = match start_sidecar() {
        Ok(child) => {
            eprintln!("[Statikor Sidecar] Sidecar started successfully (PID: {})", child.id());
            Some(child)
        }
        Err(e) => {
            eprintln!("[Statikor Sidecar] Notice: Sidecar auto-launch skipped or failed: {}", e);
            eprintln!("[Statikor Sidecar] You can run the agent manually: `cd agent && uv run start-agent`");
            None
        }
    };

    let app = tauri::Builder::default()
        .manage(SidecarState(Mutex::new(sidecar_child)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            read_project_directory,
            get_sidecar_status
        ])
        .build(tauri::generate_context!())
        .expect("error while building structural agent client application");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            // Clean up: terminate the background Python process when Tauri quits
            if let Some(state) = app_handle.try_state::<SidecarState>() {
                if let Ok(mut guard) = state.0.lock() {
                    if let Some(mut child) = guard.take() {
                        eprintln!("[Statikor Sidecar] Shutting down Python daemon...");
                        let _ = child.kill();
                    }
                }
            }
        }
    });
}
