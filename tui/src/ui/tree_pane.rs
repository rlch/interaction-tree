use crate::app::{App, TreeNode};
use crate::theme::theme;
use ratatui::{
    layout::Rect,
    style::{Modifier, Style},
    widgets::{Block, Borders, Paragraph},
    Frame,
};
use tui_tree_widget::{Tree, TreeItem};

pub fn render(frame: &mut Frame, app: &mut App, area: Rect) {
    let t = theme();

    let block = Block::default()
        .title(" Interaction Tree ")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(t.border));

    if let Some(ref tree) = app.tree {
        let items: Vec<TreeItem<'_, String>> = tree
            .nodes
            .iter()
            .map(|node| build_tree_item(node))
            .collect();

        let tree_widget = Tree::new(&items)
            .expect("tree items have unique identifiers")
            .block(block)
            .highlight_style(
                Style::default()
                    .fg(t.text_highlight)
                    .add_modifier(Modifier::BOLD),
            )
            .highlight_symbol("▶ ");

        frame.render_stateful_widget(tree_widget, area, &mut app.tree_state);
    } else {
        let paragraph = Paragraph::new("Press :tree to fetch")
            .style(Style::default().fg(t.text_dim))
            .block(block);
        frame.render_widget(paragraph, area);
    }
}

fn build_tree_item(node: &TreeNode) -> TreeItem<'_, String> {
    let label = if let Some(ref wt) = node.widget_type {
        format!("{} ({})", node.id, wt)
    } else {
        node.id.clone()
    };

    if node.children.is_empty() {
        TreeItem::new_leaf(node.id.clone(), label)
    } else {
        let children: Vec<TreeItem<'_, String>> = node
            .children
            .iter()
            .map(|child| build_tree_item(child))
            .collect();

        TreeItem::new(node.id.clone(), label, children)
            .expect("children have unique identifiers")
    }
}
