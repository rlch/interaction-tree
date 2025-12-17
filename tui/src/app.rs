use std::collections::{HashSet, VecDeque};

use crate::ws::protocol::{AgentResponse, AgentStatus, CommandResponse, MonitoringEvent};

// Interaction tree data structures (Phase 3)
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
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConfirmAction {
    Quit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Pane {
    Events,
    Tree,
    Input,
}

pub struct App {
    pub ws_state: WsState,
    pub server_uri: String,
    pub instance_id: Option<String>,

    pub app_status: AppStatus,

    pub events: VecDeque<MonitoringEvent>,
    pub max_events: usize,

    pub mode: Mode,
    pub input_buffer: String,
    pub filter: Option<String>,
    pub selected_pane: Pane,
    pub scroll_offset: usize,

    pub conversation_id: Option<String>,
    pub agent_question: Option<String>,
    pub pending_response: bool,
    pub pending_intent: Option<String>,
    pub last_agent_error: Option<String>,

    // Interaction tree (Phase 3)
    pub tree: Option<InteractionTree>,
    pub tree_expanded: HashSet<String>,
    pub tree_scroll_offset: usize,
    pub tree_selected: Option<String>,

    pub should_quit: bool,
}

impl App {
    pub fn new(uri: String, max_events: usize) -> Self {
        Self {
            ws_state: WsState::Disconnected,
            server_uri: uri,
            instance_id: None,

            app_status: AppStatus::Unknown,

            events: VecDeque::with_capacity(max_events),
            max_events,

            mode: Mode::Normal,
            input_buffer: String::new(),
            filter: None,
            selected_pane: Pane::Events,
            scroll_offset: 0,

            conversation_id: None,
            agent_question: None,
            pending_response: false,
            pending_intent: None,
            last_agent_error: None,

            tree: None,
            tree_expanded: HashSet::new(),
            tree_scroll_offset: 0,
            tree_selected: None,

            should_quit: false,
        }
    }

    pub fn set_tree(&mut self, tree: InteractionTree) {
        self.tree = Some(tree);
    }

    pub fn toggle_tree_node(&mut self, id: &str) {
        if self.tree_expanded.contains(id) {
            self.tree_expanded.remove(id);
        } else {
            self.tree_expanded.insert(id.to_string());
        }
    }

    pub fn tree_visible_nodes(&self) -> Vec<(usize, &TreeNode)> {
        let Some(ref tree) = self.tree else {
            return Vec::new();
        };

        let mut result = Vec::new();
        self.collect_visible_nodes(&tree.nodes, 0, &mut result);
        result
    }

    fn collect_visible_nodes<'a>(
        &'a self,
        nodes: &'a [TreeNode],
        depth: usize,
        result: &mut Vec<(usize, &'a TreeNode)>,
    ) {
        for node in nodes {
            result.push((depth, node));
            if self.tree_expanded.contains(&node.id) {
                self.collect_visible_nodes(&node.children, depth + 1, result);
            }
        }
    }

    pub fn push_event(&mut self, event: MonitoringEvent) {
        if self.events.len() >= self.max_events {
            self.events.pop_front();
        }
        self.events.push_back(event);
    }

    pub fn filtered_events(&self) -> impl Iterator<Item = &MonitoringEvent> {
        let filter = self.filter.clone();
        self.events.iter().filter(move |e| {
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
        let event_count = self.filtered_events().count();
        if event_count > 0 && self.scroll_offset < event_count - 1 {
            self.scroll_offset += 1;
        }
    }

    pub fn tree_scroll_up(&mut self) {
        self.tree_scroll_offset = self.tree_scroll_offset.saturating_sub(1);
    }

    pub fn tree_scroll_down(&mut self) {
        let visible_count = self.tree_visible_nodes().len();
        if visible_count > 0 && self.tree_scroll_offset < visible_count - 1 {
            self.tree_scroll_offset += 1;
        }
    }

    pub fn tree_toggle_selected(&mut self) {
        if let Some(ref selected) = self.tree_selected.clone() {
            self.toggle_tree_node(selected);
        } else {
            let visible = self.tree_visible_nodes();
            if let Some((_, node)) = visible.get(self.tree_scroll_offset) {
                let id = node.id.clone();
                self.toggle_tree_node(&id);
            }
        }
    }

    pub fn tree_select_at_offset(&mut self) {
        let visible = self.tree_visible_nodes();
        if let Some((_, node)) = visible.get(self.tree_scroll_offset) {
            self.tree_selected = Some(node.id.clone());
        }
    }

    pub fn clear_events(&mut self) {
        self.events.clear();
        self.scroll_offset = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
        let app = App::new("ws://localhost:9000".to_string(), 100);
        assert_eq!(app.server_uri, "ws://localhost:9000");
        assert_eq!(app.max_events, 100);
        assert_eq!(app.ws_state, WsState::Disconnected);
        assert_eq!(app.mode, Mode::Normal);
        assert!(!app.should_quit);
    }

    #[test]
    fn test_push_event_trims_to_max() {
        let mut app = App::new("ws://localhost:9000".to_string(), 3);
        app.push_event(make_event("a", "t1"));
        app.push_event(make_event("b", "t2"));
        app.push_event(make_event("c", "t3"));
        app.push_event(make_event("d", "t4"));

        assert_eq!(app.events.len(), 3);
        assert_eq!(app.events[0].source, "b");
        assert_eq!(app.events[2].source, "d");
    }

    #[test]
    fn test_filtered_events_no_filter() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10);
        app.push_event(make_event("flutter", "log"));
        app.push_event(make_event("agent", "tool"));

        let filtered: Vec<_> = app.filtered_events().collect();
        assert_eq!(filtered.len(), 2);
    }

    #[test]
    fn test_filtered_events_by_source() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10);
        app.push_event(make_event("flutter", "log"));
        app.push_event(make_event("agent", "tool"));
        app.push_event(make_event("flutter", "error"));
        app.filter = Some("flutter".to_string());

        let filtered: Vec<_> = app.filtered_events().collect();
        assert_eq!(filtered.len(), 2);
        assert!(filtered.iter().all(|e| e.source == "flutter"));
    }

    #[test]
    fn test_filtered_events_by_type() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10);
        app.push_event(make_event("flutter", "log"));
        app.push_event(make_event("agent", "tool_call"));
        app.push_event(make_event("agent", "tool_result"));
        app.filter = Some("tool".to_string());

        let filtered: Vec<_> = app.filtered_events().collect();
        assert_eq!(filtered.len(), 2);
    }

    #[test]
    fn test_filtered_events_case_insensitive() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10);
        app.push_event(make_event("Flutter", "LOG"));
        app.filter = Some("flutter".to_string());

        let filtered: Vec<_> = app.filtered_events().collect();
        assert_eq!(filtered.len(), 1);
    }

    #[test]
    fn test_scroll() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10);
        for i in 0..5 {
            app.push_event(make_event(&format!("s{}", i), "t"));
        }

        assert_eq!(app.scroll_offset, 0);
        app.scroll_down();
        assert_eq!(app.scroll_offset, 1);
        app.scroll_down();
        app.scroll_down();
        app.scroll_down();
        assert_eq!(app.scroll_offset, 4);
        app.scroll_down();
        assert_eq!(app.scroll_offset, 4);

        app.scroll_up();
        assert_eq!(app.scroll_offset, 3);
        app.scroll_offset = 0;
        app.scroll_up();
        assert_eq!(app.scroll_offset, 0);
    }

    #[test]
    fn test_clear_events() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10);
        app.push_event(make_event("a", "t"));
        app.scroll_offset = 5;

        app.clear_events();
        assert!(app.events.is_empty());
        assert_eq!(app.scroll_offset, 0);
    }

    #[test]
    fn test_handle_command_response_running() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10);
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
        let mut app = App::new("ws://localhost:9000".to_string(), 10);
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
        let mut app = App::new("ws://localhost:9000".to_string(), 10);
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
    fn test_handle_agent_response_creates_event() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10);
        app.pending_response = true;

        let resp = AgentResponse {
            id: "1".to_string(),
            status: AgentStatus::Success,
            summary: Some("Task completed".to_string()),
            question: None,
            conversation_id: None,
        };

        app.handle_agent_response(resp);
        assert_eq!(app.events.len(), 1);
        let event = app.events.back().unwrap();
        assert_eq!(event.source, "agent");
        assert_eq!(event.event_type, "agent_success");
    }

    #[test]
    fn test_handle_agent_response_error_sets_last_error() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10);
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
}
