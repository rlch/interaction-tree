use crate::app::{App, TreeNode};
use ratatui::{
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph},
    Frame,
};

pub fn render(frame: &mut Frame, app: &App, area: Rect) {
    let block = Block::default()
        .title(" Interaction Tree ")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::DarkGray));

    if app.tree.is_some() {
        // Get visible nodes (respecting expanded state)
        let visible = app.tree_visible_nodes();
        let inner_height = area.height.saturating_sub(2) as usize;
        
        let lines: Vec<Line> = visible
            .iter()
            .skip(app.tree_scroll_offset)
            .take(inner_height)
            .map(|(depth, node)| format_tree_node(node, *depth, app))
            .collect();
        
        let paragraph = Paragraph::new(lines).block(block);
        frame.render_widget(paragraph, area);
    } else {
        // Show "No tree loaded" or "Press :tree to fetch"
        let paragraph = Paragraph::new("Press :tree to fetch")
            .style(Style::default().fg(Color::DarkGray))
            .block(block);
        frame.render_widget(paragraph, area);
    }
}

fn format_tree_node(node: &TreeNode, depth: usize, app: &App) -> Line<'static> {
    // Indent based on depth (2 spaces per level)
    // Show expand/collapse indicator: ▼ (expanded) or ▶ (collapsed) if has children
    // Show node id, optionally widget_type
    // Highlight if selected (app.tree_selected)
    
    let indent = "  ".repeat(depth);
    let has_children = !node.children.is_empty();
    let is_expanded = app.tree_expanded.contains(&node.id);
    
    let indicator = if has_children {
        if is_expanded { "▼ " } else { "▶ " }
    } else {
        "  "
    };
    
    let is_selected = app.tree_selected.as_ref() == Some(&node.id);
    let style = if is_selected {
        Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)
    } else {
        Style::default().fg(Color::White)
    };
    
    // Format: "  ▼ node_id (WidgetType)"
    let label = if let Some(wt) = &node.widget_type {
        format!("{}{}{} ({})", indent, indicator, node.id, wt)
    } else {
        format!("{}{}{}", indent, indicator, node.id)
    };
    
    Line::from(Span::styled(label, style))
}
