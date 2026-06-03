use egui::{Color32, Response, RichText, Ui, Widget, TextStyle};
use pulldown_cmark::{Event, Parser, Tag, TagEnd, CodeBlockKind};
use crate::chat::markdown_text::prepare_markdown_body;

pub struct MarkdownRenderer {
    source: String,
}

impl MarkdownRenderer {
    pub fn new(source: impl Into<String>) -> Self {
        Self {
            source: source.into(),
        }
    }

    pub fn render(ui: &mut Ui, source: &str) -> Response {
        let prepared = prepare_markdown_body(source);
        ui.vertical(|ui| {
            let parser = Parser::new(&prepared);
            let mut in_code_block = false;
            let mut code_language = String::new();
            let mut code_content = String::new();
            
            for event in parser {
                match event {
                    Event::Start(tag) => match tag {
                        Tag::CodeBlock(lang) => {
                            in_code_block = true;
                            code_language = match lang {
                                CodeBlockKind::Fenced(s) => s.to_string(),
                                CodeBlockKind::Indented => String::new(),
                            };
                            code_content.clear();
                        }
                        Tag::List(_) => {}
                        Tag::Item => {}
                        Tag::Paragraph => {}
                        Tag::BlockQuote(_) => {}
                        Tag::Heading { .. } => {}
                        _ => {}
                    }
                    Event::End(tag_end) => match tag_end {
                        TagEnd::CodeBlock => {
                            in_code_block = false;
                            if !code_content.is_empty() {
                                ui.add(crate::chat::code_block::CodeBlock::new(
                                    Some(code_language.clone()).filter(|s| !s.is_empty()),
                                    code_content.trim_end().to_string(),
                                ));
                            }
                        }
                        TagEnd::List(_) => {}
                        TagEnd::Item => {}
                        TagEnd::Paragraph => {
                            ui.add_space(4.0);
                        }
                        TagEnd::BlockQuote(_) => {}
                        TagEnd::Heading(_) => {}
                        _ => {}
                    }
                    Event::Text(text) => {
                        if in_code_block {
                            code_content.push_str(&text);
                        } else {
                            ui.label(text.to_string());
                        }
                    }
                    Event::Code(code) => {
                        ui.label(
                            RichText::new(code.to_string())
                                .monospace()
                                .background_color(ui.visuals().code_bg_color)
                        );
                    }
                    Event::Html(html) | Event::InlineHtml(html) => {
                        ui.label(html.to_string());
                    }
                    Event::SoftBreak | Event::HardBreak => {
                        if in_code_block {
                            code_content.push('\n');
                        }
                    }
                    Event::Rule => {
                        ui.separator();
                    }
                    _ => {}
                }
            }
        })
        .response
    }
}

impl Widget for MarkdownRenderer {
    fn ui(self, ui: &mut Ui) -> Response {
        Self::render(ui, &self.source)
    }
}
