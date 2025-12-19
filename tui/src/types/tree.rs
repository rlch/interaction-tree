//! Tree types for interaction tree representation

#[derive(Debug, Clone, Default)]
pub struct InteractionTree {
    pub nodes: Vec<TreeNode>,
    #[allow(dead_code)]
    pub last_updated: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeNode {
    pub id: String,
    #[serde(default)]
    pub widget_type: Option<String>,
    #[serde(default)]
    pub children: Vec<TreeNode>,
    #[serde(default)]
    pub contexts: Vec<ContextInfo>,
    #[serde(default)]
    pub capabilities: Vec<Capability>,
    #[serde(default)]
    pub actions: Vec<Action>,
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
pub struct Capability {
    pub name: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Action {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
}
