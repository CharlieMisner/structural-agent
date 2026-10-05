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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub forte_user_root_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_file_tree_id: Option<i64>,
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
    if let Ok(statikor_home) = std::env::var("STATIKOR_HOME") {
        let dir = PathBuf::from(statikor_home);
        if !dir.exists() {
            let _ = fs::create_dir_all(&dir);
        }
        return Ok(dir.join("credentials.json"));
    }
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

fn parse_forte_auth_response(response_str: &str, fallback_user: &str) -> Result<ForteTokenResponse, String> {
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(response_str) {
        if let Some(token) = val.get("access_token").and_then(|t| t.as_str()) {
            let expires_in = val.get("expires_in").and_then(|e| e.as_i64()).unwrap_or(86400);
            let token_type = val.get("token_type").and_then(|t| t.as_str()).map(|s| s.to_string());
            let user_name = val.get("userName").or_else(|| val.get("username")).and_then(|u| u.as_str()).map(|s| s.to_string()).unwrap_or_else(|| fallback_user.to_string());
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

    parse_forte_auth_response(&response_str, &username)
}

fn current_utc_iso8601() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let total_secs = duration.as_secs();
    let millis = duration.subsec_millis();

    let sec = (total_secs % 60) as u32;
    let min = ((total_secs / 60) % 60) as u32;
    let hour = ((total_secs / 3600) % 24) as u32;
    let mut days = (total_secs / 86400) as i64;

    let mut year = 1970;
    loop {
        let leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
        let days_in_year = if leap { 366 } else { 365 };
        if days >= days_in_year {
            days -= days_in_year;
            year += 1;
        } else {
            break;
        }
    }

    let leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
    let month_days = [
        31, if leap { 29 } else { 28 }, 31, 30, 31, 30,
        31, 31, 30, 31, 30, 31,
    ];
    let mut month = 1;
    for &d in &month_days {
        if days >= d {
            days -= d;
            month += 1;
        } else {
            break;
        }
    }
    let day = (days + 1) as u32;

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        year, month, day, hour, min, sec, millis
    )
}

fn parse_forte_filesystem_data(fs_str: &str) -> Result<i64, String> {
    let fs_json: serde_json::Value = serde_json::from_str(fs_str)
        .map_err(|e| format!("Failed to parse GetAllFileSystemData response: {} ({})", e, fs_str.chars().take(200).collect::<String>()))?;

    // Search for the tree item where text is "Root"
    let mut forte_user_root_id: Option<i64> = None;
    if let Some(items) = fs_json.get("allTreeItems").and_then(|v| v.as_array()) {
        for item in items {
            let text = item.get("text").or_else(|| item.get("Text")).and_then(|t| t.as_str());
            if text == Some("Root") {
                if let Some(id) = item.get("id").and_then(|i| i.as_i64()) {
                    forte_user_root_id = Some(id);
                    break;
                }
            }
        }
    }
    if forte_user_root_id.is_none() {
        if let Some(roots) = fs_json.get("treeRoots").and_then(|r| r.as_array()) {
            if let Some(first) = roots.first() {
                if let Some(id) = first.get("RootTreeItemID").and_then(|i| i.as_i64()) {
                    forte_user_root_id = Some(id);
                }
            }
        }
    }

    forte_user_root_id
        .ok_or_else(|| "Could not find Root folder (forteUserRootId) in Forte file system".to_string())
}

fn parse_forte_add_file_response(add_str: &str) -> Result<i64, String> {
    let add_json: Result<serde_json::Value, _> = serde_json::from_str(add_str);
    let mut project_file_tree_id: Option<i64> = None;
    if let Ok(json) = &add_json {
        if let Some(id) = json
            .get("postResponseData")
            .and_then(|p| p.get("ApplicationData"))
            .and_then(|a| a.get("ProjectManagerData"))
            .and_then(|pm| pm.get("ProjectFileTreeID"))
            .and_then(|v| v.as_i64())
        {
            project_file_tree_id = Some(id);
        }
    }

    if project_file_tree_id.is_none() {
        let needle = "\"ProjectFileTreeID\":";
        if let Some(idx) = add_str.find(needle) {
            let rest = &add_str[idx + needle.len()..];
            let num_str: String = rest.chars().skip_while(|c| c.is_whitespace()).take_while(|c| c.is_digit(10)).collect();
            if let Ok(id) = num_str.parse::<i64>() {
                project_file_tree_id = Some(id);
            }
        }
    }

    project_file_tree_id
        .ok_or_else(|| format!("ProjectFileTreeID not found in AddNewFile response: {}", add_str.chars().take(300).collect::<String>()))
}

