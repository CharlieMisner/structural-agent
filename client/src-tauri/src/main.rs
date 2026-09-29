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

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ToolConfig {
    pub id: String,
    pub name: String,
    pub authenticated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_expires_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub added_at: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfig {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<ToolConfig>>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ForteTokenResponse {
    pub access_token: String,
    #[serde(rename = "accessToken")]
    pub access_token_alias: String,
    #[serde(default)]
    pub token_type: Option<String>,
    #[serde(default, rename = "tokenType")]
    pub token_type_alias: Option<String>,
    #[serde(default)]
    pub expires_in: Option<i64>,
    #[serde(default, rename = "expiresIn")]
    pub expires_in_alias: Option<i64>,
    #[serde(default)]
    pub username: Option<String>,
}

fn generate_uuid_v4() -> String {
    use std::fs::File;
    use std::io::Read;
    let mut bytes = [0u8; 16];
    let mut filled = false;
    if let Ok(mut f) = File::open("/dev/urandom") {
        if f.read_exact(&mut bytes).is_ok() {
            filled = true;
        }
    }
    if !filled {
        use std::time::{SystemTime, UNIX_EPOCH};
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        for (i, b) in bytes.iter_mut().enumerate() {
            *b = ((now >> (i * 7)) & 0xff) as u8 ^ ((i as u8) * 31);
        }
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 1 (RFC 4122)
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3],
        bytes[4], bytes[5],
        bytes[6], bytes[7],
        bytes[8], bytes[9],
        bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
    )
}

fn ensure_statikor_project(root_dir: &Path) -> Result<ProjectConfig, String> {
    let statikor_dir = root_dir.join(".statikor");
    let project_file = statikor_dir.join("project.json");

    if project_file.exists() {
        if let Ok(content) = fs::read_to_string(&project_file) {
            if let Ok(config) = serde_json::from_str::<ProjectConfig>(&content) {
                if !config.id.trim().is_empty() {
                    return Ok(config);
                }
            }
        }
    }

    // Create .statikor directory if it doesn't exist
    fs::create_dir_all(&statikor_dir)
        .map_err(|e| format!("Failed to create .statikor folder: {}", e))?;

    let new_id = generate_uuid_v4();
    let config = ProjectConfig {
        id: new_id,
        tools: Some(Vec::new()),
    };

    let json_content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize project config: {}", e))?;

    fs::write(&project_file, json_content)
        .map_err(|e| format!("Failed to write project.json: {}", e))?;

    eprintln!("[Statikor Project] Initialized .statikor/project.json (id: {})", config.id);
    Ok(config)
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
            // Skip hidden files (including .statikor) and build caches
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

    // Automatically ensure .statikor/project.json exists with UUID
    if let Err(e) = ensure_statikor_project(p) {
        eprintln!("[Statikor Project] Notice: Could not initialize .statikor/project.json: {}", e);
    }

    Ok(read_dir_recursive(p, 6))
}

#[tauri::command]
fn get_project_config(path: String) -> Result<ProjectConfig, String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err("Directory does not exist".to_string());
    }
    ensure_statikor_project(p)
}

#[tauri::command]
fn create_file(path: String) -> Result<FileEntry, String> {
    let p = Path::new(&path);
    if p.exists() {
        return Err("File or directory already exists".to_string());
    }
    if let Some(parent) = p.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent directories: {}", e))?;
        }
    }
    fs::File::create(p).map_err(|e| format!("Failed to create file: {}", e))?;

    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unnamed".to_string());

    Ok(FileEntry {
        id: path.clone(),
        name,
        path,
        is_directory: false,
        children: None,
    })
}

#[tauri::command]
fn create_directory(path: String) -> Result<FileEntry, String> {
    let p = Path::new(&path);
    if p.exists() {
        return Err("File or directory already exists".to_string());
    }
    fs::create_dir_all(p).map_err(|e| format!("Failed to create directory: {}", e))?;

    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unnamed".to_string());

    Ok(FileEntry {
        id: path.clone(),
        name,
        path,
        is_directory: true,
        children: Some(Vec::new()),
    })
}

