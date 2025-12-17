use std::collections::VecDeque;

use tui_tree_widget::TreeState;

use crate::project::ProjectInfo;
use crate::ws::protocol::{AgentResponse, AgentStatus, CommandResponse, MonitoringEvent, Session};

#[derive(Debug, Clone, Default)]
pub struct InteractionTree {
    pub nodes: Vec<TreeNode>,
    #[allow(dead_code)]
    pub last_updated: Option<String>,
}

#[derive(Debug, Clone)]
pub struct TreeNode {
    pub id: String,
    pub widget_type: Option<String>,
    pub children: Vec<TreeNode>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WsState {
    Disconnected,
    Connecting,
    Connected,
}

#[derive(Debug, Clone)]
pub enum AppStatus {
    Unknown,
    Starting,
    Running {
        pid: u32,
        #[allow(dead_code)]
        uri: String,
    },
    Stopped,
    #[allow(dead_code)]
    Error(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Mode {
    Normal,
    Filter,
    Help,
    Confirm(ConfirmAction),
    SessionPicker,
    /// Prompt for text input with a specific purpose
    InputPrompt(InputPromptKind),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InputPromptKind {
    CreateSession,
    /// Run app with device argument (e.g., "macOS", "chrome", device ID)
    RunApp,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConfirmAction {
    Quit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Pane {
    Content,
    Tree,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ContentTab {
    /// Session-level logs (daemon events, session status)
    #[default]
    Session,
    /// Flutter logs (from flutter run process)
    Flutter,
    /// Agent conversation and tool calls
    Agent,
}

impl ContentTab {
    pub fn next(self) -> Self {
        match self {
            ContentTab::Session => ContentTab::Flutter,
            ContentTab::Flutter => ContentTab::Agent,
            ContentTab::Agent => ContentTab::Session,
        }
    }

    pub fn prev(self) -> Self {
        match self {
            ContentTab::Session => ContentTab::Agent,
            ContentTab::Flutter => ContentTab::Session,
            ContentTab::Agent => ContentTab::Flutter,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            ContentTab::Session => "Session",
            ContentTab::Flutter => "Flutter",
            ContentTab::Agent => "Agent",
        }
    }
}

pub struct App {
    pub ws_state: WsState,
    pub server_uri: String,

    pub project: ProjectInfo,
    pub sessions: Vec<Session>,
    pub selected_session: Option<String>,
    pub session_picker_index: usize,

    pub app_status: AppStatus,

    /// Session-level logs (daemon events, status changes)
    pub session_logs: VecDeque<LogEntry>,
    /// Flutter logs (from flutter run process)
    pub flutter_logs: VecDeque<LogEntry>,
    /// Agent events (tool calls, responses)
    pub agent_events: VecDeque<MonitoringEvent>,
    pub max_events: usize,

    pub mode: Mode,
    pub input_buffer: String,
    pub filter: Option<String>,
    pub selected_pane: Pane,
    pub content_tab: ContentTab,
    pub scroll_offset: usize,

    pub conversation_id: Option<String>,
    pub agent_question: Option<String>,
    pub pending_response: bool,
    pub pending_intent: Option<String>,
    pub last_agent_error: Option<String>,

    pub tree: Option<InteractionTree>,
    pub tree_state: TreeState<String>,

    pub throbber_state: throbber_widgets_tui::ThrobberState,

    // Completions - currently unused, hotkey-driven UI instead
    // pub completions: Vec<&'static str>,
    // pub completion_index: usize,
    // pub completion_start_col: usize,

    pub toasts: VecDeque<Toast>,
    pub toast_ttl_secs: u64,

    pub should_quit: bool,
}

#[derive(Debug, Clone)]
pub struct LogEntry {
    pub ts: String,
    pub level: LogLevel,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    Debug,
    Info,
    Warning,
    Error,
}

#[derive(Debug, Clone)]
pub struct Toast {
    pub message: String,
    pub level: ToastLevel,
    pub created_at: std::time::Instant,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToastLevel {
    Info,
    Success,
    Warning,
    Error,
}

impl Toast {
    pub fn error(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            level: ToastLevel::Error,
            created_at: std::time::Instant::now(),
        }
    }

    pub fn success(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            level: ToastLevel::Success,
            created_at: std::time::Instant::now(),
        }
    }

    pub fn info(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            level: ToastLevel::Info,
            created_at: std::time::Instant::now(),
        }
    }

    pub fn is_expired(&self, ttl_secs: u64) -> bool {
        self.created_at.elapsed().as_secs() >= ttl_secs
    }
}

impl App {
    pub fn new(uri: String, max_events: usize, project: ProjectInfo) -> Self {
        Self {
            ws_state: WsState::Disconnected,
            server_uri: uri,

            project,
            sessions: Vec::new(),
            selected_session: None,
            session_picker_index: 0,

            app_status: AppStatus::Unknown,

            session_logs: VecDeque::with_capacity(max_events),
            flutter_logs: VecDeque::with_capacity(max_events),
            agent_events: VecDeque::with_capacity(max_events),
            max_events,

            mode: Mode::SessionPicker,
            input_buffer: String::new(),
            filter: None,
            selected_pane: Pane::Content,
            content_tab: ContentTab::default(),
            scroll_offset: 0,

            conversation_id: None,
            agent_question: None,
            pending_response: false,
            pending_intent: None,
            last_agent_error: None,

            tree: None,
            tree_state: TreeState::default(),

            throbber_state: throbber_widgets_tui::ThrobberState::default(),

            toasts: VecDeque::new(),
            toast_ttl_secs: 5,

            should_quit: false,
        }
    }

    pub fn push_toast(&mut self, toast: Toast) {
        self.toasts.push_back(toast);
        // Keep max 5 toasts
        while self.toasts.len() > 5 {
            self.toasts.pop_front();
        }
    }

    pub fn expire_toasts(&mut self) {
        self.toasts.retain(|t| !t.is_expired(self.toast_ttl_secs));
    }

    // Completion methods - currently unused, hotkey-driven UI instead
    /*
    pub fn update_completions(&mut self) {
        let input = self.input_buffer.to_lowercase();
        if input.is_empty() {
            self.completions.clear();
            self.completion_index = 0;
            return;
        }
        let was_empty = self.completions.is_empty();
        self.completions = COMMANDS
            .iter()
            .copied()
            .filter(|cmd| cmd.starts_with(&input) && *cmd != input)
            .collect();
        self.completion_index = 0;
        if was_empty && !self.completions.is_empty() {
            self.completion_start_col = self.input_buffer.len();
        }
    }

    pub fn cycle_completion_next(&mut self) {
        if self.completions.is_empty() {
            return;
        }
        self.completion_index = (self.completion_index + 1) % self.completions.len();
    }

    pub fn cycle_completion_prev(&mut self) {
        if self.completions.is_empty() {
            return;
        }
        if self.completion_index == 0 {
            self.completion_index = self.completions.len() - 1;
        } else {
            self.completion_index -= 1;
        }
    }

    pub fn accept_completion(&mut self) {
        if let Some(cmd) = self.completions.get(self.completion_index) {
            self.input_buffer = cmd.to_string();
            self.completions.clear();
            self.completion_index = 0;
        }
    }

    pub fn current_completion(&self) -> Option<&'static str> {
        self.completions.get(self.completion_index).copied()
    }
    */

    pub fn set_tree(&mut self, tree: InteractionTree) {
        self.tree = Some(tree);
        self.tree_state = TreeState::default();
    }

    pub fn push_session_log(&mut self, entry: LogEntry) {
        if self.session_logs.len() >= self.max_events {
            self.session_logs.pop_front();
        }
        self.session_logs.push_back(entry);
    }

    pub fn push_flutter_log(&mut self, entry: LogEntry) {
        if self.flutter_logs.len() >= self.max_events {
            self.flutter_logs.pop_front();
        }
        self.flutter_logs.push_back(entry);
    }

    pub fn push_agent_event(&mut self, event: MonitoringEvent) {
        if self.agent_events.len() >= self.max_events {
            self.agent_events.pop_front();
        }
        self.agent_events.push_back(event);
    }

    pub fn push_event(&mut self, event: MonitoringEvent) {
        let source = event.source.to_lowercase();
        let event_type = event.event_type.to_lowercase();

        if source.contains("agent") || event_type.starts_with("agent_") || event_type.contains("tool") {
            self.push_agent_event(event);
        } else if source.contains("flutter") || event_type.starts_with("flutter.") {
            // Flutter logs go to Flutter tab
            let entry = LogEntry {
                ts: event.ts.clone(),
                level: if event_type.contains("error") {
                    LogLevel::Error
                } else if event_type.contains("warn") {
                    LogLevel::Warning
                } else {
                    LogLevel::Info
                },
                message: extract_flutter_log(&event.payload),
            };
            self.push_flutter_log(entry);
        } else {
            // Session-level events (session created, status changes, etc.)
            let entry = LogEntry {
                ts: event.ts.clone(),
                level: if event_type.contains("error") {
                    LogLevel::Error
                } else if event_type.contains("warn") {
                    LogLevel::Warning
                } else if event_type.contains("debug") {
                    LogLevel::Debug
                } else {
                    LogLevel::Info
                },
                message: format!("[{}] {}", event.source, summarize_payload(&event.payload)),
            };
            self.push_session_log(entry);
        }
    }

    pub fn filtered_session_logs(&self) -> impl Iterator<Item = &LogEntry> {
        let filter = self.filter.clone();
        self.session_logs.iter().filter(move |e| {
            let Some(ref pattern) = filter else {
                return true;
            };
            let pattern_lower = pattern.to_lowercase();
            e.message.to_lowercase().contains(&pattern_lower)
        })
    }

    pub fn filtered_flutter_logs(&self) -> impl Iterator<Item = &LogEntry> {
        let filter = self.filter.clone();
        self.flutter_logs.iter().filter(move |e| {
            let Some(ref pattern) = filter else {
                return true;
            };
            let pattern_lower = pattern.to_lowercase();
            e.message.to_lowercase().contains(&pattern_lower)
        })
    }

    pub fn filtered_agent_events(&self) -> impl Iterator<Item = &MonitoringEvent> {
        let filter = self.filter.clone();
        self.agent_events.iter().filter(move |e| {
            let Some(ref pattern) = filter else {
                return true;
            };
            let pattern_lower = pattern.to_lowercase();
            e.source.to_lowercase().contains(&pattern_lower)
                || e.event_type.to_lowercase().contains(&pattern_lower)
        })
    }

    pub fn handle_command_response(&mut self, resp: CommandResponse) {
        if resp.success {
            // Check if this is a tree response
            if let Some(targets) = resp.data.get("targets").and_then(|t| t.as_array()) {
                let nodes = Self::parse_tree_nodes(targets);
                let tree = InteractionTree {
                    nodes,
                    last_updated: Some(chrono::Utc::now().to_rfc3339()),
                };
                self.set_tree(tree);
                return;
            }

            // Check if this is a sessions list response
            if let Some(sessions) = resp.data.get("sessions").and_then(|s| s.as_array()) {
                if let Ok(parsed) = serde_json::from_value::<Vec<Session>>(serde_json::Value::Array(sessions.clone())) {
                    self.sessions = parsed;
                    // If we have no selected session and there are sessions, select first
                    if self.selected_session.is_none() && !self.sessions.is_empty() {
                        self.session_picker_index = 0;
                    }
                }
                return;
            }

            // Check if this is a session creation response
            if let Some(session) = resp.data.get("session") {
                if let Ok(parsed) = serde_json::from_value::<Session>(session.clone()) {
                    let session_id = parsed.id.clone();
                    // Add to sessions list if not already there
                    if !self.sessions.iter().any(|s| s.id == session_id) {
                        self.sessions.push(parsed);
                    }
                    // Auto-select the new session
                    self.selected_session = Some(session_id);
                    self.session_picker_index = self.sessions.len().saturating_sub(1);
                    self.mode = Mode::Normal;
                    self.push_toast(Toast::success("Session created"));
                }
                return;
            }

            // Check for app status
            if let Some(status) = resp.data.get("status").and_then(|s| s.as_str()) {
                match status {
                    "starting" => self.app_status = AppStatus::Starting,
                    "running" => {
                        let pid = resp.data.get("pid").and_then(|p| p.as_u64()).unwrap_or(0) as u32;
                        let uri = resp
                            .data
                            .get("uri")
                            .and_then(|u| u.as_str())
                            .unwrap_or("")
                            .to_string();
                        self.app_status = AppStatus::Running { pid, uri };
                    }
                    "stopped" | "not_running" => self.app_status = AppStatus::Stopped,
                    _ => {}
                }
            }
        } else if let Some(err) = resp.error {
            self.push_toast(Toast::error(&err));
        }
    }

    fn parse_tree_nodes(targets: &[serde_json::Value]) -> Vec<TreeNode> {
        targets
            .iter()
            .filter_map(|t| {
                let id = t.get("id")?.as_str()?.to_string();
                let widget_type = t.get("widgetType").and_then(|w| w.as_str()).map(String::from);
                let children = t
                    .get("children")
                    .and_then(|c| c.as_array())
                    .map(|arr| Self::parse_tree_nodes(arr))
                    .unwrap_or_default();
                Some(TreeNode {
                    id,
                    widget_type,
                    children,
                })
            })
            .collect()
    }

    pub fn handle_agent_response(&mut self, resp: AgentResponse) {
        self.pending_response = false;

        let event = resp.to_monitoring_event();
        self.push_event(event);

        match resp.status {
            AgentStatus::Success => {
                self.conversation_id = None;
                self.agent_question = None;
                self.last_agent_error = None;
            }
            AgentStatus::NeedsContext => {
                self.conversation_id = resp.conversation_id;
                self.agent_question = resp.question;
                self.last_agent_error = None;
            }
            AgentStatus::Error => {
                self.conversation_id = None;
                self.agent_question = None;
                if let Some(ref err) = resp.summary {
                    self.push_toast(Toast::error(err));
                }
                self.last_agent_error = resp.summary;
            }
        }
    }

    pub fn in_answer_mode(&self) -> bool {
        self.conversation_id.is_some()
    }

    pub fn is_app_running(&self) -> bool {
        matches!(self.app_status, AppStatus::Running { .. } | AppStatus::Starting)
    }

    pub fn has_session(&self) -> bool {
        self.selected_session.is_some()
    }

    pub fn cancel_answer_mode(&mut self) {
        self.conversation_id = None;
        self.agent_question = None;
    }

    pub fn scroll_up(&mut self) {
        self.scroll_offset = self.scroll_offset.saturating_sub(1);
    }

    pub fn scroll_down(&mut self) {
        let event_count = match self.content_tab {
            ContentTab::Session => self.filtered_session_logs().count(),
            ContentTab::Flutter => self.filtered_flutter_logs().count(),
            ContentTab::Agent => self.filtered_agent_events().count(),
        };
        if event_count > 0 && self.scroll_offset < event_count - 1 {
            self.scroll_offset += 1;
        }
    }

    pub fn tree_up(&mut self) {
        self.tree_state.key_up();
    }

    pub fn tree_down(&mut self) {
        self.tree_state.key_down();
    }

    pub fn tree_toggle(&mut self) {
        self.tree_state.toggle_selected();
    }

    pub fn tree_left(&mut self) {
        self.tree_state.key_left();
    }

    pub fn tree_right(&mut self) {
        self.tree_state.key_right();
    }

    pub fn tree_selected(&self) -> Option<&String> {
        self.tree_state.selected().last()
    }

    pub fn clear_events(&mut self) {
        self.session_logs.clear();
        self.flutter_logs.clear();
        self.agent_events.clear();
        self.scroll_offset = 0;
    }

    pub fn set_sessions(&mut self, sessions: Vec<Session>) {
        self.sessions = sessions;
        if self.selected_session.is_none() && !self.sessions.is_empty() {
            self.selected_session = Some(self.sessions[0].id.clone());
        }
    }

    pub fn session_picker_up(&mut self) {
        if self.session_picker_index > 0 {
            self.session_picker_index -= 1;
        }
    }

    pub fn session_picker_down(&mut self) {
        if self.session_picker_index < self.sessions.len().saturating_sub(1) {
            self.session_picker_index += 1;
        }
    }

    pub fn session_picker_select(&mut self) {
        if let Some(session) = self.sessions.get(self.session_picker_index) {
            self.selected_session = Some(session.id.clone());
        }
        self.mode = Mode::Normal;
    }

    pub fn next_tab(&mut self) {
        self.content_tab = self.content_tab.next();
        self.scroll_offset = 0;
    }

    pub fn prev_tab(&mut self) {
        self.content_tab = self.content_tab.prev();
        self.scroll_offset = 0;
    }

    pub fn tick(&mut self) {
        self.throbber_state.calc_next();
    }
}

fn summarize_payload(payload: &serde_json::Value) -> String {
    match payload {
        serde_json::Value::Null => String::new(),
        serde_json::Value::String(s) => truncate(s, 80),
        serde_json::Value::Object(map) => {
            if let Some(msg) = map.get("message").and_then(|v| v.as_str()) {
                return truncate(msg, 80);
            }
            let keys: Vec<&str> = map.keys().map(|k| k.as_str()).take(3).collect();
            if keys.is_empty() {
                "{}".to_string()
            } else {
                format!("{{{}}}", keys.join(", "))
            }
        }
        serde_json::Value::Array(arr) => format!("[{} items]", arr.len()),
        other => truncate(&other.to_string(), 80),
    }
}

fn extract_flutter_log(payload: &serde_json::Value) -> String {
    // Flutter logs come as { "line": "..." }
    if let Some(line) = payload.get("line").and_then(|v| v.as_str()) {
        return line.to_string();
    }
    // Fall back to summarizing the payload
    summarize_payload(payload)
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s.chars().take(max - 1).collect::<String>())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn test_project() -> ProjectInfo {
        ProjectInfo {
            path: PathBuf::from("/test/project"),
            name: "test_app".to_string(),
            is_flutter: true,
        }
    }

    fn make_event(source: &str, event_type: &str) -> MonitoringEvent {
        MonitoringEvent {
            ts: "2024-01-01T00:00:00Z".to_string(),
            source: source.to_string(),
            event_type: event_type.to_string(),
            payload: serde_json::Value::Null,
        }
    }

    #[test]
    fn test_new_app() {
        let app = App::new("ws://localhost:9000".to_string(), 100, test_project());
        assert_eq!(app.server_uri, "ws://localhost:9000");
        assert_eq!(app.max_events, 100);
        assert_eq!(app.ws_state, WsState::Disconnected);
        assert_eq!(app.mode, Mode::SessionPicker);
        assert!(!app.should_quit);
    }

    #[test]
    fn test_push_session_log_trims_to_max() {
        let mut app = App::new("ws://localhost:9000".to_string(), 3, test_project());
        for i in 0..4 {
            app.push_session_log(LogEntry {
                ts: format!("2024-01-01T00:00:0{}Z", i),
                level: LogLevel::Info,
                message: format!("msg{}", i),
            });
        }

        assert_eq!(app.session_logs.len(), 3);
        assert!(app.session_logs[0].message.contains("msg1"));
        assert!(app.session_logs[2].message.contains("msg3"));
    }

    #[test]
    fn test_content_tab_cycling() {
        assert_eq!(ContentTab::Session.next(), ContentTab::Flutter);
        assert_eq!(ContentTab::Flutter.next(), ContentTab::Agent);
        assert_eq!(ContentTab::Agent.next(), ContentTab::Session);

        assert_eq!(ContentTab::Session.prev(), ContentTab::Agent);
        assert_eq!(ContentTab::Agent.prev(), ContentTab::Flutter);
    }

    #[test]
    fn test_clear_events() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10, test_project());
        app.push_event(make_event("flutter", "flutter.log"));
        app.push_event(make_event("agent", "tool_call"));
        app.scroll_offset = 5;

        app.clear_events();
        assert!(app.flutter_logs.is_empty());
        assert!(app.agent_events.is_empty());
        assert_eq!(app.scroll_offset, 0);
    }

    #[test]
    fn test_handle_command_response_running() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10, test_project());
        let resp = CommandResponse {
            id: "1".to_string(),
            success: true,
            data: serde_json::json!({"status": "running", "pid": 1234, "uri": "ws://127.0.0.1:5678"}),
            error: None,
        };

