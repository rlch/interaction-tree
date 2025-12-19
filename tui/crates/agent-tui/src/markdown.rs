//! Markdown rendering to ratatui widgets.
//!
//! Converts markdown text into styled ratatui Lines using pulldown-cmark.

use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span, Text};

/// Render markdown string to ratatui Text.
pub fn render_markdown(input: &str) -> Text<'static> {
    render_markdown_with_width(input, None)
}

/// Render markdown with optional width constraint for wrapping.
pub fn render_markdown_with_width(input: &str, width: Option<usize>) -> Text<'static> {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_STRIKETHROUGH);
    let parser = Parser::new_ext(input, options);
    
    let mut renderer = MarkdownRenderer::new(width);
    renderer.render(parser);
    Text::from(renderer.lines)
}

struct MarkdownRenderer {
    lines: Vec<Line<'static>>,
    current_line: Vec<Span<'static>>,
    style_stack: Vec<Style>,
    indent_stack: Vec<String>,
    list_indices: Vec<Option<u64>>,
    in_code_block: bool,
    wrap_width: Option<usize>,
}

impl MarkdownRenderer {
    fn new(wrap_width: Option<usize>) -> Self {
        Self {
            lines: Vec::new(),
            current_line: Vec::new(),
            style_stack: vec![Style::default()],
            indent_stack: Vec::new(),
            list_indices: Vec::new(),
            in_code_block: false,
            wrap_width,
        }
    }
    
    fn current_style(&self) -> Style {
        self.style_stack.last().copied().unwrap_or_default()
    }
    
    fn push_style(&mut self, modifier: Modifier) {
        let new_style = self.current_style().add_modifier(modifier);
        self.style_stack.push(new_style);
    }
    
    fn push_color(&mut self, fg: Color) {
        let new_style = self.current_style().fg(fg);
        self.style_stack.push(new_style);
    }
    
    fn pop_style(&mut self) {
        if self.style_stack.len() > 1 {
            self.style_stack.pop();
        }
    }
    
    fn flush_line(&mut self) {
        if !self.current_line.is_empty() {
            let line = std::mem::take(&mut self.current_line);
            self.lines.push(Line::from(line));
        } else {
            self.lines.push(Line::default());
        }
    }
    
    fn add_text(&mut self, text: &str) {
        if text.is_empty() {
            return;
        }
        
        // Handle wrapping for non-code content
        if !self.in_code_block {
            if let Some(width) = self.wrap_width {
                // Simple word wrapping
                let indent = self.indent_stack.join("");
                let available = width.saturating_sub(indent.len());
                
                for wrapped in textwrap::wrap(text, available) {
                    if !self.current_line.is_empty() {
                        self.flush_line();
                    }
                    if !indent.is_empty() {
                        self.current_line.push(Span::raw(indent.clone()));
                    }
                    self.current_line.push(Span::styled(wrapped.into_owned(), self.current_style()));
                }
                return;
            }
        }
        
        // No wrapping
        let style = self.current_style();
        self.current_line.push(Span::styled(text.to_owned(), style));
    }
    
    fn render(&mut self, parser: Parser) {
        for event in parser {
            match event {
                Event::Start(tag) => self.start_tag(tag),
                Event::End(tag) => self.end_tag(tag),
                Event::Text(text) => self.add_text(&text),
                Event::Code(code) => {
                    self.push_color(Color::Cyan);
                    self.add_text(&format!("`{}`", code));
                    self.pop_style();
                }
                Event::SoftBreak => self.add_text(" "),
                Event::HardBreak => self.flush_line(),
                Event::Rule => {
                    self.flush_line();
                    self.lines.push(Line::from("───────────────────────────────────────"));
                }
                _ => {}
            }
        }
        
        // Flush any remaining content
        if !self.current_line.is_empty() {
            self.flush_line();
        }
    }
    
    fn start_tag(&mut self, tag: Tag) {
        match tag {
            Tag::Heading { level, .. } => {
                self.flush_line();
                match level {
                    pulldown_cmark::HeadingLevel::H1 => {
                        self.push_style(Modifier::BOLD | Modifier::UNDERLINED);
                    }
                    pulldown_cmark::HeadingLevel::H2 => {
                        self.push_style(Modifier::BOLD);
                    }
                    _ => {
                        self.push_style(Modifier::BOLD | Modifier::ITALIC);
                    }
                }
            }
            Tag::Paragraph => {
                if !self.lines.is_empty() {
                    self.flush_line();
                }
            }
            Tag::CodeBlock(_) => {
                self.flush_line();
                self.in_code_block = true;
                self.push_color(Color::Cyan);
            }
            Tag::Emphasis => {
                self.push_style(Modifier::ITALIC);
            }
            Tag::Strong => {
                self.push_style(Modifier::BOLD);
            }
            Tag::Strikethrough => {
                self.push_style(Modifier::CROSSED_OUT);
            }
            Tag::BlockQuote(_) => {
                self.flush_line();
                self.indent_stack.push("> ".to_string());
                self.push_color(Color::Green);
            }
            Tag::List(start) => {
                self.list_indices.push(start);
            }
            Tag::Item => {
                self.flush_line();
                let marker = if let Some(Some(n)) = self.list_indices.last_mut() {
                    let marker = format!("{}. ", n);
                    *n += 1;
                    marker
                } else {
                    "• ".to_string()
                };
                let indent = "  ".repeat(self.list_indices.len().saturating_sub(1));
                self.current_line.push(Span::styled(
                    format!("{}{}", indent, marker),
                    Style::default().fg(Color::LightBlue),
                ));
            }
            Tag::Link { .. } => {
                self.push_color(Color::Cyan);
                self.push_style(Modifier::UNDERLINED);
            }
            _ => {}
        }
    }
    
    fn end_tag(&mut self, tag: TagEnd) {
        match tag {
            TagEnd::Heading(_) => {
                self.pop_style();
                self.flush_line();
            }
            TagEnd::Paragraph => {
                self.flush_line();
            }
            TagEnd::CodeBlock => {
                self.in_code_block = false;
                self.pop_style();
                self.flush_line();
            }
            TagEnd::Emphasis | TagEnd::Strong | TagEnd::Strikethrough => {
                self.pop_style();
            }
            TagEnd::BlockQuote(_) => {
                self.indent_stack.pop();
                self.pop_style();
                self.flush_line();
            }
            TagEnd::List(_) => {
                self.list_indices.pop();
            }
            TagEnd::Item => {}
            TagEnd::Link => {
                self.pop_style(); // underline
                self.pop_style(); // color
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_text() {
        let text = render_markdown("Hello world");
        assert_eq!(text.lines.len(), 1);
    }

    #[test]
    fn test_bold() {
        let text = render_markdown("**bold**");
        assert_eq!(text.lines.len(), 1);
    }

    #[test]
    fn test_code_block() {
        let text = render_markdown("```\ncode\n```");
        assert!(text.lines.len() >= 1);
    }
}
