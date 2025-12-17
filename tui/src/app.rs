use std::collections::VecDeque;

use tui_textarea::TextArea;
use tui_tree_widget::TreeState;

use crate::project::ProjectInfo;
use crate::ws::protocol::{AgentResponse, AgentStatus, CommandResponse, Instance, MonitoringEvent};

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
    Command,
    Filter,
    Input,
    Help,
    Confirm(ConfirmAction),
    InstancePicker,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConfirmAction {
    Quit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Pane {
    Content,
    Tree,
    Input,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ContentTab {
    #[default]
    Logs,
    Interactions,
    Ai,
}

impl ContentTab {
    pub fn next(self) -> Self {
        match self {
            ContentTab::Logs => ContentTab::Interactions,
            ContentTab::Interactions => ContentTab::Ai,
            ContentTab::Ai => ContentTab::Logs,
        }
    }

    pub fn prev(self) -> Self {
        match self {
            ContentTab::Logs => ContentTab::Ai,
            ContentTab::Interactions => ContentTab::Logs,
            ContentTab::Ai => ContentTab::Interactions,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            ContentTab::Logs => "Logs",
            ContentTab::Interactions => "Interactions",
            ContentTab::Ai => "AI",
        }
    }
}

pub struct App<'a> {
    pub ws_state: WsState,
    pub server_uri: String,

    pub project: ProjectInfo,
    pub instances: Vec<Instance>,
    pub selected_instance: Option<String>,
    pub instance_picker_index: usize,

    pub app_status: AppStatus,

    pub logs: VecDeque<LogEntry>,
    pub interactions: VecDeque<MonitoringEvent>,
    pub ai_events: VecDeque<MonitoringEvent>,
    pub max_events: usize,

    pub mode: Mode,
    pub input_buffer: String,
    pub textarea: TextArea<'a>,
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

    pub should_quit: bool,
}

#[derive(Debug, Clone)]
pub struct LogEntry {
    pub ts: String,
    pub level: LogLevel,
    pub message: String,
    pub ansi_spans: Option<Vec<AnsiSpan>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    Debug,
    Info,
    Warning,
    Error,
}

#[derive(Debug, Clone)]
pub struct AnsiSpan {
    pub text: String,
    pub fg: Option<ratatui::style::Color>,
    pub bg: Option<ratatui::style::Color>,
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
}

impl<'a> App<'a> {
    pub fn new(uri: String, max_events: usize, project: ProjectInfo) -> Self {
        let mut textarea = TextArea::default();
        textarea.set_cursor_line_style(ratatui::style::Style::default());
        textarea.set_placeholder_text("Type an intent or command...");

        Self {
            ws_state: WsState::Disconnected,
            server_uri: uri,

            project,
            instances: Vec::new(),
            selected_instance: None,
            instance_picker_index: 0,

            app_status: AppStatus::Unknown,

            logs: VecDeque::with_capacity(max_events),
            interactions: VecDeque::with_capacity(max_events),
            ai_events: VecDeque::with_capacity(max_events),
            max_events,

            mode: Mode::Normal,
            input_buffer: String::new(),
            textarea,
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

            should_quit: false,
        }
    }

    pub fn set_tree(&mut self, tree: InteractionTree) {
        self.tree = Some(tree);
        self.tree_state = TreeState::default();
    }

    pub fn push_log(&mut self, entry: LogEntry) {
        if self.logs.len() >= self.max_events {
            self.logs.pop_front();
        }
        self.logs.push_back(entry);
    }

    pub fn push_interaction(&mut self, event: MonitoringEvent) {
        if self.interactions.len() >= self.max_events {
            self.interactions.pop_front();
        }
        self.interactions.push_back(event);
    }

    pub fn push_ai_event(&mut self, event: MonitoringEvent) {
        if self.ai_events.len() >= self.max_events {
            self.ai_events.pop_front();
        }
        self.ai_events.push_back(event);
    }

    pub fn push_event(&mut self, event: MonitoringEvent) {
        let source = event.source.to_lowercase();
        let event_type = event.event_type.to_lowercase();

        if source.contains("agent") || event_type.starts_with("agent_") || event_type.contains("tool") {
            self.push_ai_event(event);
        } else if source.contains("tree") || event_type.contains("interaction") {
            self.push_interaction(event);
        } else {
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
                ansi_spans: None,
            };
            self.push_log(entry);
        }
    }

    pub fn filtered_logs(&self) -> impl Iterator<Item = &LogEntry> {
        let filter = self.filter.clone();
        self.logs.iter().filter(move |e| {
            let Some(ref pattern) = filter else {
                return true;
            };
            let pattern_lower = pattern.to_lowercase();
            e.message.to_lowercase().contains(&pattern_lower)
        })
    }

    pub fn filtered_interactions(&self) -> impl Iterator<Item = &MonitoringEvent> {
        let filter = self.filter.clone();
        self.interactions.iter().filter(move |e| {
            let Some(ref pattern) = filter else {
                return true;
            };
            let pattern_lower = pattern.to_lowercase();
            e.source.to_lowercase().contains(&pattern_lower)
                || e.event_type.to_lowercase().contains(&pattern_lower)
        })
    }

    pub fn filtered_ai_events(&self) -> impl Iterator<Item = &MonitoringEvent> {
        let filter = self.filter.clone();
        self.ai_events.iter().filter(move |e| {
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
                    "stopped" => self.app_status = AppStatus::Stopped,
                    _ => {}
                }
            }
        } else if let Some(err) = resp.error {
            self.app_status = AppStatus::Error(err);
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
                self.last_agent_error = resp.summary;
            }
        }
    }

    pub fn in_answer_mode(&self) -> bool {
        self.conversation_id.is_some()
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
            ContentTab::Logs => self.filtered_logs().count(),
            ContentTab::Interactions => self.filtered_interactions().count(),
            ContentTab::Ai => self.filtered_ai_events().count(),
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
        self.logs.clear();
        self.interactions.clear();
        self.ai_events.clear();
        self.scroll_offset = 0;
    }

    pub fn set_instances(&mut self, instances: Vec<Instance>) {
        self.instances = instances;
        if self.selected_instance.is_none() && !self.instances.is_empty() {
            self.selected_instance = Some(self.instances[0].instance_id.clone());
        }
    }

    pub fn instance_picker_up(&mut self) {
        if self.instance_picker_index > 0 {
            self.instance_picker_index -= 1;
        }
    }

    pub fn instance_picker_down(&mut self) {
        if self.instance_picker_index < self.instances.len().saturating_sub(1) {
            self.instance_picker_index += 1;
        }
    }

    pub fn instance_picker_select(&mut self) {
        if let Some(instance) = self.instances.get(self.instance_picker_index) {
            self.selected_instance = Some(instance.instance_id.clone());
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
        assert_eq!(app.mode, Mode::Normal);
        assert!(!app.should_quit);
    }

    #[test]
    fn test_push_log_trims_to_max() {
        let mut app = App::new("ws://localhost:9000".to_string(), 3, test_project());
        for i in 0..4 {
            app.push_log(LogEntry {
                ts: format!("2024-01-01T00:00:0{}Z", i),
                level: LogLevel::Info,
                message: format!("msg{}", i),
                ansi_spans: None,
            });
        }

        assert_eq!(app.logs.len(), 3);
        assert!(app.logs[0].message.contains("msg1"));
        assert!(app.logs[2].message.contains("msg3"));
    }

    #[test]
    fn test_content_tab_cycling() {
        assert_eq!(ContentTab::Logs.next(), ContentTab::Interactions);
        assert_eq!(ContentTab::Interactions.next(), ContentTab::Ai);
        assert_eq!(ContentTab::Ai.next(), ContentTab::Logs);

        assert_eq!(ContentTab::Logs.prev(), ContentTab::Ai);
        assert_eq!(ContentTab::Ai.prev(), ContentTab::Interactions);
    }

    #[test]
    fn test_clear_events() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10, test_project());
        app.push_event(make_event("flutter", "log"));
        app.push_event(make_event("agent", "tool_call"));
        app.scroll_offset = 5;

        app.clear_events();
        assert!(app.logs.is_empty());
        assert!(app.ai_events.is_empty());
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
    fn test_handle_agent_response_creates_ai_event() {
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
        assert_eq!(app.ai_events.len(), 1);
        let event = app.ai_events.back().unwrap();
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
    fn test_instance_picker() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10, test_project());
        app.set_instances(vec![
            Instance {
                instance_id: "inst-1".to_string(),
                name: "app1".to_string(),
                project_path: "/path/1".to_string(),
                status: "running".to_string(),
                pid: Some(1234),
            },
            Instance {
                instance_id: "inst-2".to_string(),
                name: "app2".to_string(),
                project_path: "/path/2".to_string(),
                status: "stopped".to_string(),
                pid: None,
            },
        ]);

        assert_eq!(app.selected_instance, Some("inst-1".to_string()));
        assert_eq!(app.instance_picker_index, 0);

        app.instance_picker_down();
        assert_eq!(app.instance_picker_index, 1);

        app.instance_picker_select();
        assert_eq!(app.selected_instance, Some("inst-2".to_string()));
    }
}