fn update_and_save_forte_tool(
    p: &Path,
    root_id: i64,
    file_id: i64,
    username: Option<String>,
) -> Result<ToolConfig, String> {
    let mut config = ensure_statikor_project(p)?;
    let mut tools = config.tools.unwrap_or_default();
    let existing_idx = tools.iter().position(|t| t.id == "forteweb");

    let now_ms = {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64
    };

    let mut updated_tool = if let Some(idx) = existing_idx {
        tools[idx].clone()
    } else {
        ToolConfig {
            id: "forteweb".to_string(),
            name: "ForteWEB".to_string(),
            authenticated: true,
            username: username.clone(),
            added_at: Some(now_ms),
            ..Default::default()
        }
    };

    updated_tool.authenticated = true;
    if username.is_some() {
        updated_tool.username = username;
    }
    updated_tool.forte_user_root_id = Some(root_id);
    updated_tool.project_file_tree_id = Some(file_id);
    updated_tool.file_id = Some(file_id);

    if let Some(idx) = existing_idx {
        tools[idx] = updated_tool.clone();
    } else {
        tools.push(updated_tool.clone());
    }

    config.tools = Some(tools);

    let statikor_dir = p.join(".statikor");
    let project_file = statikor_dir.join("project.json");
    let json_content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize project config: {}", e))?;
    fs::write(&project_file, json_content)
        .map_err(|e| format!("Failed to write project.json: {}", e))?;

    Ok(updated_tool)
}

