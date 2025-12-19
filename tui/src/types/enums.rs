//! Application enums for state management

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
    /// Agent chat input mode (focused on Agent tab)
    AgentChat,
    /// Action menu for tree node interactions
    ActionMenu,
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
