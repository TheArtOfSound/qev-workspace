use chrono::{DateTime, Duration, Utc};
use serde::Serialize;
use std::sync::Mutex;
use tauri::State;

#[derive(Debug, Clone)]
struct HostStateInner {
    relay_url: String,
    device_name: String,
    agent_ready: bool,
    screen_capture_ready: bool,
    input_control_ready: bool,
    active_session: Option<String>,
    control_granted_until: Option<DateTime<Utc>>,
}

impl Default for HostStateInner {
    fn default() -> Self {
        Self {
            relay_url: "wss://qev-workspace.onrender.com/ws".to_string(),
            device_name: "QEV Host".to_string(),
            agent_ready: true,
            screen_capture_ready: false,
            input_control_ready: false,
            active_session: None,
            control_granted_until: None,
        }
    }
}

struct HostState(Mutex<HostStateInner>);

#[derive(Serialize)]
struct HostStatus {
    relay_url: String,
    device_name: String,
    agent_ready: bool,
    screen_capture_ready: bool,
    input_control_ready: bool,
    active_session: Option<String>,
    control_granted_until: Option<String>,
}

#[tauri::command]
fn host_status(state: State<'_, HostState>) -> HostStatus {
    let guard = state.0.lock().expect("host state poisoned");

    HostStatus {
        relay_url: guard.relay_url.clone(),
        device_name: guard.device_name.clone(),
        agent_ready: guard.agent_ready,
        screen_capture_ready: guard.screen_capture_ready,
        input_control_ready: guard.input_control_ready,
        active_session: guard.active_session.clone(),
        control_granted_until: guard.control_granted_until.map(|value| value.to_rfc3339()),
    }
}

#[tauri::command]
fn connect_relay(relay_url: String, device_name: String, state: State<'_, HostState>) -> String {
    let mut guard = state.0.lock().expect("host state poisoned");
    guard.relay_url = relay_url;
    guard.device_name = device_name;
    guard.active_session = Some(format!("host-ready-{}", Utc::now().timestamp()));
    "Host marked ready. Relay socket implementation is next.".to_string()
}

#[tauri::command]
fn disconnect_relay(state: State<'_, HostState>) -> String {
    let mut guard = state.0.lock().expect("host state poisoned");
    guard.active_session = None;
    guard.control_granted_until = None;
    "Host disconnected.".to_string()
}

#[tauri::command]
fn approve_control_for_five_minutes(state: State<'_, HostState>) -> String {
    let mut guard = state.0.lock().expect("host state poisoned");
    let until = Utc::now() + Duration::minutes(5);
    guard.control_granted_until = Some(until);
    format!("Control approved until {}.", until.to_rfc3339())
}

#[tauri::command]
fn revoke_control(state: State<'_, HostState>) -> String {
    let mut guard = state.0.lock().expect("host state poisoned");
    guard.control_granted_until = None;
    "Control revoked.".to_string()
}

#[tauri::command]
fn open_mac_permissions() -> String {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .spawn();

        let _ = std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
            .spawn();

        return "Opened macOS Accessibility and Screen Recording settings.".to_string();
    }

    #[cfg(not(target_os = "macos"))]
    {
        "Open your OS privacy/security settings and allow QEV Host screen/input permissions.".to_string()
    }
}

pub fn run() {
    tauri::Builder::default()
        .manage(HostState(Mutex::new(HostStateInner::default())))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .invoke_handler(tauri::generate_handler![
            host_status,
            connect_relay,
            disconnect_relay,
            approve_control_for_five_minutes,
            revoke_control,
            open_mac_permissions
        ])
        .run(tauri::generate_context!())
        .expect("error while running QEV Host");
}