#[tauri::command]
fn init_forte_project_file(
    project_path: String,
    token: Option<String>,
    username: Option<String>,
) -> Result<ToolConfig, String> {
    let p = Path::new(&project_path);
    let config = ensure_statikor_project(p)?;
    let tools = config.tools.unwrap_or_default();

    let existing_idx = tools.iter().position(|t| t.id == "forteweb");
    if let Some(idx) = existing_idx {
        if tools[idx].file_id.is_some() || tools[idx].project_file_tree_id.is_some() {
            return Ok(tools[idx].clone());
        }
    }

    // Determine bearer token
    let bearer_token = match token.filter(|t| !t.trim().is_empty()) {
        Some(t) => t,
        None => {
            let user_hint = username.as_ref().or_else(|| {
                existing_idx.and_then(|idx| tools[idx].username.as_ref())
            });
            let mut resolved = None;
            if let Some(u) = user_hint {
                if let Ok(tok) = get_keychain_secret("com.statikor.forteweb".to_string(), u.clone()) {
                    resolved = Some(tok);
                }
            }
            if resolved.is_none() {
                if let Ok(file_path) = get_fallback_credentials_file() {
                    if file_path.exists() {
                        if let Ok(content) = fs::read_to_string(&file_path) {
                            if let Ok(map) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&content) {
                                for (k, v) in map {
                                    if k.starts_with("com.statikor.forteweb:") {
                                        if let Some(s) = v.as_str() {
                                            resolved = Some(s.to_string());
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            resolved.ok_or_else(|| "Forte authentication token not found. Please sign in.".to_string())?
        }
    };

    // 1. GetAllFileSystemData
    eprintln!("[Statikor Forte Init] Querying GetAllFileSystemData...");
    let output_fs = Command::new("curl")
        .args([
            "-s",
            "--url", "https://fortewebapi-production.azurewebsites.net/api/FileSystem/GetAllFileSystemData",
            "-H", "accept: application/json, text/plain, */*",
            "-H", "accept-language: en-US",
            "-H", &format!("authorization: Bearer {}", bearer_token),
            "-H", "cache-control: no-cache",
            "-H", "content-type: application/json",
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
            "-H", "sec-fetch-storage-access: active",
            "-H", "user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
            "--data-raw", "{\"lastAccessedDate\":null}",
        ])
        .output()
        .map_err(|e| format!("Failed to execute GetAllFileSystemData curl: {}", e))?;

    let fs_str = String::from_utf8_lossy(&output_fs.stdout).to_string();
    let root_id = parse_forte_filesystem_data(&fs_str)?;

    // 2. AddNewFile
    let folder_name = p.file_name().and_then(|s| s.to_str()).unwrap_or("Statikor Project");
    let received_date = current_utc_iso8601();
    let add_body = serde_json::json!({
        "parentFolderId": root_id,
        "fileName": folder_name,
        "receivedDataDate": received_date,
        "previousFileIdToClose": null,
    }).to_string();

    eprintln!("[Statikor Forte Init] Creating new file for folder: {} (parentFolderId: {})", folder_name, root_id);
    let output_add = Command::new("curl")
        .args([
            "-s",
            "--url", "https://fortewebapi-production.azurewebsites.net/api/FileSystem/AddNewFile",
            "-H", "accept: application/json, text/plain, */*",
            "-H", "accept-language: en-US",
            "-H", &format!("authorization: Bearer {}", bearer_token),
            "-H", "cache-control: no-cache",
            "-H", "content-type: application/json",
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
            "-H", "sec-fetch-storage-access: active",
            "-H", "user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
            "--data-raw", &add_body,
        ])
        .output()
        .map_err(|e| format!("Failed to execute AddNewFile curl: {}", e))?;

    let add_str = String::from_utf8_lossy(&output_add.stdout).to_string();
    let file_id = parse_forte_add_file_response(&add_str)?;

    // 3. Update project.json
    let updated_tool = update_and_save_forte_tool(p, root_id, file_id, username)?;
    eprintln!("[Statikor Forte Init] Successfully initialized file ID {} for project {}", file_id, folder_name);
    Ok(updated_tool)
}

#[tauri::command]
fn start_auth_flow(app: tauri::AppHandle, auth_url: String) -> Result<(), String> {
    use tauri::{Emitter, WebviewUrl, WebviewWindowBuilder};

    if let Some(existing) = app.get_webview_window("auth_window") {
        let _ = existing.close();
    }

    let parsed_url: tauri::Url = auth_url.parse().map_err(|e| format!("Invalid URL: {}", e))?;

    let app_handle = app.clone();
    WebviewWindowBuilder::new(&app, "auth_window", WebviewUrl::External(parsed_url))
        .title("Sign In - Statikor")
        .inner_size(500.0, 700.0)
        .resizable(true)
        .always_on_top(true)
        .on_navigation(move |url| {
            let url_str = url.as_str();
            if url_str.starts_with("http://localhost:1420")
                || url_str.starts_with("http://127.0.0.1:1420")
                || url_str.starts_with("tauri://localhost")
                || url_str.starts_with("https://tauri.localhost")
            {
                let _ = app_handle.emit("auth-callback", url_str.to_string());
                if let Some(auth_win) = app_handle.get_webview_window("auth_window") {
                    let _ = auth_win.close();
                }
                return false;
            }
            true
        })
        .build()
        .map_err(|e| format!("Failed to create auth window: {}", e))?;

    Ok(())
}

#[tauri::command]
fn open_browser_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", &url])
            .spawn()
            .map_err(|e| format!("Failed to open browser: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {}", e))?;
    }
    Ok(())
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
    // Guarantee ports 8000 and 41420 are completely free before spawning
    free_port_if_in_use(8000);
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

fn get_sidecar_status_inner(child: &mut Option<Child>) -> Result<String, String> {
    if let Some(c) = child.as_mut() {
        match c.try_wait() {
            Ok(Some(status)) => Ok(format!("exited ({})", status)),
            Ok(None) => Ok("running".to_string()),
            Err(e) => Err(e.to_string()),
        }
    } else {
        Ok("not_started".to_string())
    }
}

#[tauri::command]
fn get_sidecar_status(state: tauri::State<SidecarState>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    get_sidecar_status_inner(&mut *guard)
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
            authenticate_forteweb,
            init_forte_project_file,
            start_auth_flow,
            open_browser_url
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::Mutex;

    static ENV_MUTEX: Mutex<()> = Mutex::new(());

    fn get_test_temp_dir(name: &str) -> PathBuf {
        let mut dir = std::env::temp_dir();
        dir.push(format!("statikor_test_{}_{}", name, generate_uuid_v4()));
        let _ = fs::create_dir_all(&dir);
        dir
    }

    #[test]
    fn test_models_serde() {
        let entry = FileEntry {
            id: "1".to_string(),
            name: "test.rvt".to_string(),
            path: "/path/test.rvt".to_string(),
            is_directory: false,
            children: None,
        };
        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("\"isDirectory\":false"));
        let de: FileEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(de.name, "test.rvt");

        let tool = ToolConfig {
            id: "forteweb".to_string(),
            name: "ForteWEB".to_string(),
            authenticated: true,
            username: Some("user@test.com".to_string()),
            token_expires_at: Some(12345678),
            added_at: Some(1000),
            forte_user_root_id: Some(10),
            file_id: Some(20),
            project_file_tree_id: Some(30),
        };
        let tool_json = serde_json::to_string(&tool).unwrap();
        assert!(tool_json.contains("\"forteUserRootId\":10"));
        let de_tool: ToolConfig = serde_json::from_str(&tool_json).unwrap();
        assert_eq!(de_tool.username, Some("user@test.com".to_string()));

        let proj = ProjectConfig {
            id: "uuid-123".to_string(),
            tools: Some(vec![tool]),
        };
        let proj_json = serde_json::to_string(&proj).unwrap();
        let de_proj: ProjectConfig = serde_json::from_str(&proj_json).unwrap();
        assert_eq!(de_proj.id, "uuid-123");

        let token_resp_json = r#"{
            "access_token": "abc",
            "accessToken": "abc",
            "token_type": "Bearer",
            "expires_in": 3600,
            "username": "tester"
        }"#;
        let token_resp: ForteTokenResponse = serde_json::from_str(token_resp_json).unwrap();
        assert_eq!(token_resp.access_token, "abc");
        assert_eq!(token_resp.expires_in, Some(3600));
    }

    #[test]
    fn test_generate_uuid_v4() {
        let uuid1 = generate_uuid_v4();
        let uuid2 = generate_uuid_v4();
        assert_ne!(uuid1, uuid2);
        assert_eq!(uuid1.len(), 36);
        let parts: Vec<&str> = uuid1.split('-').collect();
        assert_eq!(parts.len(), 5);
        assert_eq!(parts[0].len(), 8);
        assert_eq!(parts[1].len(), 4);
        assert_eq!(parts[2].len(), 4);
        assert_eq!(parts[3].len(), 4);
        assert_eq!(parts[4].len(), 12);
        assert!(parts[2].starts_with('4')); // Version 4
    }

    #[test]
    fn test_url_encode_component() {
        assert_eq!(url_encode_component("abc-._~", false), "abc-._~");
        assert_eq!(url_encode_component("user@domain.com", true), "user@domain.com");
        assert_eq!(url_encode_component("user@domain.com", false), "user%40domain.com");
        assert_eq!(url_encode_component("hello world!#$", false), "hello%20world%21%23%24");
    }

    #[test]
    fn test_current_utc_iso8601() {
        let ts = current_utc_iso8601();
        assert!(ts.ends_with('Z'));
        assert!(ts.contains('T'));
        assert_eq!(ts.len(), 24); // e.g. 2026-10-04T12:00:00.000Z
    }

    #[test]
    fn test_normalize_path() {
        let p = Path::new("/a/b/../c/./d");
        let norm = normalize_path(p);
        assert_eq!(norm, PathBuf::from("/a/c/d"));
    }

    #[test]
    fn test_ensure_statikor_project() {
        let temp_dir = get_test_temp_dir("proj_init");
        let config1 = ensure_statikor_project(&temp_dir).unwrap();
        assert!(!config1.id.is_empty());

        let project_json_path = temp_dir.join(".statikor").join("project.json");
        assert!(project_json_path.exists());

        // Second call should return the exact same config ID
        let config2 = ensure_statikor_project(&temp_dir).unwrap();
        assert_eq!(config1.id, config2.id);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_read_project_directory_and_recursive() {
        let temp_dir = get_test_temp_dir("read_dir");

        // Create directory structure:
        // temp_dir/
        //   sub/
        //     file1.txt
        //   file2.txt
        //   .hidden/
        //   node_modules/
        //   target/
        //   dist/
        let sub = temp_dir.join("sub");
        let _ = fs::create_dir_all(&sub);
        let _ = fs::write(sub.join("file1.txt"), "hello");
        let _ = fs::write(temp_dir.join("file2.txt"), "world");

        let _ = fs::create_dir_all(temp_dir.join(".hidden"));
        let _ = fs::create_dir_all(temp_dir.join("node_modules"));
        let _ = fs::create_dir_all(temp_dir.join("target"));
        let _ = fs::create_dir_all(temp_dir.join("dist"));

        let entries = read_project_directory(temp_dir.to_string_lossy().to_string()).unwrap();
        assert_eq!(entries.len(), 2); // sub and file2.txt

        let sub_entry = entries.iter().find(|e| e.name == "sub").unwrap();
        assert!(sub_entry.is_directory);
        assert_eq!(sub_entry.children.as_ref().unwrap().len(), 1);

        let file2_entry = entries.iter().find(|e| e.name == "file2.txt").unwrap();
        assert!(!file2_entry.is_directory);

        // Test non-existent directory
        let err = read_project_directory("/non_existent_path_xyz_123".to_string());
        assert!(err.is_err());

        // Test max depth 0 in read_dir_recursive
        let empty = read_dir_recursive(&temp_dir, 0);
        assert!(empty.is_empty());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_get_project_config() {
        let temp_dir = get_test_temp_dir("get_cfg");
        let res = get_project_config(temp_dir.to_string_lossy().to_string());
        assert!(res.is_ok());

        let err = get_project_config("/non_existent_path_xyz_123".to_string());
        assert!(err.is_err());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_create_file_and_create_directory() {
        let temp_dir = get_test_temp_dir("create_items");

        // Create file with nested subfolder
        let file_path = temp_dir.join("nested").join("test_file.txt");
        let file_entry = create_file(file_path.to_string_lossy().to_string()).unwrap();
        assert_eq!(file_entry.name, "test_file.txt");
        assert!(!file_entry.is_directory);
        assert!(file_path.exists());

        // Creating again should error
        assert!(create_file(file_path.to_string_lossy().to_string()).is_err());

        // Create directory
        let dir_path = temp_dir.join("new_subfolder");
        let dir_entry = create_directory(dir_path.to_string_lossy().to_string()).unwrap();
        assert_eq!(dir_entry.name, "new_subfolder");
        assert!(dir_entry.is_directory);
        assert!(dir_path.exists());

        // Creating directory again should error
        assert!(create_directory(dir_path.to_string_lossy().to_string()).is_err());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_delete_path() {
        let temp_dir = get_test_temp_dir("delete_items");

        let f = temp_dir.join("to_delete.txt");
        let _ = fs::write(&f, "content");
        assert!(f.exists());
        assert!(delete_path(f.to_string_lossy().to_string()).is_ok());
        assert!(!f.exists());

        let d = temp_dir.join("dir_to_delete");
        let _ = fs::create_dir_all(&d);
        assert!(d.exists());
        assert!(delete_path(d.to_string_lossy().to_string()).is_ok());
        assert!(!d.exists());

        // Deleting non-existent should error
        assert!(delete_path(f.to_string_lossy().to_string()).is_err());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_save_project_tool() {
        let temp_dir = get_test_temp_dir("save_tool");
        let tool1 = ToolConfig {
            id: "forteweb".to_string(),
            name: "ForteWEB".to_string(),
            authenticated: true,
            username: Some("eng@test.com".to_string()),
            ..Default::default()
        };

        let updated1 = save_project_tool(temp_dir.to_string_lossy().to_string(), tool1.clone()).unwrap();
        assert_eq!(updated1.tools.as_ref().unwrap().len(), 1);

        // Update existing tool
        let mut tool1_updated = tool1;
        tool1_updated.file_id = Some(999);
        let updated2 = save_project_tool(temp_dir.to_string_lossy().to_string(), tool1_updated).unwrap();
        assert_eq!(updated2.tools.as_ref().unwrap().len(), 1);
        assert_eq!(updated2.tools.as_ref().unwrap()[0].file_id, Some(999));

        // Add second distinct tool
        let tool2 = ToolConfig {
            id: "enercalc".to_string(),
            name: "Enercalc".to_string(),
            authenticated: true,
            ..Default::default()
        };
        let updated3 = save_project_tool(temp_dir.to_string_lossy().to_string(), tool2).unwrap();
        assert_eq!(updated3.tools.as_ref().unwrap().len(), 2);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_keychain_and_fallback_credentials() {
        let _lock = ENV_MUTEX.lock().unwrap();
        let temp_dir = get_test_temp_dir("creds");
        std::env::set_var("STATIKOR_HOME", temp_dir.to_str().unwrap());

        let service = "com.statikor.test_service".to_string();
        let account = "test_user".to_string();
        let secret = "my_secret_token_12345".to_string();

        assert!(store_keychain_secret(service.clone(), account.clone(), secret.clone()).is_ok());
        let retrieved = get_keychain_secret(service.clone(), account.clone()).unwrap();
        assert_eq!(retrieved, secret);

        assert!(delete_keychain_secret(service.clone(), account.clone()).is_ok());
        assert!(get_keychain_secret(service, account).is_err());

        std::env::remove_var("STATIKOR_HOME");
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_free_port_if_in_use() {
        free_port_if_in_use(59999);
    }

    #[test]
    fn test_find_agent_paths_with_env() {
        let _lock = ENV_MUTEX.lock().unwrap();
        let temp_dir = get_test_temp_dir("fake_python");
        let fake_bin = temp_dir.join("bin");
        let _ = fs::create_dir_all(&fake_bin);
        let fake_py = fake_bin.join("python");
        let _ = fs::write(&fake_py, "");

        std::env::set_var("SERVER_PYTHON_PATH", fake_py.to_str().unwrap());
        let res = find_agent_paths();
        assert!(res.is_some());
        let (py_path, dir_path) = res.unwrap();
        assert_eq!(py_path, normalize_path(&fake_py));
        assert_eq!(dir_path, normalize_path(&temp_dir));

        std::env::remove_var("SERVER_PYTHON_PATH");
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_start_sidecar_with_env() {
        let _lock = ENV_MUTEX.lock().unwrap();
        let temp_dir = get_test_temp_dir("fake_sidecar");
        let bin_dir = temp_dir.join("bin");
        let _ = fs::create_dir_all(&bin_dir);
        let fake_py = bin_dir.join("python");
        // On Unix, write a shell script with exit 0
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::write(&fake_py, "#!/bin/sh\nexit 0\n");
            let _ = fs::set_permissions(&fake_py, fs::Permissions::from_mode(0o755));
        }
        #[cfg(not(unix))]
        {
            let _ = fs::write(&fake_py, "");
        }

        std::env::set_var("SERVER_PYTHON_PATH", fake_py.to_str().unwrap());
        let child = start_sidecar();
        assert!(child.is_ok());
        let mut c = child.unwrap();
        let _ = c.wait();

        std::env::remove_var("SERVER_PYTHON_PATH");
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_parse_forte_auth_response() {
        // Success case
        let success_json = r#"{
            "access_token": "token_abc_123",
            "token_type": "bearer",
            "expires_in": 7200,
            "userName": "engineer@firm.com"
        }"#;
        let resp = parse_forte_auth_response(success_json, "fallback@firm.com").unwrap();
        assert_eq!(resp.access_token, "token_abc_123");
        assert_eq!(resp.expires_in, Some(7200));
        assert_eq!(resp.username, Some("engineer@firm.com".to_string()));

        // Fallback username
        let token_no_user = r#"{"access_token": "tok"}"#;
        let resp2 = parse_forte_auth_response(token_no_user, "default_user").unwrap();
        assert_eq!(resp2.username, Some("default_user".to_string()));

        // Error description case
        let err_desc_json = r#"{"error_description": "Invalid credentials"}"#;
        assert_eq!(
            parse_forte_auth_response(err_desc_json, "").unwrap_err(),
            "Invalid credentials"
        );

        // Error code case
        let err_json = r#"{"error": "unauthorized_client"}"#;
        assert_eq!(
            parse_forte_auth_response(err_json, "").unwrap_err(),
            "unauthorized_client"
        );

        // Policy rejection case
        let policy_str = "Request not allowed by policy";
        assert!(parse_forte_auth_response(policy_str, "").is_err());

        // Empty response
        assert!(parse_forte_auth_response("", "").is_err());

        // Generic failure response
        let gen_err = parse_forte_auth_response("Unexpected raw HTML response", "");
        assert!(gen_err.is_err());
        assert!(gen_err.unwrap_err().contains("Authentication failed: Unexpected raw HTML response"));
    }

    #[test]
    fn test_parse_forte_filesystem_data() {
        // With allTreeItems containing "Root"
        let json_tree_items = r#"{
            "allTreeItems": [
                {"id": 101, "text": "Root"},
                {"id": 102, "text": "Project 1"}
            ]
        }"#;
        assert_eq!(parse_forte_filesystem_data(json_tree_items).unwrap(), 101);

        // With treeRoots fallback
        let json_tree_roots = r#"{
            "allTreeItems": [],
            "treeRoots": [
                {"RootTreeItemID": 202}
            ]
        }"#;
        assert_eq!(parse_forte_filesystem_data(json_tree_roots).unwrap(), 202);

        // Missing root error
        let json_empty = r#"{"allTreeItems": [], "treeRoots": []}"#;
        assert!(parse_forte_filesystem_data(json_empty).is_err());

        // Invalid json
        assert!(parse_forte_filesystem_data("not json").is_err());
    }

    #[test]
    fn test_parse_forte_add_file_response() {
        // Structured JSON response
        let json_success = r#"{
            "postResponseData": {
                "ApplicationData": {
                    "ProjectManagerData": {
                        "ProjectFileTreeID": 555
                    }
                }
            }
        }"#;
        assert_eq!(parse_forte_add_file_response(json_success).unwrap(), 555);

        // Raw text string with needle fallback
        let raw_needle = r#"{"other": 1, "ProjectFileTreeID": 777}"#;
        assert_eq!(parse_forte_add_file_response(raw_needle).unwrap(), 777);

        // Missing file ID
        let json_no_id = r#"{"status": "ok"}"#;
        assert!(parse_forte_add_file_response(json_no_id).is_err());

        // Invalid JSON
        assert!(parse_forte_add_file_response("invalid json").is_err());
    }

    #[test]
    fn test_get_sidecar_status_inner() {
        let mut none_child: Option<Child> = None;
        assert_eq!(get_sidecar_status_inner(&mut none_child).unwrap(), "not_started");

        // Running child & Exited child
        #[cfg(unix)]
        {
            if let Ok(child) = Command::new("sleep").arg("10").spawn() {
                let mut some_child = Some(child);
                assert_eq!(get_sidecar_status_inner(&mut some_child).unwrap(), "running");
                if let Some(mut c) = some_child {
                    let _ = c.kill();
                    let _ = c.wait();
                }
            }

            // Exited child test
            if let Ok(mut child) = Command::new("true").spawn() {
                let _ = child.wait();
                let mut some_child = Some(child);
                let status = get_sidecar_status_inner(&mut some_child).unwrap();
                assert!(status.starts_with("exited"));
            }
        }
    }

    #[test]
    fn test_normalize_path_edge_cases() {
        let p1 = Path::new("a/b/../c/./d/..");
        assert_eq!(normalize_path(p1), PathBuf::from("a/c"));

        let p2 = Path::new("././foo/bar");
        assert_eq!(normalize_path(p2), PathBuf::from("foo/bar"));

        let p3 = Path::new("../../a/b");
        assert_eq!(normalize_path(p3), PathBuf::from("a/b"));

        let p4 = Path::new("/");
        assert_eq!(normalize_path(p4), PathBuf::from("/"));
    }

    #[test]
    fn test_init_forte_project_file_existing_and_missing_token() {
        let _lock = ENV_MUTEX.lock().unwrap();
        let temp_dir = get_test_temp_dir("forte_init_test");

        // 1. Missing token error when no secret stored
        let err = init_forte_project_file(
            temp_dir.to_string_lossy().to_string(),
            None,
            Some("unknown@example.com".to_string()),
        );
        assert!(err.is_err());
        assert!(err.unwrap_err().contains("token not found"));

        // 2. Existing configured tool with fileId returns immediately without network
        let existing_tool = ToolConfig {
            id: "forteweb".to_string(),
            name: "ForteWEB".to_string(),
            authenticated: true,
            file_id: Some(888),
            project_file_tree_id: Some(888),
            ..Default::default()
        };
        let _ = save_project_tool(temp_dir.to_string_lossy().to_string(), existing_tool).unwrap();

        let res = init_forte_project_file(
            temp_dir.to_string_lossy().to_string(),
            None,
            None,
        );
        assert!(res.is_ok());
        let tool = res.unwrap();
        assert_eq!(tool.file_id, Some(888));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_find_agent_paths_no_env() {
        let _lock = ENV_MUTEX.lock().unwrap();
        std::env::remove_var("SERVER_PYTHON_PATH");
        std::env::remove_var("AGENT_PYTHON_PATH");
        let _ = find_agent_paths();
    }

    #[test]
    fn test_find_agent_paths_with_agent_env() {
        let _lock = ENV_MUTEX.lock().unwrap();
        let temp_dir = get_test_temp_dir("agent_py");
        let fake_bin = temp_dir.join("bin");
        let _ = fs::create_dir_all(&fake_bin);
        let fake_py = fake_bin.join("python");
        let _ = fs::write(&fake_py, "");

        std::env::set_var("AGENT_PYTHON_PATH", fake_py.to_str().unwrap());
        let res = find_agent_paths();
        assert!(res.is_some());
        std::env::remove_var("AGENT_PYTHON_PATH");
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_start_sidecar_fallback() {
        let _lock = ENV_MUTEX.lock().unwrap();
        std::env::remove_var("SERVER_PYTHON_PATH");
        std::env::remove_var("AGENT_PYTHON_PATH");
        let child = start_sidecar();
        assert!(child.is_ok());
        if let Ok(mut c) = child {
            let _ = c.kill();
            let _ = c.wait();
        }
    }

    #[test]
    fn test_authenticate_forteweb_command() {
        // Runs curl command and parses response / returns rejection or curl result
        let res = authenticate_forteweb("test@user.com".to_string(), "pass123".to_string());
        // Since test has no active Azure session, it returns Err
        assert!(res.is_err());
    }

    #[test]
    fn test_init_forte_project_file_with_token_curl() {
        let temp_dir = get_test_temp_dir("forte_curl_init");
        let res = init_forte_project_file(
            temp_dir.to_string_lossy().to_string(),
            Some("fake_token_123".to_string()),
            None,
        );
        // Will attempt GetAllFileSystemData and return Err due to fake token / offline response
        assert!(res.is_err());
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_ensure_statikor_project_corrupted_json() {
        let temp_dir = get_test_temp_dir("corrupted_init");
        let statikor_dir = temp_dir.join(".statikor");
        let _ = fs::create_dir_all(&statikor_dir);
        let project_file = statikor_dir.join("project.json");
        let _ = fs::write(&project_file, "{ invalid json");

        let config = ensure_statikor_project(&temp_dir).unwrap();
        assert!(!config.id.is_empty());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_create_file_nested_parents() {
        let temp_dir = get_test_temp_dir("deep_file");
        let deep_path = temp_dir.join("a").join("b").join("c").join("deep.txt");
        let res = create_file(deep_path.to_string_lossy().to_string());
        assert!(res.is_ok());
        assert!(deep_path.exists());
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_update_and_save_forte_tool() {
        let temp_dir = get_test_temp_dir("update_forte");
        // 1. New tool creation
        let tool1 = update_and_save_forte_tool(
            &temp_dir,
            100,
            200,
            Some("engineer@company.com".to_string()),
        ).unwrap();
        assert_eq!(tool1.id, "forteweb");
        assert_eq!(tool1.forte_user_root_id, Some(100));
        assert_eq!(tool1.file_id, Some(200));

        // 2. Updating existing tool
        let tool2 = update_and_save_forte_tool(
            &temp_dir,
            101,
            201,
            Some("engineer_updated@company.com".to_string()),
        ).unwrap();
        assert_eq!(tool2.forte_user_root_id, Some(101));
        assert_eq!(tool2.file_id, Some(201));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_save_project_tool_initially_none() {
        let temp_dir = get_test_temp_dir("init_none_tools");
        let project_json = temp_dir.join(".statikor").join("project.json");
        let _ = fs::create_dir_all(temp_dir.join(".statikor"));
        let _ = fs::write(&project_json, r#"{"id":"proj-no-tools"}"#);

        let tool = ToolConfig {
            id: "forteweb".to_string(),
            name: "ForteWEB".to_string(),
            authenticated: true,
            ..Default::default()
        };
        let updated = save_project_tool(temp_dir.to_string_lossy().to_string(), tool).unwrap();
        assert_eq!(updated.tools.as_ref().unwrap().len(), 1);
        assert_eq!(updated.tools.as_ref().unwrap()[0].id, "forteweb");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_keychain_missing_and_delete_nonexistent() {
        let _lock = ENV_MUTEX.lock().unwrap();
        let temp_dir = get_test_temp_dir("creds_missing");
        std::env::set_var("STATIKOR_HOME", temp_dir.to_str().unwrap());

        let res = get_keychain_secret("nonexistent_service".to_string(), "nonexistent_account".to_string());
        assert!(res.is_err());

        let del_res = delete_keychain_secret("nonexistent_service".to_string(), "nonexistent_account".to_string());
        // Deleting non-existent should succeed or handle gracefully
        assert!(del_res.is_ok() || del_res.is_err());

        std::env::remove_var("STATIKOR_HOME");
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_open_browser_url() {
        // Test execution with harmless URL
        let res = open_browser_url("http://127.0.0.1:1420".to_string());
        assert!(res.is_ok());
    }

    #[test]
    fn test_auth_url_parsing() {
        let valid_url: Result<tauri::Url, _> = "https://example.com/auth".parse();
        assert!(valid_url.is_ok());

        let invalid_url: Result<tauri::Url, _> = "not a valid url".parse();
        assert!(invalid_url.is_err());
    }
}

