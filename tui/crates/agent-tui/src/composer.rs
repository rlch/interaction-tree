//! Composer input widget for typing messages.

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use ratatui::buffer::Buffer;
use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph, Widget};

/// Simple text input composer.
pub struct Composer {
    text: String,
    cursor: usize,
    placeholder: String,
}

impl Composer {
    pub fn new() -> Self {
        Self {
            text: String::new(),
            cursor: 0,
            placeholder: "Type a message...".into(),
        }
    }
    
    pub fn with_placeholder(mut self, placeholder: impl Into<String>) -> Self {
        self.placeholder = placeholder.into();
        self
    }
    
    pub fn text(&self) -> &str {
        &self.text
    }
    
    pub fn is_empty(&self) -> bool {
        self.text.is_empty()
    }
    
    pub fn clear(&mut self) -> String {
        self.cursor = 0;
        std::mem::take(&mut self.text)
    }
    
    pub fn set_text(&mut self, text: impl Into<String>) {
        self.text = text.into();
        self.cursor = self.text.len();
    }
    
    /// Handle a key event. Returns true if Enter was pressed (submit).
    pub fn handle_key(&mut self, key: KeyEvent) -> bool {
        match (key.code, key.modifiers) {
            (KeyCode::Enter, KeyModifiers::NONE) if !self.text.is_empty() => {
                return true;
            }
            (KeyCode::Char(c), KeyModifiers::NONE | KeyModifiers::SHIFT) => {
                self.text.insert(self.cursor, c);
                self.cursor += 1;
            }
            (KeyCode::Backspace, _) => {
                if self.cursor > 0 {
                    self.cursor -= 1;
                    self.text.remove(self.cursor);
                }
            }
            (KeyCode::Delete, _) => {
                if self.cursor < self.text.len() {
                    self.text.remove(self.cursor);
                }
            }
            (KeyCode::Left, _) => {
                self.cursor = self.cursor.saturating_sub(1);
            }
            (KeyCode::Right, _) => {
                self.cursor = (self.cursor + 1).min(self.text.len());
            }
            (KeyCode::Home, _) | (KeyCode::Char('a'), KeyModifiers::CONTROL) => {
                self.cursor = 0;
            }
            (KeyCode::End, _) | (KeyCode::Char('e'), KeyModifiers::CONTROL) => {
                self.cursor = self.text.len();
            }
            // Ctrl+K - kill to end of line
            (KeyCode::Char('k'), KeyModifiers::CONTROL) => {
                self.text.truncate(self.cursor);
            }
            // Ctrl+U - kill to start of line
            (KeyCode::Char('u'), KeyModifiers::CONTROL) => {
                self.text = self.text[self.cursor..].to_string();
                self.cursor = 0;
            }
            // Ctrl+W - delete word backward
            (KeyCode::Char('w'), KeyModifiers::CONTROL) => {
                let mut i = self.cursor;
                // Skip trailing spaces
                while i > 0 && self.text.as_bytes().get(i - 1) == Some(&b' ') {
                    i -= 1;
                }
                // Delete word
                while i > 0 && self.text.as_bytes().get(i - 1) != Some(&b' ') {
                    i -= 1;
                }
                self.text = format!("{}{}", &self.text[..i], &self.text[self.cursor..]);
                self.cursor = i;
            }
            _ => {}
        }
        false
    }
    
    /// Get cursor position for rendering.
    pub fn cursor_position(&self, area: Rect) -> (u16, u16) {
        // Account for prompt
        let prompt_len = 2; // "> "
        let x = area.x + prompt_len + self.cursor as u16;
        let y = area.y;
        (x.min(area.right().saturating_sub(1)), y)
    }
}

impl Default for Composer {
    fn default() -> Self {
        Self::new()
    }
}

/// Widget for rendering the composer.
pub struct ComposerWidget<'a> {
    composer: &'a Composer,
    focused: bool,
}

impl<'a> ComposerWidget<'a> {
    pub fn new(composer: &'a Composer) -> Self {
        Self {
            composer,
            focused: true,
        }
    }
    
    pub fn focused(mut self, focused: bool) -> Self {
        self.focused = focused;
        self
    }
}

impl<'a> Widget for ComposerWidget<'a> {
    fn render(self, area: Rect, buf: &mut Buffer) {
        let style = if self.focused {
            Style::default().fg(Color::White)
        } else {
            Style::default().fg(Color::DarkGray)
        };
        
        let block = Block::default()
            .borders(Borders::TOP)
            .border_style(Style::default().fg(Color::DarkGray));
        
        let inner = block.inner(area);
        block.render(area, buf);
        
        // Prompt
        let prompt = Span::styled("> ", Style::default().fg(Color::Green).add_modifier(Modifier::BOLD));
        
        // Content or placeholder
        let content = if self.composer.is_empty() {
            Span::styled(&self.composer.placeholder, Style::default().fg(Color::DarkGray))
        } else {
            Span::styled(&self.composer.text, style)
        };
        
        let line = Line::from(vec![prompt, content]);
        Paragraph::new(line).render(inner, buf);
    }
}
