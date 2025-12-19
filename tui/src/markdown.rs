//! Simple markdown rendering to ratatui Lines.

use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};

/// Render markdown text to ratatui Lines.
pub fn render_markdown(input: &str) -> Vec<Line<'static>> {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_STRIKETHROUGH);
    let parser = Parser::new_ext(input, options);
    
    let mut renderer = MarkdownRenderer::new();
    renderer.render(parser);
    renderer.lines
}

struct MarkdownRenderer {
    lines: Vec<Line<'static>>,
    current_spans: Vec<Span<'static>>,
    style_stack: Vec<Style>,
    in_code_block: bool,
    list_depth: usize,
    list_indices: Vec<Option<u64>>,
}

impl MarkdownRenderer {
    fn new() -> Self {
        Self {
            lines: Vec::new(),
            current_spans: Vec::new(),
            style_stack: vec![Style::default()],
            in_code_block: false,
            list_depth: 0,
            list_indices: Vec::new(),
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
        if !self.current_spans.is_empty() {
            let spans = std::mem::take(&mut self.current_spans);
            self.lines.push(Line::from(spans));
        } else {
            self.lines.push(Line::default());
        }
    }
    
    fn add_text(&mut self, text: &str) {
        if text.is_empty() {
            return;
        }
        let style = self.current_style();
        self.current_spans.push(Span::styled(text.to_owned(), style));
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
                    self.lines.push(Line::from("─".repeat(40)));
                }
                _ => {}
            }
        }
        
        if !self.current_spans.is_empty() {
            self.flush_line();
        }
    }
    
    fn start_tag(&mut self, tag: Tag) {
        match tag {
            Tag::Heading { level, .. } => {
                self.flush_line();
                match level {
                    pulldown_cmark::HeadingLevel::H1 | pulldown_cmark::HeadingLevel::H2 => {
                        self.push_style(Modifier::BOLD);
                    }
                    _ => {
                        self.push_style(Modifier::BOLD | Modifier::ITALIC);
                    }
                }
            }
            Tag::Paragraph => {
                if !self.lines.is_empty() && !self.current_spans.is_empty() {
                    self.flush_line();
                }
            }
            Tag::CodeBlock(_) => {
                self.flush_line();
                self.in_code_block = true;
                self.push_color(Color::Cyan);
            }
            Tag::Emphasis => self.push_style(Modifier::ITALIC),
            Tag::Strong => self.push_style(Modifier::BOLD),
            Tag::Strikethrough => self.push_style(Modifier::CROSSED_OUT),
            Tag::BlockQuote(_) => {
                self.flush_line();
                self.push_color(Color::Green);
            }
            Tag::List(start) => {
                self.list_indices.push(start);
                self.list_depth += 1;
            }
            Tag::Item => {
                self.flush_line();
                let indent = "  ".repeat(self.list_depth.saturating_sub(1));
                let marker = if let Some(Some(n)) = self.list_indices.last_mut() {
                    let m = format!("{}. ", n);
                    *n += 1;
                    m
                } else {
                    "• ".to_string()
                };
                self.current_spans.push(Span::styled(
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
            TagEnd::Paragraph => self.flush_line(),
            TagEnd::CodeBlock => {
                self.in_code_block = false;
                self.pop_style();
                self.flush_line();
            }
            TagEnd::Emphasis | TagEnd::Strong | TagEnd::Strikethrough => self.pop_style(),
            TagEnd::BlockQuote(_) => {
                self.pop_style();
                self.flush_line();
            }
            TagEnd::List(_) => {
                self.list_indices.pop();
                self.list_depth = self.list_depth.saturating_sub(1);
            }
            TagEnd::Link => {
                self.pop_style();
                self.pop_style();
            }
            _ => {}
        }
    }
}