        app.handle_command_response(resp);
        match app.app_status {
            AppStatus::Running { pid, uri } => {
                assert_eq!(pid, 1234);
                assert_eq!(uri, "ws://127.0.0.1:5678");
            }
            _ => panic!("Expected Running status"),
        }
    }

    #[test]
    fn test_handle_agent_response_needs_context() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10, test_project());
        app.pending_response = true;

        let resp = AgentResponse {
            id: "1".to_string(),
            status: AgentStatus::NeedsContext,
            summary: None,
            question: Some("Which button?".to_string()),
            conversation_id: Some("conv-123".to_string()),
        };

        app.handle_agent_response(resp);
        assert!(!app.pending_response);
        assert_eq!(app.conversation_id, Some("conv-123".to_string()));
    }

    #[test]
    fn test_handle_agent_response_success_clears_conversation() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10, test_project());
        app.conversation_id = Some("conv-123".to_string());
        app.pending_response = true;

        let resp = AgentResponse {
            id: "1".to_string(),
            status: AgentStatus::Success,
            summary: Some("Done".to_string()),
            question: None,
            conversation_id: None,
        };

        app.handle_agent_response(resp);
        assert!(!app.pending_response);
        assert!(app.conversation_id.is_none());
    }

    #[test]
    fn test_handle_agent_response_creates_agent_event() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10, test_project());
        app.pending_response = true;

        let resp = AgentResponse {
            id: "1".to_string(),
            status: AgentStatus::Success,
            summary: Some("Task completed".to_string()),
            question: None,
            conversation_id: None,
        };

        app.handle_agent_response(resp);
        assert_eq!(app.agent_events.len(), 1);
        let event = app.agent_events.back().unwrap();
        assert_eq!(event.source, "agent");
        assert_eq!(event.event_type, "agent_success");
    }

    #[test]
    fn test_handle_agent_response_error_sets_last_error() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10, test_project());
        app.pending_response = true;

        let resp = AgentResponse {
            id: "1".to_string(),
            status: AgentStatus::Error,
            summary: Some("Something went wrong".to_string()),
            question: None,
            conversation_id: None,
        };

        app.handle_agent_response(resp);
        assert_eq!(app.last_agent_error, Some("Something went wrong".to_string()));
        assert!(app.conversation_id.is_none());
    }

    #[test]
    fn test_handle_command_response_create_session() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10, test_project());
        app.mode = Mode::SessionPicker;
        assert!(app.sessions.is_empty());

        let resp = CommandResponse {
            id: "1".to_string(),
            success: true,
            data: serde_json::json!({
                "session": {
                    "id": "sess-new",
                    "name": "my-new-session",
                    "projectPath": "/path/to/project",
                    "appStatus": "not_running",
                    "createdAt": "2024-01-01T00:00:00Z",
                    "lastActiveAt": "2024-01-01T00:00:00Z"
                }
            }),
            error: None,
        };

        app.handle_command_response(resp);

        // Session should be added
        assert_eq!(app.sessions.len(), 1);
        assert_eq!(app.sessions[0].id, "sess-new");
        assert_eq!(app.sessions[0].name, "my-new-session");

        // Session should be auto-selected
        assert_eq!(app.selected_session, Some("sess-new".to_string()));

        // Mode should switch to Normal
        assert_eq!(app.mode, Mode::Normal);

        // Toast should be shown (can't easily check content, but toasts queue should have one)
        assert_eq!(app.toasts.len(), 1);
    }

    #[test]
    fn test_handle_command_response_list_sessions() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10, test_project());
        assert!(app.sessions.is_empty());

        let resp = CommandResponse {
            id: "1".to_string(),
            success: true,
            data: serde_json::json!({
                "sessions": [
                    {
                        "id": "sess-1",
                        "name": "app1",
                        "projectPath": "/path/1",
                        "appStatus": "running",
                        "vmServiceUri": "ws://127.0.0.1:5678",
                        "pid": 1234,
                        "createdAt": "2024-01-01T00:00:00Z",
                        "lastActiveAt": "2024-01-01T00:00:00Z"
                    },
                    {
                        "id": "sess-2",
                        "name": "app2",
                        "projectPath": "/path/2",
                        "appStatus": "not_running",
                        "createdAt": "2024-01-01T00:00:00Z",
                        "lastActiveAt": "2024-01-01T00:00:00Z"
                    }
                ]
            }),
            error: None,
        };

        app.handle_command_response(resp);

        assert_eq!(app.sessions.len(), 2);
        assert_eq!(app.sessions[0].id, "sess-1");
        assert_eq!(app.sessions[1].id, "sess-2");
        assert_eq!(app.session_picker_index, 0);
    }

    #[test]
    fn test_session_picker() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10, test_project());
        app.set_sessions(vec![
            Session {
                id: "sess-1".to_string(),
                name: "app1".to_string(),
                project_path: "/path/1".to_string(),
                app_status: "running".to_string(),
                vm_service_uri: Some("ws://127.0.0.1:5678".to_string()),
                pid: Some(1234),
                created_at: "2024-01-01T00:00:00Z".to_string(),
                last_active_at: "2024-01-01T00:00:00Z".to_string(),
            },
            Session {
                id: "sess-2".to_string(),
                name: "app2".to_string(),
                project_path: "/path/2".to_string(),
                app_status: "not_running".to_string(),
                vm_service_uri: None,
                pid: None,
                created_at: "2024-01-01T00:00:00Z".to_string(),
                last_active_at: "2024-01-01T00:00:00Z".to_string(),
            },
        ]);

        assert_eq!(app.selected_session, Some("sess-1".to_string()));
        assert_eq!(app.session_picker_index, 0);

        app.session_picker_down();
        assert_eq!(app.session_picker_index, 1);

        app.session_picker_select();
        assert_eq!(app.selected_session, Some("sess-2".to_string()));
    }
}
