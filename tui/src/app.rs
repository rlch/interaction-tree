use std::collections::VecDeque;

use tui_tree_widget::TreeState;

use crate::flutter_log::FlutterLogEntry;
use crate::project::ProjectInfo;
use crate::tree_format::CompactTree;
use crate::ws::protocol::{AgentResponse, AgentStatus, CommandResponse, MonitoringEvent, Session};

/// Actions available for interaction menu
#[derive(Debug, Clone, PartialEq)]
pub enum InteractionAction {
    Tap,
    LongPress,
    DoubleTap,
    Scroll { dx: f64, dy: f64 },
    EnterText(String),
    Custom(String),
}

/// Log viewer mode (vim-like)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum LogViewMode {
    #[default]
    Normal,
    Visual,
}

/// State for vim-like log viewing with cursor and selection
#[derive(Debug, Clone, Default)]
pub struct LogViewState {
    pub cursor: usize,
    pub scroll: usize,
    pub anchor: Option<usize>,
    pub mode: LogViewMode,
}

impl LogViewState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn selection_range(&self) -> Option<(usize, usize)> {
        self.anchor.map(|anchor| {
            let start = anchor.min(self.cursor);
            let end = anchor.max(self.cursor);
            (start, end)
        })
    }

    pub fn is_selected(&self, line: usize) -> bool {
        match self.mode {
            LogViewMode::Normal => false,
            LogViewMode::Visual => {
                if let Some((start, end)) = self.selection_range() {
                    line >= start && line <= end
                } else {
                    false
                }
            }
        }
    }

    pub fn cursor_up(&mut self, viewport_height: usize) {
        if self.cursor > 0 {
            self.cursor -= 1;
            self.ensure_cursor_visible(viewport_height);
        }
    }

    pub fn cursor_down(&mut self, total_lines: usize, viewport_height: usize) {
        if total_lines > 0 && self.cursor < total_lines - 1 {
            self.cursor += 1;
            self.ensure_cursor_visible(viewport_height);
        }
    }

    pub fn cursor_top(&mut self) {
        self.cursor = 0;
        self.scroll = 0;
    }

    pub fn cursor_bottom(&mut self, total_lines: usize, viewport_height: usize) {
        if total_lines > 0 {
            self.cursor = total_lines - 1;
            self.ensure_cursor_visible(viewport_height);
        }
    }

    pub fn enter_visual(&mut self) {
        self.mode = LogViewMode::Visual;
        self.anchor = Some(self.cursor);
    }

    pub fn exit_visual(&mut self) {
        self.mode = LogViewMode::Normal;
        self.anchor = None;
    }

    pub fn toggle_visual(&mut self) {
        match self.mode {
            LogViewMode::Normal => self.enter_visual(),
            LogViewMode::Visual => self.exit_visual(),
        }
    }

    pub fn ensure_cursor_visible(&mut self, viewport_height: usize) {
        if viewport_height == 0 {
            return;
        }
        if self.cursor < self.scroll {
            self.scroll = self.cursor;
        }
        if self.cursor >= self.scroll + viewport_height {
            self.scroll = self.cursor - viewport_height + 1;
        }
    }

    pub fn clamp_cursor(&mut self, total_lines: usize) {
        if total_lines == 0 {
            self.cursor = 0;
            self.scroll = 0;
        } else if self.cursor >= total_lines {
            self.cursor = total_lines - 1;
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct InteractionTree {
    pub nodes: Vec<TreeNode>,
    #[allow(dead_code)]
    pub last_updated: Option<String>,
}

/// Session-specific state that should be reset when switching sessions.
/// This encapsulates TUI-only data that belongs to a particular session.
/// Note: app_status, pid, vmServiceUri are stored in the Session struct (from daemon),
/// NOT here, to avoid duplicate sources of truth.
#[derive(Debug, Default)]
pub struct SessionState {
    pub flutter_logs: VecDeque<FlutterLogEntry>,
    pub agent_events: VecDeque<MonitoringEvent>,
    pub interaction_logs: VecDeque<LogEntry>,
    pub tree: Option<InteractionTree>,
    pub tree_state: TreeState<String>,
    
    pub agent_question: Option<String>,
    pub pending_response: bool,
    pub pending_intent: Option<String>,
    pub last_agent_error: Option<String>,
    /// Chat messages for the Agent pane
    pub chat_messages: Vec<crate::chat::ChatMessage>,
    /// Current streaming response from agent
    pub chat_streaming: Option<crate::chat::StreamingState>,
    /// Composer text input for agent chat
    pub chat_input: String,
    /// Cursor position in chat input
    pub chat_cursor: usize,
}

impl SessionState {
    pub fn new(max_events: usize) -> Self {
        Self {
            flutter_logs: VecDeque::with_capacity(max_events),
            agent_events: VecDeque::with_capacity(max_events),
            interaction_logs: VecDeque::with_capacity(max_events),
            tree: None,
            tree_state: TreeState::default(),
            
            agent_question: None,
            pending_response: false,
            pending_intent: None,
            last_agent_error: None,
            chat_messages: Vec::new(),
            chat_streaming: None,
            chat_input: String::new(),
            chat_cursor: 0,
        }
    }

    pub fn reset(&mut self, max_events: usize) {
        self.flutter_logs = VecDeque::with_capacity(max_events);
        self.agent_events = VecDeque::with_capacity(max_events);
        self.interaction_logs = VecDeque::with_capacity(max_events);
        self.tree = None;
        self.tree_state = TreeState::default();
        
        self.agent_question = None;
        self.pending_response = false;
        self.pending_intent = None;
        self.last_agent_error = None;
        self.chat_messages.clear();
        self.chat_streaming = None;
        self.chat_input.clear();
        self.chat_cursor = 0;
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextInfo {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeNode {
    pub id: String,
    #[serde(default)]
    pub widget_type: Option<String>,
    #[serde(default)]
    pub capabilities: Vec<Capability>,
    #[serde(default)]
    pub actions: Vec<Action>,
    #[serde(default)]
    pub children: Vec<TreeNode>,
    #[serde(default)]
    pub contexts: Vec<ContextInfo>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Capability {
    #[serde(rename = "type")]
    pub capability_type: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Action {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WsState {
    Disconnected,
    Connecting,
    Connected,
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
    /// Action menu for tree node interactions
    ActionMenu,
    /// Agent chat input mode (focused on Agent tab)
    AgentChat,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ContentTab {
    /// Flutter logs (from flutter run process)
    #[default]
    Flutter,
    /// Agent conversation and tool calls
    Agent,
    /// Interaction execution history
    Interactions,
    /// Interaction tree viewer
    Tree,
}

impl ContentTab {
    pub fn next(self) -> Self {
        match self {
            ContentTab::Flutter => ContentTab::Agent,
            ContentTab::Agent => ContentTab::Interactions,
            ContentTab::Interactions => ContentTab::Tree,
            ContentTab::Tree => ContentTab::Flutter,
        }
    }

    pub fn prev(self) -> Self {
        match self {
            ContentTab::Flutter => ContentTab::Tree,
            ContentTab::Agent => ContentTab::Flutter,
            ContentTab::Interactions => ContentTab::Agent,
            ContentTab::Tree => ContentTab::Interactions,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            ContentTab::Flutter => "Flutter",
            ContentTab::Agent => "Agent",
            ContentTab::Interactions => "Interactions",
            ContentTab::Tree => "Tree",
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

    /// Session-specific state (logs, tree, agent state, etc.)
    pub session: SessionState,
    pub max_events: usize,

    pub mode: Mode,
    pub input_buffer: String,
    pub filter: Option<String>,
    pub content_tab: ContentTab,
    pub scroll_offset: usize,

    /// Log viewer state (cursor, selection, viewport)
    pub log_view: LogViewState,
    /// Cached viewport height for log navigation
    pub log_viewport_height: usize,

    pub needs_tree_fetch: bool,
    pub pending_session_connect: Option<String>,

    pub throbber_state: throbber_widgets_tui::ThrobberState,

    pub toasts: VecDeque<Toast>,
    pub toast_ttl_secs: u64,

    /// Action menu items (label, action)
    pub action_menu_items: Vec<(String, InteractionAction)>,
    /// Currently selected index in action menu
    pub action_menu_index: usize,
    /// Currently selected node ID for action menu
    pub action_menu_node_id: Option<String>,

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

            session: SessionState::new(max_events),
            max_events,

            mode: Mode::SessionPicker,
            input_buffer: String::new(),
            filter: None,
            content_tab: ContentTab::default(),
            scroll_offset: 0,

            log_view: LogViewState::new(),
            log_viewport_height: 0,

            needs_tree_fetch: false,
            pending_session_connect: None,

            throbber_state: throbber_widgets_tui::ThrobberState::default(),

            toasts: VecDeque::new(),
            toast_ttl_secs: 5,

            action_menu_items: Vec::new(),
            action_menu_index: 0,
            action_menu_node_id: None,

            should_quit: false,
        }
    }

    /// Build and show action menu for the currently selected tree node
    pub fn show_action_menu(&mut self) {
        let caps = self.selected_node_capabilities();
        let actions = self.selected_node_actions();
        let node_id = self.selected_node_id();

        if caps.is_empty() && actions.is_empty() {
            return;
        }

        let mut items: Vec<(String, InteractionAction)> = Vec::new();

        // Capabilities as menu items
        if caps.contains(&"tap".to_string()) {
            items.push(("Tap".to_string(), InteractionAction::Tap));
        }
        if caps.contains(&"longPress".to_string()) {
            items.push(("Long Press".to_string(), InteractionAction::LongPress));
        }
        if caps.contains(&"doubleTap".to_string()) {
            items.push(("Double Tap".to_string(), InteractionAction::DoubleTap));
        }
        if caps.contains(&"scroll".to_string()) {
            items.push(("Scroll Up".to_string(), InteractionAction::Scroll { dx: 0.0, dy: -100.0 }));
            items.push(("Scroll Down".to_string(), InteractionAction::Scroll { dx: 0.0, dy: 100.0 }));
        }
        if caps.contains(&"enterText".to_string()) {
            items.push(("Enter Text...".to_string(), InteractionAction::EnterText(String::new())));
        }

        // Custom actions
        for action in actions {
            items.push((action.clone(), InteractionAction::Custom(action)));
        }

        if !items.is_empty() {
            self.action_menu_items = items;
            self.action_menu_index = 0;
            self.action_menu_node_id = node_id;
            self.mode = Mode::ActionMenu;
        }
    }

    /// Get currently selected action from menu
    pub fn selected_action(&self) -> Option<&InteractionAction> {
        self.action_menu_items.get(self.action_menu_index).map(|(_, a)| a)
    }

    /// Move action menu selection up
    pub fn action_menu_up(&mut self) {
        if !self.action_menu_items.is_empty() {
            if self.action_menu_index > 0 {
                self.action_menu_index -= 1;
            } else {
                self.action_menu_index = self.action_menu_items.len() - 1;
            }
        }
    }

    /// Move action menu selection down
    pub fn action_menu_down(&mut self) {
        if !self.action_menu_items.is_empty() {
            self.action_menu_index = (self.action_menu_index + 1) % self.action_menu_items.len();
        }
    }

    /// Reset all session-specific state. Called when switching sessions.
    pub fn reset_session_state(&mut self) {
        self.session.reset(self.max_events);
        self.scroll_offset = 0;
        self.filter = None;
        self.needs_tree_fetch = false;
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

    /// Get the currently selected session (single source of truth for session state)
    pub fn current_session(&self) -> Option<&Session> {
        let result = self.selected_session.as_ref()
            .and_then(|id| self.sessions.iter().find(|s| s.id == *id));
        if let Some(session) = &result {
            tracing::debug!(
                session_id = %session.id,
                app_status = %session.app_status,
                sessions_count = self.sessions.len(),
                "current_session lookup"
            );
        }
        result
    }

    /// Get the currently selected session mutably
    pub fn current_session_mut(&mut self) -> Option<&mut Session> {
        let selected_id = self.selected_session.clone();
        selected_id.and_then(move |id| self.sessions.iter_mut().find(|s| s.id == id))
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
        self.session.tree = Some(tree);
        self.session.tree_state = TreeState::default();
        // Expand tree by default - open root node
        self.session.tree_state.open(vec!["root".to_string()]);
        // Select root by default
        self.session.tree_state.select(vec!["root".to_string()]);
    }

    pub fn compact_tree(&self) -> Option<CompactTree> {
        self.session.tree.as_ref().map(|t| {
            let (compact, _warnings) = CompactTree::from_tree_nodes(&t.nodes);
            compact
        })
    }

    /// Get capabilities for the currently selected tree node
    pub fn selected_node_capabilities(&self) -> Vec<String> {
        let compact = match self.compact_tree() {
            Some(c) => c,
            None => return Vec::new(),
        };

        // Get selected identifier from tree state
        let selected = self.session.tree_state.selected();
        if selected.is_empty() {
            return Vec::new();
        }

        // Extract the ID from the last segment (format: "id_index" or just "id")
        let last_id = selected.last().unwrap();
        let node_id = last_id.split('_').next().unwrap_or(last_id);

        // Look up capabilities in schema
        if let Some(schema) = compact.schemas.get(node_id) {
            return schema.capabilities.clone();
        }

        Vec::new()
    }

    /// Get actions for the currently selected tree node
    pub fn selected_node_actions(&self) -> Vec<String> {
        let compact = match self.compact_tree() {
            Some(c) => c,
            None => return Vec::new(),
        };

        let selected = self.session.tree_state.selected();
        if selected.is_empty() {
            return Vec::new();
        }

        let last_id = selected.last().unwrap();
        let node_id = last_id.split('_').next().unwrap_or(last_id);

        if let Some(schema) = compact.schemas.get(node_id) {
            return schema.actions.clone();
        }

        Vec::new()
    }

    /// Get the ID of the currently selected tree node (for interaction execution)
    pub fn selected_node_id(&self) -> Option<String> {
        let selected = self.session.tree_state.selected();
        if selected.is_empty() {
            return None;
        }

        let last_id = selected.last().unwrap();
        let node_id = last_id.split('_').next().unwrap_or(last_id);

        // Don't return special IDs
        if node_id == "root" || node_id == "ctx" || node_id == "het" || node_id == "var" {
            return None;
        }

        Some(node_id.to_string())
    }

    pub fn push_interaction_log(&mut self, entry: LogEntry) {
        if self.session.interaction_logs.len() >= self.max_events {
            self.session.interaction_logs.pop_front();
        }
        self.session.interaction_logs.push_back(entry);
    }

    pub fn push_flutter_log(&mut self, entry: FlutterLogEntry) {
        // Check if cursor is at the bottom before adding (for auto-follow)
        let was_at_bottom = self.session.flutter_logs.is_empty()
            || self.log_view.cursor >= self.session.flutter_logs.len().saturating_sub(1);

        if self.session.flutter_logs.len() >= self.max_events {
            self.session.flutter_logs.pop_front();
            // Adjust cursor if we removed an entry above it
            if self.log_view.cursor > 0 {
                self.log_view.cursor = self.log_view.cursor.saturating_sub(1);
            }
            if self.log_view.scroll > 0 {
                self.log_view.scroll = self.log_view.scroll.saturating_sub(1);
            }
        }
        self.session.flutter_logs.push_back(entry);

        // Auto-follow: move cursor to new bottom if it was at the bottom
        if was_at_bottom {
            let new_count = self.session.flutter_logs.len();
            if new_count > 0 {
                self.log_view.cursor = new_count - 1;
                self.log_view.ensure_cursor_visible(self.log_viewport_height);
            }
        }
    }

    pub fn push_agent_event(&mut self, event: MonitoringEvent) {
        if self.session.agent_events.len() >= self.max_events {
            self.session.agent_events.pop_front();
        }
        self.session.agent_events.push_back(event);
    }

    pub fn push_event(&mut self, event: MonitoringEvent) {
        let source = event.source.to_lowercase();
        let event_type = event.event_type.to_lowercase();

        // Handle session status changes to update app_status
        if event_type == "session.status_changed" {
            self.handle_session_status_event(&event.payload);
            return;
        }

        // Handle session destroyed - remove from local list
        if event_type == "session.destroyed" {
            if let Some(session_id) = event.payload.get("sessionId").and_then(|s| s.as_str()) {
                self.sessions.retain(|s| s.id != session_id);
                // Adjust picker index if needed
                if self.session_picker_index >= self.sessions.len() && !self.sessions.is_empty() {
                    self.session_picker_index = self.sessions.len() - 1;
                }
                // Clear selected session if it was destroyed
                if self.selected_session.as_deref() == Some(session_id) {
                    self.selected_session = None;
                    self.reset_session_state();
                }
            }
            return;
        }

        // Handle session created - add to local list
        if event_type == "session.created" {
            if let Some(session_data) = event.payload.get("session") {
                if let Ok(session) = serde_json::from_value::<Session>(session_data.clone()) {
                    // Only add if not already present
                    if !self.sessions.iter().any(|s| s.id == session.id) {
                        self.sessions.push(session);
                    }
                }
            }
            return;
        }

        // Handle tree updates
        if event_type == "tree.updated" {
            if let Some(tree_data) = event.payload.get("tree").and_then(|t| t.as_array()) {
                let nodes = Self::parse_tree_nodes(tree_data);
                let tree = InteractionTree {
                    nodes,
                    last_updated: Some(chrono::Utc::now().to_rfc3339()),
                };
                self.set_tree(tree);
            }
            return;
        }

        if source.contains("agent") || event_type.starts_with("agent_") || event_type.contains("tool") {
            self.push_agent_event(event);
        } else if event_type == "flutter.launching" {
            // Skip launching event - it's just metadata, not a log line
            return;
        } else if source.contains("flutter") || event_type.starts_with("flutter.") {
            // Flutter logs go to Flutter tab
            let line = extract_flutter_log(&event.payload);
            let entry = FlutterLogEntry::parse(&line);
            self.push_flutter_log(entry);
        } else if event_type.contains("interaction") || event_type.contains("tap") || event_type.contains("scroll") {
            // Interaction events (execute_interaction, taps, scrolls)
            let entry = LogEntry {
                ts: event.ts.clone(),
                level: LogLevel::Info,
                message: format_interaction_event(&event.payload),
            };
            self.push_interaction_log(entry);
        }
    }

    fn handle_session_status_event(&mut self, payload: &serde_json::Value) {
       let event_session_id = payload.get("sessionId").and_then(|s| s.as_str());
       let status = payload.get("status").and_then(|s| s.as_str());
       let pid = payload.get("pid").and_then(|p| p.as_u64());
       let uri = payload.get("vmServiceUri").and_then(|u| u.as_str());
       
       tracing::info!(
           event_session_id = ?event_session_id,
           selected_session = ?self.selected_session,
           status = ?status,
           pid = ?pid,
           uri = ?uri,
           sessions_count = self.sessions.len(),
           "handle_session_status_event received"
       );

       // Update the Session in the sessions list (always, not just selected session)
       // This ensures we have accurate state when user switches sessions
       if let Some(session_id) = event_session_id {
           let session_ids: Vec<String> = self.sessions.iter().map(|s| s.id.clone()).collect();
           tracing::debug!(session_id = session_id, available_sessions = ?session_ids, "Looking for session");
           
           let found = if let Some(session) = self.sessions.iter_mut().find(|s| s.id == session_id) {
               let old_status = session.app_status.clone();
               if let Some(status) = status {
                   session.app_status = status.to_string();
                   tracing::info!(
                       session_id = session_id, 
                       old_status = %old_status,
                       new_status = status, 
                       "Updated session.app_status"
                   );
               }
               if let Some(pid) = pid {
                   session.pid = Some(pid as u32);
               }
               if let Some(uri) = uri {
                   session.vm_service_uri = Some(uri.to_string());
               }
               
               // Note: Don't auto-fetch tree here - the daemon broadcasts tree.updated
               // automatically after connecting to the VM service
               true
           } else {
               false
           };
           
           if !found {
               tracing::warn!(
                   session_id = session_id,
                   available_sessions = ?session_ids,
                   "Session NOT FOUND in sessions list!"
               );
           }
       }
    }

    pub fn filtered_interaction_logs(&self) -> impl Iterator<Item = &LogEntry> {
        let filter = self.filter.clone();
        self.session.interaction_logs.iter().filter(move |e| {
            let Some(ref pattern) = filter else {
                return true;
            };
            let pattern_lower = pattern.to_lowercase();
            e.message.to_lowercase().contains(&pattern_lower)
        })
    }

    pub fn filtered_flutter_logs(&self) -> impl Iterator<Item = &FlutterLogEntry> {
        let filter = self.filter.clone();
        self.session.flutter_logs.iter().filter(move |e| {
            if e.is_noise() {
                return false;
            }
            let Some(ref pattern) = filter else {
                return true;
            };
            let pattern_lower = pattern.to_lowercase();
            e.raw.to_lowercase().contains(&pattern_lower)
        })
    }

    pub fn filtered_agent_events(&self) -> impl Iterator<Item = &MonitoringEvent> {
        let filter = self.filter.clone();
        self.session.agent_events.iter().filter(move |e| {
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

            // Check if this is a session response (from create_session or connect_session)
            if let Some(session) = resp.data.get("session") {
                match serde_json::from_value::<Session>(session.clone()) {
                    Ok(parsed) => {
                        let session_id = parsed.id.clone();
                        let is_new_session;
                        // Update existing session or add new one
                        if let Some(existing) = self.sessions.iter_mut().find(|s| s.id == session_id) {
                            // Update the existing session with latest data from server
                            tracing::info!(
                                session_id = %session_id,
                                old_status = %existing.app_status,
                                new_status = %parsed.app_status,
                                "Updating existing session from response"
                            );
                            existing.app_status = parsed.app_status;
                            existing.pid = parsed.pid;
                            existing.vm_service_uri = parsed.vm_service_uri;
                            is_new_session = false;
                        } else {
                            // New session, add to list
                            tracing::info!(session_id = %session_id, "Adding new session to list");
                            self.sessions.push(parsed);
                            self.push_toast(Toast::success("Session created"));
                            is_new_session = true;
                        }
                        // Reset state if switching to a different session
                        let switching = self.selected_session.as_deref() != Some(&session_id);
                        if switching || is_new_session {
                            self.reset_session_state();
                        }
                        self.selected_session = Some(session_id);
                        if let Some(idx) = self.sessions.iter().position(|s| s.id == self.selected_session.as_deref().unwrap_or_default()) {
                            self.session_picker_index = idx;
                        }
                        self.mode = Mode::Normal;
                    }
                    Err(e) => {
                        tracing::error!(?e, ?session, "Failed to parse session response");
                        self.push_toast(Toast::error(&format!("Parse error: {}", e)));
                    }
                }
                return;
            }

            // Check for app status from response - update Session in sessions list
            if let Some(status) = resp.data.get("status").and_then(|s| s.as_str()) {
                if let Some(session) = self.current_session_mut() {
                    session.app_status = status.to_string();
                    if status == "running" {
                        session.pid = resp.data.get("pid").and_then(|p| p.as_u64()).map(|p| p as u32);
                        session.vm_service_uri = resp.data.get("uri").and_then(|u| u.as_str()).map(String::from);
                    }
                }
                // Note: Don't auto-fetch tree - daemon broadcasts tree.updated after VM connects
            } else if resp.data.get("pid").is_some() {
                // run_app response returns { pid, vmServiceUri } - update pid/uri but NOT status
                // Status is already updated via session.status_changed events
                if let Some(session) = self.current_session_mut() {
                    session.pid = resp.data.get("pid").and_then(|p| p.as_u64()).map(|p| p as u32);
                    if let Some(uri) = resp.data.get("vmServiceUri").and_then(|u| u.as_str()) {
                        session.vm_service_uri = Some(uri.to_string());
                    }
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
                let capabilities = t
                    .get("capabilities")
                    .and_then(|c| c.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|cap| {
                                // Support both formats:
                                // - Object: {"type": "tap"}
                                // - String: "tap"
                                cap.get("type")
                                    .and_then(|t| t.as_str())
                                    .map(|s| s.to_string())
                                    .or_else(|| cap.as_str().map(|s| s.to_string()))
                                    .map(|s| Capability { capability_type: s })
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                let actions = t
                    .get("actions")
                    .and_then(|a| a.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|act| {
                                act.get("name")
                                    .and_then(|n| n.as_str())
                                    .map(|name| Action {
                                        name: name.to_string(),
                                        description: act.get("description").and_then(|d| d.as_str()).map(String::from),
                                    })
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                let children = t
                    .get("children")
                    .and_then(|c| c.as_array())
                    .map(|arr| Self::parse_tree_nodes(arr))
                    .unwrap_or_default();
                let contexts = t
                    .get("contexts")
                    .and_then(|c| c.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|ctx| {
                                let name = ctx.get("name")?.as_str()?.to_string();
                                let description = ctx.get("description").and_then(|d| d.as_str()).map(String::from);
                                Some(ContextInfo { name, description })
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                Some(TreeNode {
                    id,
                    widget_type,
                    capabilities,
                    actions,
                    children,
                    contexts,
                })
            })
            .collect()
    }

    pub fn handle_agent_response(&mut self, resp: AgentResponse) {
        self.session.pending_response = false;

        let event = resp.to_monitoring_event();
        self.push_event(event);

        match resp.status {
            AgentStatus::Success => {
                
                self.session.agent_question = None;
                self.session.last_agent_error = None;
            }
            AgentStatus::NeedsContext => {
                // Daemon manages session internally
                self.session.agent_question = resp.question;
                self.session.last_agent_error = None;
            }
            AgentStatus::Error => {
                self.session.agent_question = None;
                let error_msg = resp.error.or(resp.summary);
                if let Some(ref err) = error_msg {
                    self.push_toast(Toast::error(err));
                    self.session.chat_messages.push(crate::chat::ChatMessage::assistant(format!("Error: {}", err)));
                }
                self.session.last_agent_error = error_msg;
                self.session.chat_streaming = None;
            }
        }
    }

    pub fn handle_agent_stream_event(&mut self, event: crate::ws::protocol::AgentStreamEvent) {
        use crate::ws::protocol::AgentEventKind;
        use crate::chat::{ChatMessage, ToolCall, ToolStatus, StreamingState};
        
        // Ensure we have streaming state
        if self.session.chat_streaming.is_none() {
            self.session.chat_streaming = Some(StreamingState::default());
        }
        
        match event.event {
            AgentEventKind::TextDelta { text } => {
                if let Some(streaming) = &mut self.session.chat_streaming {
                    streaming.text_buffer.push_str(&text);
                }
            }
            AgentEventKind::ToolCallStart { tool_name, tool_call_id } => {
                if let Some(streaming) = &mut self.session.chat_streaming {
                    streaming.tool_calls.push(ToolCall {
                        id: tool_call_id,
                        name: tool_name,
                        args: serde_json::Value::Null,
                        status: ToolStatus::Running,
                        output: None,
                    });
                }
            }
            AgentEventKind::ToolCallEnd { tool_call_id, result, .. } => {
                if let Some(streaming) = &mut self.session.chat_streaming {
                    if let Some(call) = streaming.tool_calls.iter_mut().find(|c| c.id == tool_call_id) {
                        call.status = ToolStatus::Success;
                        call.output = result;
                    }
                }
            }
            AgentEventKind::TaskComplete { summary: _ } => {
                // Finalize streaming into messages
                if let Some(streaming) = self.session.chat_streaming.take() {
                    if !streaming.text_buffer.is_empty() {
                        self.session.chat_messages.push(ChatMessage::assistant(streaming.text_buffer));
                    }
                    if !streaming.tool_calls.is_empty() {
                        self.session.chat_messages.push(ChatMessage::assistant_tools(streaming.tool_calls));
                    }
                }
                self.session.pending_response = false;
                
            }
            AgentEventKind::Error { message } => {
                self.session.chat_streaming = None;
                self.session.pending_response = false;
                self.session.chat_messages.push(ChatMessage::assistant(format!("Error: {}", message)));
                self.push_toast(Toast::error(&message));
            }
        }
    }

    pub fn in_answer_mode(&self) -> bool {
        self.session.agent_question.is_some()
    }

    pub fn is_app_running(&self) -> bool {
        self.current_session()
            .map(|s| matches!(s.app_status.as_str(), "running" | "starting"))
            .unwrap_or(false)
    }

    pub fn has_session(&self) -> bool {
        self.selected_session.is_some()
    }

    pub fn cancel_answer_mode(&mut self) {
        
        self.session.agent_question = None;
    }

    pub fn scroll_up(&mut self) {
        if self.content_tab == ContentTab::Flutter {
            let count = self.current_log_count();
            self.log_view.cursor_up(self.log_viewport_height);
            self.log_view.clamp_cursor(count);
        } else {
            self.scroll_offset = self.scroll_offset.saturating_sub(1);
        }
    }

    pub fn scroll_down(&mut self) {
        if self.content_tab == ContentTab::Flutter {
            let count = self.current_log_count();
            self.log_view.cursor_down(count, self.log_viewport_height);
        } else {
            let event_count = match self.content_tab {
                ContentTab::Flutter => 0, // Handled above
                ContentTab::Agent => self.filtered_agent_events().count(),
                ContentTab::Interactions => self.filtered_interaction_logs().count(),
                ContentTab::Tree => return, // Tree uses tree_state navigation
            };
            if event_count > 0 && self.scroll_offset < event_count - 1 {
                self.scroll_offset += 1;
            }
        }
    }

    pub fn scroll_to_top(&mut self) {
        self.log_view.cursor_top();
        self.scroll_offset = 0;
    }

    pub fn scroll_to_bottom(&mut self) {
        let count = self.current_log_count();
        self.log_view.cursor_bottom(count, self.log_viewport_height);
        if count > 0 {
            self.scroll_offset = count.saturating_sub(1);
        }
    }

    pub fn toggle_visual_mode(&mut self) {
        self.log_view.toggle_visual();
    }

    pub fn exit_visual_mode(&mut self) {
        self.log_view.exit_visual();
    }

    pub fn in_visual_mode(&self) -> bool {
        self.log_view.mode == LogViewMode::Visual
    }

    pub fn current_log_count(&self) -> usize {
        match self.content_tab {
            ContentTab::Flutter => self.filtered_flutter_logs().count(),
            ContentTab::Agent => self.filtered_agent_events().count(),
            ContentTab::Interactions => self.filtered_interaction_logs().count(),
            ContentTab::Tree => 0,
        }
    }

    pub fn yank_logs(&mut self) -> Option<String> {
        if self.content_tab != ContentTab::Flutter {
            return None;
        }

        let logs: Vec<&FlutterLogEntry> = self.filtered_flutter_logs().collect();
        if logs.is_empty() {
            return None;
        }

        let text = if self.in_visual_mode() {
            if let Some((start, end)) = self.log_view.selection_range() {
                let lines: Vec<String> = logs
                    .into_iter()
                    .enumerate()
                    .filter(|(i, _)| *i >= start && *i <= end)
                    .map(|(_, log)| log.to_plain_text())
                    .collect();
                self.exit_visual_mode();
                if lines.is_empty() { None } else { Some(lines.join("
")) }
            } else {
                None
            }
        } else {
            logs.get(self.log_view.cursor).map(|log| log.to_plain_text())
        };

        text
    }

    pub fn tree_up(&mut self) {
        self.session.tree_state.key_up();
    }

    pub fn tree_down(&mut self) {
        self.session.tree_state.key_down();
    }

    pub fn tree_toggle(&mut self) {
        self.session.tree_state.toggle_selected();
    }

    pub fn tree_left(&mut self) {
        self.session.tree_state.key_left();
    }

    pub fn tree_right(&mut self) {
        self.session.tree_state.key_right();
    }

    pub fn tree_selected(&self) -> Option<&String> {
        self.session.tree_state.selected().last()
    }

    pub fn clear_events(&mut self) {
        self.session.flutter_logs.clear();
        self.session.agent_events.clear();
        self.session.interaction_logs.clear();
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

    /// Select a session from the picker. Returns true if a different session was selected.
    pub fn session_picker_select(&mut self) -> bool {
        let Some(session) = self.sessions.get(self.session_picker_index).cloned() else {
            self.mode = Mode::Normal;
            return false;
        };

        // Check if selecting the same session - no-op
        if self.selected_session.as_deref() == Some(&session.id) {
            self.mode = Mode::Normal;
            return false;
        }

        // Switching to a different session - reset all session state
        self.reset_session_state();
        self.selected_session = Some(session.id.clone());
        self.mode = Mode::Normal;
        true
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

fn format_interaction_event(payload: &serde_json::Value) -> String {
    let id = payload.get("id").and_then(|v| v.as_str()).unwrap_or("?");
    let interaction = payload.get("interaction").and_then(|v| v.as_str()).unwrap_or("?");
    let result = payload.get("result").and_then(|v| v.as_object());
    
    let success = result
        .and_then(|r| r.get("success"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    
    let status = if success { "✓" } else { "✗" };
    
    // Include args if present (e.g., text for enterText)
    let args_str = if let Some(args) = payload.get("args").and_then(|v| v.as_object()) {
        if let Some(text) = args.get("text").and_then(|v| v.as_str()) {
            format!(" \"{}\"", truncate(text, 20))
        } else if args.is_empty() {
            String::new()
        } else {
            format!(" {:?}", args.keys().collect::<Vec<_>>())
        }
    } else {
        String::new()
    };
    
    format!("{} {}({}){}",status, interaction, id, args_str)
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

    fn test_session() -> Session {
        Session {
            id: "test-session-1".to_string(),
            name: "test".to_string(),
            project_path: "/test/project".to_string(),
            app_status: "not_running".to_string(),
            vm_service_uri: None,
            pid: None,
            connected_clients: vec![],
            created_at: "2024-01-01T00:00:00Z".to_string(),
            last_active_at: "2024-01-01T00:00:00Z".to_string(),
        }
    }

    fn app_with_session() -> App {
        let mut app = App::new("ws://localhost:9000".to_string(), 10, test_project());
        app.sessions.push(test_session());
        app.selected_session = Some("test-session-1".to_string());
        app.mode = Mode::Normal;
        app
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
    fn test_push_interaction_log_trims_to_max() {
        let mut app = App::new("ws://localhost:9000".to_string(), 3, test_project());
        for i in 0..4 {
            app.push_interaction_log(LogEntry {
                ts: format!("2024-01-01T00:00:0{}Z", i),
                level: LogLevel::Info,
                message: format!("msg{}", i),
            });
        }

        assert_eq!(app.session.interaction_logs.len(), 3);
        assert!(app.session.interaction_logs[0].message.contains("msg1"));
        assert!(app.session.interaction_logs[2].message.contains("msg3"));
    }

    #[test]
    fn test_content_tab_cycling() {
        assert_eq!(ContentTab::Flutter.next(), ContentTab::Agent);
        assert_eq!(ContentTab::Agent.next(), ContentTab::Interactions);
        assert_eq!(ContentTab::Interactions.next(), ContentTab::Tree);
        assert_eq!(ContentTab::Tree.next(), ContentTab::Flutter);

        assert_eq!(ContentTab::Flutter.prev(), ContentTab::Tree);
        assert_eq!(ContentTab::Tree.prev(), ContentTab::Interactions);
        assert_eq!(ContentTab::Agent.prev(), ContentTab::Flutter);
    }

    #[test]
    fn test_clear_events() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10, test_project());
        app.push_event(make_event("flutter", "flutter.log"));
        app.push_event(make_event("agent", "tool_call"));
        app.scroll_offset = 5;

        app.clear_events();
        assert!(app.session.flutter_logs.is_empty());
        assert!(app.session.agent_events.is_empty());
        assert_eq!(app.scroll_offset, 0);
    }

    #[test]
    fn test_handle_command_response_running() {
        let mut app = app_with_session();
        let resp = CommandResponse {
            id: "1".to_string(),
            success: true,
            data: serde_json::json!({"status": "running", "pid": 1234, "uri": "ws://127.0.0.1:5678"}),
            error: None,
        };

        app.handle_command_response(resp);
        let session = app.current_session().expect("should have session");
        assert_eq!(session.app_status, "running");
        assert_eq!(session.pid, Some(1234));
        assert_eq!(session.vm_service_uri.as_deref(), Some("ws://127.0.0.1:5678"));
    }

    #[test]
    fn test_handle_agent_response_needs_context() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10, test_project());
        app.session.pending_response = true;

        let resp = AgentResponse {
            id: "1".to_string(),
            status: AgentStatus::NeedsContext,
            summary: None,
            question: Some("Which button?".to_string()), sdk_session_id: None,
        };

        app.handle_agent_response(resp);
        assert!(!app.session.pending_response);
    }

    #[test]
    fn test_handle_agent_response_success_clears_conversation() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10, test_project());
        app.session.pending_response = true;

        let resp = AgentResponse {
            id: "1".to_string(),
            status: AgentStatus::Success,
            summary: Some("Done".to_string()),
            question: None, sdk_session_id: None,
            
        };

        app.handle_agent_response(resp);
        assert!(!app.session.pending_response);
    }

    #[test]
    fn test_handle_agent_response_creates_agent_event() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10, test_project());
        app.session.pending_response = true;

        let resp = AgentResponse {
            id: "1".to_string(),
            status: AgentStatus::Success,
            summary: Some("Task completed".to_string()),
            question: None, sdk_session_id: None,
            
        };

        app.handle_agent_response(resp);
        assert_eq!(app.session.agent_events.len(), 1);
        let event = app.session.agent_events.back().unwrap();
        assert_eq!(event.source, "agent");
        assert_eq!(event.event_type, "agent_success");
    }

    #[test]
    fn test_handle_agent_response_error_sets_last_error() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10, test_project());
        app.session.pending_response = true;

        let resp = AgentResponse {
            id: "1".to_string(),
            status: AgentStatus::Error,
            summary: Some("Something went wrong".to_string()),
            question: None, sdk_session_id: None,
            
        };

        app.handle_agent_response(resp);
        assert_eq!(app.session.last_agent_error, Some("Something went wrong".to_string()));
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
    fn test_create_session_clears_old_logs() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10, test_project());
        
        // Setup: have an existing session with logs
        app.sessions.push(Session {
            id: "old-session".to_string(),
            name: "old".to_string(),
            project_path: "/old".to_string(),
            app_status: "running".to_string(),
            vm_service_uri: None,
            pid: None,
            connected_clients: Vec::new(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            last_active_at: "2024-01-01T00:00:00Z".to_string(),
        });
        app.selected_session = Some("old-session".to_string());
        app.mode = Mode::Normal;
        
        // Add some logs to the old session
        app.push_interaction_log(LogEntry {
            ts: "2024-01-01T00:00:00Z".to_string(),
            level: LogLevel::Info,
            message: "old session log".to_string(),
        });
        app.session.agent_events.push_back(make_event("agent", "tool_call"));
        
        assert!(!app.session.interaction_logs.is_empty());
        assert!(!app.session.agent_events.is_empty());
        
        // Now create a new session
        let resp = CommandResponse {
            id: "1".to_string(),
            success: true,
            data: serde_json::json!({
                "session": {
                    "id": "new-session",
                    "name": "new",
                    "projectPath": "/new",
                    "appStatus": "not_running",
                    "createdAt": "2024-01-01T00:00:00Z",
                    "lastActiveAt": "2024-01-01T00:00:00Z"
                }
            }),
            error: None,
        };
        
        app.handle_command_response(resp);
        
        // Session should be switched
        assert_eq!(app.selected_session, Some("new-session".to_string()));
        
        // Old logs should be cleared
        assert!(app.session.interaction_logs.is_empty(), "interaction_logs should be cleared");
        assert!(app.session.agent_events.is_empty(), "agent_events should be cleared");
        assert!(app.session.flutter_logs.is_empty(), "flutter_logs should be cleared");
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
                connected_clients: Vec::new(),
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
                connected_clients: Vec::new(),
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

    #[test]
    fn test_session_destroyed_event_removes_session() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10, test_project());
        app.set_sessions(vec![
            Session {
                id: "sess-1".to_string(),
                name: "app1".to_string(),
                project_path: "/path/1".to_string(),
                app_status: "running".to_string(),
                vm_service_uri: None,
                pid: None,
                connected_clients: Vec::new(),
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
                connected_clients: Vec::new(),
                created_at: "2024-01-01T00:00:00Z".to_string(),
                last_active_at: "2024-01-01T00:00:00Z".to_string(),
            },
        ]);

        assert_eq!(app.sessions.len(), 2);
        assert_eq!(app.selected_session, Some("sess-1".to_string()));

        // Simulate session.destroyed event
        let event = MonitoringEvent {
            ts: "2024-01-01T00:00:00Z".to_string(),
            source: "session".to_string(),
            event_type: "session.destroyed".to_string(),
            payload: serde_json::json!({ "sessionId": "sess-1" }),
        };

        app.push_event(event);

        // Session should be removed
        assert_eq!(app.sessions.len(), 1);
        assert_eq!(app.sessions[0].id, "sess-2");
        // Selected session was destroyed, should be cleared
        assert_eq!(app.selected_session, None);
        // Picker index should be adjusted
        assert_eq!(app.session_picker_index, 0);
    }

    #[test]
    fn test_session_destroyed_event_adjusts_picker_index() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10, test_project());
        app.set_sessions(vec![
            Session {
                id: "sess-1".to_string(),
                name: "app1".to_string(),
                project_path: "/path/1".to_string(),
                app_status: "running".to_string(),
                vm_service_uri: None,
                pid: None,
                connected_clients: Vec::new(),
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
                connected_clients: Vec::new(),
                created_at: "2024-01-01T00:00:00Z".to_string(),
                last_active_at: "2024-01-01T00:00:00Z".to_string(),
            },
        ]);

        // Move picker to second session
        app.session_picker_index = 1;

        // Destroy the second session
        let event = MonitoringEvent {
            ts: "2024-01-01T00:00:00Z".to_string(),
            source: "session".to_string(),
            event_type: "session.destroyed".to_string(),
            payload: serde_json::json!({ "sessionId": "sess-2" }),
        };

        app.push_event(event);

        // Session should be removed
        assert_eq!(app.sessions.len(), 1);
        // Picker index should be adjusted to valid range
        assert_eq!(app.session_picker_index, 0);
    }

    #[test]
    fn test_session_created_event_adds_session() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10, test_project());
        assert!(app.sessions.is_empty());

        // Simulate session.created event
        let event = MonitoringEvent {
            ts: "2024-01-01T00:00:00Z".to_string(),
            source: "session".to_string(),
            event_type: "session.created".to_string(),
            payload: serde_json::json!({
                "session": {
                    "id": "sess-new",
                    "name": "new-app",
                    "projectPath": "/path/new",
                    "appStatus": "not_running",
                    "createdAt": "2024-01-01T00:00:00Z",
                    "lastActiveAt": "2024-01-01T00:00:00Z"
                }
            }),
        };

        app.push_event(event);

        // Session should be added
        assert_eq!(app.sessions.len(), 1);
        assert_eq!(app.sessions[0].id, "sess-new");
        assert_eq!(app.sessions[0].name, "new-app");
    }

    #[test]
    fn test_session_switch_clears_logs() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10, test_project());
        app.set_sessions(vec![
            Session {
                id: "sess-1".to_string(),
                name: "app1".to_string(),
                project_path: "/path/1".to_string(),
                app_status: "running".to_string(),
                vm_service_uri: None,
                pid: None,
                connected_clients: Vec::new(),
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
                connected_clients: Vec::new(),
                created_at: "2024-01-01T00:00:00Z".to_string(),
                last_active_at: "2024-01-01T00:00:00Z".to_string(),
            },
        ]);

        // Add some logs to session 1
        app.push_flutter_log(crate::flutter_log::FlutterLogEntry::parse("Log line 1"));
        app.push_flutter_log(crate::flutter_log::FlutterLogEntry::parse("Log line 2"));
        app.push_interaction_log(LogEntry {
            ts: "2024-01-01T00:00:00Z".to_string(),
            level: LogLevel::Info,
            message: "Interaction 1".to_string(),
        });
        app.scroll_offset = 5;

        assert_eq!(app.session.flutter_logs.len(), 2);
        assert_eq!(app.session.interaction_logs.len(), 1);

        // Switch to session 2
        app.session_picker_index = 1;
        let switched = app.session_picker_select();

        assert!(switched);
        assert_eq!(app.selected_session, Some("sess-2".to_string()));

        // Logs should be cleared
        assert!(app.session.flutter_logs.is_empty());
        assert!(app.session.interaction_logs.is_empty());
        assert!(app.session.agent_events.is_empty());
        assert_eq!(app.scroll_offset, 0);
    }

    #[test]
    fn test_selecting_same_session_does_nothing() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10, test_project());
        app.set_sessions(vec![Session {
            id: "sess-1".to_string(),
            name: "app1".to_string(),
            project_path: "/path/1".to_string(),
            app_status: "running".to_string(),
            vm_service_uri: None,
            pid: None,
            connected_clients: Vec::new(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            last_active_at: "2024-01-01T00:00:00Z".to_string(),
        }]);

        // Add some logs
        app.push_flutter_log(crate::flutter_log::FlutterLogEntry::parse("Log line 1"));
        app.push_flutter_log(crate::flutter_log::FlutterLogEntry::parse("Log line 2"));

        assert_eq!(app.session.flutter_logs.len(), 2);
        assert_eq!(app.selected_session, Some("sess-1".to_string()));

        // Try to select the same session
        app.session_picker_index = 0;
        let switched = app.session_picker_select();

        // Should return false and NOT clear logs
        assert!(!switched);
        assert_eq!(app.session.flutter_logs.len(), 2);
        assert_eq!(app.selected_session, Some("sess-1".to_string()));
    }

    #[test]
    fn test_reset_session_state_clears_all() {
        let mut app = App::new("ws://localhost:9000".to_string(), 10, test_project());

        // Set up various TUI-local session state (app_status now lives in Session struct)
        app.push_flutter_log(crate::flutter_log::FlutterLogEntry::parse("Log"));
        app.push_agent_event(MonitoringEvent {
            ts: "2024-01-01T00:00:00Z".to_string(),
            source: "agent".to_string(),
            event_type: "test".to_string(),
            payload: serde_json::Value::Null,
        });
        app.session.pending_response = true;
        app.filter = Some("filter".to_string());
        app.scroll_offset = 10;

        // Reset
        app.reset_session_state();

        // Verify TUI-local state is cleared
        assert!(app.session.flutter_logs.is_empty());
        assert!(app.session.agent_events.is_empty());
        assert!(app.session.interaction_logs.is_empty());
        assert!(app.session.tree.is_none());
        assert!(!app.session.pending_response);
        assert!(app.filter.is_none());
        assert_eq!(app.scroll_offset, 0);
    }

    #[test]
    fn test_session_status_event_updates_to_running() {
        let mut app = app_with_session();
        
        // Verify initial state
        let session = app.current_session().expect("should have session");
        assert_eq!(session.app_status, "not_running");
        assert_eq!(session.pid, None);
        assert_eq!(session.vm_service_uri, None);

        // Simulate session.status_changed event with "starting"
        let starting_event = MonitoringEvent {
            ts: "2024-01-01T00:00:01Z".to_string(),
            source: "session".to_string(),
            event_type: "session.status_changed".to_string(),
            payload: serde_json::json!({
                "sessionId": "test-session-1",
                "status": "starting"
            }),
        };
        app.push_event(starting_event);

        // Verify status changed to starting
        let session = app.current_session().expect("should have session");
        assert_eq!(session.app_status, "starting", "status should be 'starting' after starting event");

        // Simulate session.status_changed event with "running" + pid + vmServiceUri
        let running_event = MonitoringEvent {
            ts: "2024-01-01T00:00:02Z".to_string(),
            source: "session".to_string(),
            event_type: "session.status_changed".to_string(),
            payload: serde_json::json!({
                "sessionId": "test-session-1",
                "status": "running",
                "pid": 12345,
                "vmServiceUri": "ws://127.0.0.1:5678/abc=/ws"
            }),
        };
        app.push_event(running_event);

        // Verify status changed to running with pid and uri
        let session = app.current_session().expect("should have session");
        assert_eq!(session.app_status, "running", "status should be 'running' after running event");
        assert_eq!(session.pid, Some(12345), "pid should be set");
        assert_eq!(session.vm_service_uri, Some("ws://127.0.0.1:5678/abc=/ws".to_string()), "vmServiceUri should be set");
    }

    #[test]
    fn test_session_status_event_for_different_session_still_updates() {
        let mut app = app_with_session();
        
        // Add a second session
        let mut session2 = test_session();
        session2.id = "test-session-2".to_string();
        session2.name = "other".to_string();
        app.sessions.push(session2);

        // Selected session is still test-session-1
        assert_eq!(app.selected_session, Some("test-session-1".to_string()));

        // Send status event for session 2 (not selected)
        let event = MonitoringEvent {
            ts: "2024-01-01T00:00:01Z".to_string(),
            source: "session".to_string(),
            event_type: "session.status_changed".to_string(),
            payload: serde_json::json!({
                "sessionId": "test-session-2",
                "status": "running",
                "pid": 9999
            }),
        };
        app.push_event(event);

        // Session 2 should be updated even though it's not selected
        let session2 = app.sessions.iter().find(|s| s.id == "test-session-2").unwrap();
        assert_eq!(session2.app_status, "running", "non-selected session should still be updated");
        assert_eq!(session2.pid, Some(9999));

        // Selected session should be unchanged
        let session1 = app.current_session().unwrap();
        assert_eq!(session1.app_status, "not_running");
    }

    #[test]
    fn test_parse_tree_nodes_string_capabilities() {
        // Daemon sends capabilities as array of strings: ["tap", "longPress"]
        let json = serde_json::json!([
            {
                "id": "my-button",
                "widgetType": "ElevatedButton",
                "capabilities": ["tap", "longPress", "doubleTap"],
                "actions": [],
                "children": []
            }
        ]);

        let nodes = App::parse_tree_nodes(json.as_array().unwrap());

        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0].id, "my-button");
        assert_eq!(nodes[0].capabilities.len(), 3);
        assert_eq!(nodes[0].capabilities[0].capability_type, "tap");
        assert_eq!(nodes[0].capabilities[1].capability_type, "longPress");
        assert_eq!(nodes[0].capabilities[2].capability_type, "doubleTap");
    }

    #[test]
    fn test_parse_tree_nodes_object_capabilities() {
        // Also support object format: [{type: "tap"}]
        let json = serde_json::json!([
            {
                "id": "my-button",
                "capabilities": [{"type": "tap"}, {"type": "scroll"}],
                "children": []
            }
        ]);

        let nodes = App::parse_tree_nodes(json.as_array().unwrap());

        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0].capabilities.len(), 2);
        assert_eq!(nodes[0].capabilities[0].capability_type, "tap");
        assert_eq!(nodes[0].capabilities[1].capability_type, "scroll");
    }

    #[test]
    fn test_parse_tree_nodes_with_actions() {
        let json = serde_json::json!([
            {
                "id": "item",
                "capabilities": ["tap"],
                "actions": [
                    {"name": "delete", "description": "Delete this item"},
                    {"name": "edit"}
                ],
                "children": []
            }
        ]);

        let nodes = App::parse_tree_nodes(json.as_array().unwrap());

        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0].actions.len(), 2);
        assert_eq!(nodes[0].actions[0].name, "delete");
        assert_eq!(nodes[0].actions[0].description, Some("Delete this item".to_string()));
        assert_eq!(nodes[0].actions[1].name, "edit");
        assert_eq!(nodes[0].actions[1].description, None);
    }

    #[test]
    fn test_parse_tree_nodes_nested_children() {
        let json = serde_json::json!([
            {
                "id": "list",
                "capabilities": ["scroll"],
                "children": [
                    {
                        "id": "item-1",
                        "capabilities": ["tap", "longPress"],
                        "children": []
                    },
                    {
                        "id": "item-2", 
                        "capabilities": ["tap"],
                        "children": []
                    }
                ]
            }
        ]);

        let nodes = App::parse_tree_nodes(json.as_array().unwrap());

        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0].id, "list");
        assert_eq!(nodes[0].capabilities.len(), 1);
        assert_eq!(nodes[0].children.len(), 2);
        assert_eq!(nodes[0].children[0].id, "item-1");
        assert_eq!(nodes[0].children[0].capabilities.len(), 2);
        assert_eq!(nodes[0].children[1].id, "item-2");
        assert_eq!(nodes[0].children[1].capabilities.len(), 1);
    }
}