#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("Path does not exist".to_string());
    }
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| format!("Failed to remove directory: {}", e))?;
    } else {
        fs::remove_file(p).map_err(|e| format!("Failed to remove file: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn save_project_tool(project_path: String, tool: ToolConfig) -> Result<ProjectConfig, String> {
    let p = Path::new(&project_path);
    let mut config = ensure_statikor_project(p)?;
    let mut tools = config.tools.unwrap_or_default();

    if let Some(existing) = tools.iter_mut().find(|t| t.id == tool.id) {
        *existing = tool;
    } else {
        tools.push(tool);
    }

    config.tools = Some(tools);

    let statikor_dir = p.join(".statikor");
    let project_file = statikor_dir.join("project.json");
    let json_content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize project config: {}", e))?;
    fs::write(&project_file, json_content)
        .map_err(|e| format!("Failed to write project.json: {}", e))?;

    Ok(config)
}

fn get_fallback_credentials_file() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Could not find home directory".to_string())?;
    let statikor_home = PathBuf::from(home).join(".statikor");
    if !statikor_home.exists() {
        let _ = fs::create_dir_all(&statikor_home);
    }
    Ok(statikor_home.join("credentials.json"))
}

#[tauri::command]
fn store_keychain_secret(service: String, account: String, secret: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("security")
            .args(["add-generic-password", "-s", &service, "-a", &account, "-w", &secret, "-U"])
            .output();
        if let Ok(out) = output {
            if out.status.success() {
                return Ok(());
            }
        }
    }

    // Fallback storage in ~/.statikor/credentials.json
    if let Ok(file_path) = get_fallback_credentials_file() {
        let mut map: serde_json::Map<String, serde_json::Value> = if file_path.exists() {
            fs::read_to_string(&file_path)
                .ok()
                .and_then(|c| serde_json::from_str(&c).ok())
                .unwrap_or_default()
        } else {
            serde_json::Map::new()
        };
        let key = format!("{}:{}", service, account);
        map.insert(key, serde_json::Value::String(secret));
        if let Ok(json_str) = serde_json::to_string_pretty(&map) {
            let _ = fs::write(&file_path, json_str);
        }
        return Ok(());
    }

    Err("Failed to store credentials".to_string())
}

#[tauri::command]
fn get_keychain_secret(service: String, account: String) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("security")
            .args(["find-generic-password", "-s", &service, "-a", &account, "-w"])
            .output();
        if let Ok(out) = output {
            if out.status.success() {
                let token = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !token.is_empty() {
                    return Ok(token);
                }
            }
        }
    }

    // Fallback retrieval from ~/.statikor/credentials.json
    if let Ok(file_path) = get_fallback_credentials_file() {
        if file_path.exists() {
            if let Ok(content) = fs::read_to_string(&file_path) {
                if let Ok(map) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&content) {
                    let key = format!("{}:{}", service, account);
                    if let Some(val) = map.get(&key).and_then(|v| v.as_str()) {
                        return Ok(val.to_string());
                    }
                }
            }
        }
    }

    Err("Secret not found in Keychain or local credentials store".to_string())
}

#[tauri::command]
fn delete_keychain_secret(service: String, account: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("security")
            .args(["delete-generic-password", "-s", &service, "-a", &account])
            .output();
    }
    if let Ok(file_path) = get_fallback_credentials_file() {
        if file_path.exists() {
            if let Ok(content) = fs::read_to_string(&file_path) {
                if let Ok(mut map) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&content) {
                    let key = format!("{}:{}", service, account);
                    map.remove(&key);
                    if let Ok(json_str) = serde_json::to_string_pretty(&map) {
                        let _ = fs::write(&file_path, json_str);
                    }
                }
            }
        }
    }
    Ok(())
}

fn url_encode_component(s: &str, keep_at: bool) -> String {
    let mut out = String::with_capacity(s.len() * 2);
    for b in s.bytes() {
        match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            b'@' if keep_at => {
                out.push('@');
            }
            _ => {
                out.push_str(&format!("%{:02X}", b));
            }
        }
    }
    out
}

