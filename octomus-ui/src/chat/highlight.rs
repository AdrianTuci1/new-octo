use egui::{Color32, RichText, Ui};
use regex::Regex;

pub fn clear_chat_highlights(ui: &mut Ui) {
    // In egui we don't persist DOM highlights; re-render instead
}

pub struct ChatHighlightResult {
    pub spans: Vec<HighlightSpan>,
}

#[derive(Debug, Clone)]
pub struct HighlightSpan {
    pub text: String,
    pub is_match: bool,
}

pub fn perform_chat_highlight(
    text: &str,
    search_query: &str,
    case_sensitive: bool,
    use_regex: bool,
    whole_word: bool,
) -> Vec<HighlightSpan> {
    if search_query.is_empty() {
        return vec![HighlightSpan {
            text: text.to_string(),
            is_match: false,
        }];
    }
    
    let pattern = if use_regex {
        let mut p = search_query.to_string();
        if whole_word {
            p = format!(r"\b{}\b", p);
        }
        p
    } else {
        let mut p = regex::escape(search_query);
        if whole_word {
            p = format!(r"\b{}\b", p);
        }
        p
    };
    
    let flags = if case_sensitive { "" } else { "i" };
    let regex = match Regex::new(&format!("(?{})", flags)) {
        Ok(re) if !pattern.is_empty() => match Regex::new(&format!("(?{}{})", flags, pattern)) {
            Ok(r) => r,
            Err(_) => return vec![HighlightSpan { text: text.to_string(), is_match: false }],
        },
        _ => return vec![HighlightSpan { text: text.to_string(), is_match: false }],
    };
    
    let mut spans: Vec<HighlightSpan> = Vec::new();
    let mut last_end = 0;
    
    for mat in regex.find_iter(text) {
        if mat.start() > last_end {
            spans.push(HighlightSpan {
                text: text[last_end..mat.start()].to_string(),
                is_match: false,
            });
        }
        spans.push(HighlightSpan {
            text: mat.as_str().to_string(),
            is_match: true,
        });
        last_end = mat.end();
    }
    
    if last_end < text.len() {
        spans.push(HighlightSpan {
            text: text[last_end..].to_string(),
            is_match: false,
        });
    }
    
    spans
}

pub fn render_highlighted_text(ui: &mut Ui, spans: &[HighlightSpan]) {
    ui.horizontal_wrapped(|ui| {
        for span in spans {
            if span.is_match {
                ui.label(
                    RichText::new(&span.text)
                        .background_color(Color32::from_rgb(255, 255, 0))
                        .color(Color32::BLACK),
                );
            } else {
                ui.label(&span.text);
            }
        }
    });
}