#[tauri::command]
fn authenticate_forteweb(username: String, password: String) -> Result<ForteTokenResponse, String> {
    let enc_user = url_encode_component(&username, true);
    let enc_pass = url_encode_component(&password, false);
    let body = format!("grant_type=password&username={}&password={}", enc_user, enc_pass);
    eprintln!("[Statikor Forte Auth] Authenticating for user: {}", enc_user);

    let output = Command::new("curl")
        .args([
            "-s",
            "--url", "https://fortewebapi-production.azurewebsites.net/token",
            "-H", "accept: application/json, text/plain, */*",
            "-H", "accept-language: en-US",
            "-H", "cache-control: no-cache",
            "-H", "content-type: text/plain",
            "-H", "origin: https://forteweb.com",
            "-H", "pragma: no-cache",
            "-H", "priority: u=1, i",
            "-H", "referer: https://forteweb.com/",
            "-H", "sec-ch-ua: \"Google Chrome\";v=\"153\", \"Not_A Brand\";v=\"8\", \"Chromium\";v=\"153\"",
            "-H", "sec-ch-ua-mobile: ?0",
            "-H", "sec-ch-ua-platform: \"macOS\"",
            "-H", "sec-fetch-dest: empty",
            "-H", "sec-fetch-mode: cors",
            "-H", "sec-fetch-site: cross-site",
            "-H", "user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
            "--data-raw", &body,
        ])
        .output()
        .map_err(|e| format!("Failed to execute curl: {}", e))?;

    let response_str = String::from_utf8_lossy(&output.stdout).to_string();
    eprintln!("[Statikor Forte Auth] Response: {}", response_str);

    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&response_str) {
        if let Some(token) = val.get("access_token").and_then(|t| t.as_str()) {
            let expires_in = val.get("expires_in").and_then(|e| e.as_i64()).unwrap_or(86400);
            let token_type = val.get("token_type").and_then(|t| t.as_str()).map(|s| s.to_string());
            let user_name = val.get("userName").or_else(|| val.get("username")).and_then(|u| u.as_str()).map(|s| s.to_string()).unwrap_or_else(|| username.clone());
            return Ok(ForteTokenResponse {
                access_token: token.to_string(),
                access_token_alias: token.to_string(),
                token_type: token_type.clone(),
                token_type_alias: token_type,
                expires_in: Some(expires_in),
                expires_in_alias: Some(expires_in),
                username: Some(user_name),
            });
        }
        if let Some(err_desc) = val.get("error_description").and_then(|e| e.as_str()) {
            return Err(err_desc.to_string());
        }
        if let Some(err) = val.get("error").and_then(|e| e.as_str()) {
            return Err(err.to_string());
        }
    }

    if response_str.contains("not allowed by policy") || response_str.trim().is_empty() {
        return Err(format!("Forte server rejected request: {}", response_str));
    }

    Err(format!("Authentication failed: {}", response_str))
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
    // Check environment override first (SERVER_PYTHON_PATH or AGENT_PYTHON_PATH)
    if let Ok(py_override) = std::env::var("SERVER_PYTHON_PATH").or_else(|_| std::env::var("AGENT_PYTHON_PATH")) {
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

fn free_port_if_in_use(port: u16) {
    #[cfg(unix)]
    {
        if let Ok(output) = Command::new("lsof").args(["-ti", &format!(":{}", port)]).output() {
            let pids_str = String::from_utf8_lossy(&output.stdout);
            for pid_str in pids_str.split_whitespace() {
                if let Ok(pid) = pid_str.parse::<i32>() {
                    eprintln!("[Statikor Sidecar] Releasing port {}: terminating stale PID {}", port, pid);
                    let _ = Command::new("kill").args(["-9", &pid.to_string()]).output();
                }
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(300));
    }
    #[cfg(windows)]
    {
        let _ = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &format!("Get-NetTCPConnection -LocalPort {} -ErrorAction SilentlyContinue | ForEach-Object {{ Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }}", port)
            ])
            .output();
        std::thread::sleep(std::time::Duration::from_millis(300));
    }
}

fn start_sidecar() -> Result<Child, String> {
    // Guarantee port 41420 is completely free before spawning
    free_port_if_in_use(41420);

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
        let mut cmd = Command::new(&python_bin);
        cmd.args(["-m", module_name])
            .current_dir(&srv_dir)
            .env("PYTHONPATH", srv_dir.join("src"));

        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }

        cmd.spawn()
            .map_err(|e| format!("Failed to spawn Python sidecar: {}", e))
    } else {
        eprintln!("[Statikor Sidecar] Sidecar venv not found. Attempting fallback 'python3 -m server.server'...");
        let mut cmd = Command::new("python3");
        cmd.args(["-m", "server.server"]);

        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }

        cmd.spawn()
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
            eprintln!("[Statikor Sidecar] You can run the server manually: `cd server && uv run start-server`");
            None
        }
    };

    let app = tauri::Builder::default()
        .manage(SidecarState(Mutex::new(sidecar_child)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            read_project_directory,
            get_project_config,
            get_sidecar_status,
            create_file,
            create_directory,
            delete_path,
            save_project_tool,
            store_keychain_secret,
            get_keychain_secret,
            delete_keychain_secret,
            authenticate_forteweb
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
            free_port_if_in_use(41420);
        }
    });
}
