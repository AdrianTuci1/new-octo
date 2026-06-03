use egui::{Color32, CornerRadius, Response, RichText, Ui, Widget};
use crate::chat::types::*;
use crate::chat::markdown::MarkdownRenderer;
use crate::chat::code_block::CodeBlock;
use crate::chat::diff::{DiffView, FileArtifactBlock};

pub struct ThinkingBlock {
    body: String,
    is_streaming: bool,
    duration_seconds: Option<u32>,
    is_expanded: bool,
}

impl ThinkingBlock {
    pub fn new(body: String, is_streaming: bool, duration_seconds: Option<u32>) -> Self {
        Self {
            body,
            is_streaming,
            duration_seconds,
            is_expanded: is_streaming,
        }
    }

    fn get_title(&self) -> String {
        if self.is_streaming {
            "Thinking...".to_string()
        } else if let Some(secs) = self.duration_seconds {
            format!("Thought for {} second{}", secs, if secs == 1 { "" } else { "s" })
        } else {
            "Thought".to_string()
        }
    }
}

impl Widget for ThinkingBlock {
    fn ui(mut self, ui: &mut Ui) -> Response {
        if self.body.trim().is_empty() {
            return ui.response();
        }
        
        let header_response = ui.horizontal(|ui| {
            if ui.button(if self.is_expanded { "▼" } else { "▶" }).clicked() {
                self.is_expanded = !self.is_expanded;
            }
            ui.label(RichText::new(self.get_title()).strong().size(12.0));
        }).response;
        
        if self.is_expanded {
            ui.add(MarkdownRenderer::new(&self.body));
        } else {
            let preview = self.body.replace(|c: char| c.is_whitespace(), " ").trim().to_string();
            let clipped = if preview.len() > 220 {
                format!("{}…", &preview[..220])
            } else {
                preview
            };
            ui.label(RichText::new(clipped).italics().color(ui.visuals().weak_text_color()));
        }
        
        header_response
    }
}

pub struct WebSearchBlock {
    status: WebSearchStatus,
    results: Vec<WebSearchResult>,
    query: Option<String>,
    is_expanded: bool,
}

impl WebSearchBlock {
    pub fn new(status: WebSearchStatus, results: Vec<WebSearchResult>, query: Option<String>) -> Self {
        Self {
            status,
            results,
            query,
            is_expanded: false,
        }
    }
}

impl Widget for WebSearchBlock {
    fn ui(mut self, ui: &mut Ui) -> Response {
        let query = self.query.as_deref().unwrap_or("search");
        let meta_label = match self.status {
            WebSearchStatus::Searching => "Searching...".to_string(),
            WebSearchStatus::Error => "Failed".to_string(),
            WebSearchStatus::Success => format!("{} URL{}", self.results.len(), if self.results.len() == 1 { "" } else { "s" }),
        };
        let has_results = !self.results.is_empty();
        
        ui.vertical(|ui| {
            ui.horizontal(|ui| {
                ui.label("🔍");
                ui.label(format!(
                    "{} for \"{}\"",
                    if matches!(self.status, WebSearchStatus::Searching) { "Searching" } else { "Searched" },
                    query
                ));
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    ui.label(meta_label);
                    if has_results && ui.button("▼").clicked() {
                        self.is_expanded = !self.is_expanded;
                    }
                });
            });
            
            if self.is_expanded && has_results {
                for result in &self.results {
                    ui.horizontal(|ui| {
                        ui.hyperlink_to(&result.title, &result.url);
                    });
                }
            }
        }).response
    }
}

pub struct WorkspaceExplorationBlock {
    exploration: WorkspaceExplorationArtifact,
    is_streaming: bool,
    is_expanded: bool,
}

impl WorkspaceExplorationBlock {
    pub fn new(exploration: WorkspaceExplorationArtifact, is_streaming: bool) -> Self {
        Self {
            is_expanded: is_streaming,
            exploration,
            is_streaming,
        }
    }

    fn format_search_source(source: &str) -> String {
        match source {
            "code-index" => "code index".to_string(),
            "filesystem" => "workspace files".to_string(),
            s if s.starts_with("lsp") => "language server".to_string(),
            _ => source.to_string(),
        }
    }

    fn format_search_summary(&self) -> String {
        let file_count: usize = if self.exploration.segments.is_empty() {
            self.exploration.files.len()
        } else {
            self.exploration.segments.iter().map(|s| s.files.len()).sum()
        };
        let search_count: usize = if self.exploration.segments.is_empty() {
            self.exploration.searches.len()
        } else {
            self.exploration.segments.iter().map(|s| s.searches.len()).sum()
        };
        
        if file_count == 0 && search_count == 0 {
            if let Some(ref summary) = self.exploration.summary {
                return summary.clone();
            }
        }
        format!(
            "Explored {} file{}, {} search{}",
            file_count,
            if file_count == 1 { "" } else { "s" },
            search_count,
            if search_count == 1 { "" } else { "es" }
        )
    }

    fn file_name_from_path(path: &str) -> String {
        let normalized = path.trim_end_matches('/');
        normalized.split('/').last().unwrap_or(normalized).to_string()
    }
}

impl Widget for WorkspaceExplorationBlock {
    fn ui(mut self, ui: &mut Ui) -> Response {
        let summary = self.format_search_summary();
        let title = if self.is_streaming {
            "Exploring workspace...".to_string()
        } else {
            summary.trim_end_matches('.').to_string()
        };
        
        ui.vertical(|ui| {
            ui.horizontal(|ui| {
                ui.label("🔍");
                ui.label(RichText::new(title).strong());
                if ui.button(if self.is_expanded { "▼" } else { "▶" }).clicked() {
                    self.is_expanded = !self.is_expanded;
                }
            });
            
            if self.is_expanded {
                for segment in &self.exploration.segments {
                    for entry in &segment.entries {
                        ui.horizontal(|ui| {
                            ui.label(&entry.text);
                            if let Some(ref detail) = entry.detail {
                                ui.label(RichText::new(detail).small().color(Color32::GRAY));
                            }
                        });
                    }
                }
                
                if self.exploration.segments.is_empty() {
                    for search in &self.exploration.searches {
                        ui.label(format!(
                            "{} {} ({} matches)",
                            if search.mode == "list" { "Listed" } else { "Searched" },
                            search.query,
                            search.result_count
                        ));
                    }
                    for file in &self.exploration.files {
                        ui.label(format!("Read {}", Self::file_name_from_path(&file.path)));
                    }
                }
            }
        }).response
    }
}

pub struct WorkspaceFileReadBlock {
    artifact: WorkspaceFileReadArtifact,
    is_streaming: bool,
    is_expanded: bool,
}

impl WorkspaceFileReadBlock {
    pub fn new(artifact: WorkspaceFileReadArtifact, is_streaming: bool) -> Self {
        Self {
            is_expanded: is_streaming,
            artifact,
            is_streaming,
        }
    }

    fn file_name_from_path(path: &str) -> String {
        let normalized = path.trim_end_matches('/');
        normalized.split('/').last().unwrap_or(normalized).to_string()
    }
}

impl Widget for WorkspaceFileReadBlock {
    fn ui(mut self, ui: &mut Ui) -> Response {
        let title = format!("Read {}", Self::file_name_from_path(&self.artifact.path));
        
        ui.vertical(|ui| {
            ui.horizontal(|ui| {
                ui.label("📄");
                ui.label(RichText::new(title).strong());
                if ui.button(if self.is_expanded { "▼" } else { "▶" }).clicked() {
                    self.is_expanded = !self.is_expanded;
                }
            });
            
            if self.is_expanded {
                ui.label(RichText::new(&self.artifact.display_path).monospace().small());
                
                let line_summary = if self.artifact.start_line.is_some() || self.artifact.end_line.is_some() {
                    Some(format!(
                        "{}-{}",
                        self.artifact.start_line.unwrap_or(1),
                        self.artifact.end_line.map(|n| n.to_string()).unwrap_or_else(|| "end".to_string())
                    ))
                } else {
                    None
                };
                
                if line_summary.is_some() || self.artifact.truncated {
                    let mut parts = Vec::new();
                    if let Some(ls) = line_summary {
                        parts.push(format!("Lines {}", ls));
                    }
                    if self.artifact.truncated {
                        parts.push("Truncated for context size".to_string());
                    }
                    ui.label(RichText::new(parts.join(" • ")).small().color(Color32::GRAY));
                }
                
                egui::Frame::dark_canvas(ui.style())
                    .inner_margin(egui::vec2(8.0, 6.0))
                    .corner_radius(CornerRadius::same(4))
                    .show(ui, |ui| {
                        ui.label(RichText::new(&self.artifact.content).monospace().size(11.0));
                    });
            }
        }).response
    }
}

pub struct ImplementationPlanBlock {
    title: String,
    version: String,
}

impl ImplementationPlanBlock {
    pub fn new(title: String, version: String) -> Self {
        Self { title, version }
    }
}

impl Widget for ImplementationPlanBlock {
    fn ui(self, ui: &mut Ui) -> Response {
        ui.horizontal(|ui| {
            ui.label("🧭");
            ui.label(RichText::new(self.title).strong());
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                ui.label(RichText::new(&self.version).small().color(Color32::GRAY));
                ui.label("🔗");
            });
        }).response
    }
}

pub struct CodeDisplayBlock {
    code: String,
    title: Option<String>,
    status: FileDiffPreviewStatus,
    detail: Option<String>,
}

impl CodeDisplayBlock {
    pub fn new(code: String, title: Option<String>, status: FileDiffPreviewStatus, detail: Option<String>) -> Self {
        Self { code, title, status, detail }
    }
}

impl Widget for CodeDisplayBlock {
    fn ui(self, ui: &mut Ui) -> Response {
        let status_label = match self.status {
            FileDiffPreviewStatus::Accepted => "Applied",
            FileDiffPreviewStatus::Rejected => "Request canceled",
            FileDiffPreviewStatus::Pending => "Proposed",
        };
        
        egui::Frame::dark_canvas(ui.style())
            .inner_margin(egui::vec2(8.0, 6.0))
            .corner_radius(CornerRadius::same(6))
            .show(ui, |ui| {
                ui.vertical(|ui| {
                    if self.title.is_some() || self.detail.is_some() {
                        ui.horizontal(|ui| {
                            ui.vertical(|ui| {
                                if let Some(ref title) = self.title {
                                    ui.label(RichText::new(title).strong());
                                }
                                if let Some(ref detail) = self.detail {
                                    ui.label(RichText::new(detail).small().color(Color32::GRAY));
                                }
                            });
                            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                                ui.label(status_label);
                            });
                        });
                    }
                    ui.add(CodeBlock::new(None, self.code.clone()));
                }).response
            }).response
    }
}

pub struct MultiAgentBlock {
    agent_name: String,
    task_summary: String,
    status: String,
    color_scheme: String,
}

impl MultiAgentBlock {
    pub fn new(agent_name: String, task_summary: String, status: String, color_scheme: Option<String>) -> Self {
        Self {
            agent_name,
            task_summary,
            status,
            color_scheme: color_scheme.unwrap_or_else(|| "green".to_string()),
        }
    }

    fn get_colors(&self) -> (Color32, Color32) {
        match self.color_scheme.as_str() {
            "indigo" => (Color32::from_rgb(129, 140, 248), Color32::from_rgb(129, 140, 248)),
            "pink" => (Color32::from_rgb(244, 114, 182), Color32::from_rgb(244, 114, 182)),
            "teal" => (Color32::from_rgb(45, 212, 191), Color32::from_rgb(45, 212, 191)),
            "amber" => (Color32::from_rgb(251, 191, 36), Color32::from_rgb(251, 191, 36)),
            "sky" => (Color32::from_rgb(56, 189, 248), Color32::from_rgb(56, 189, 248)),
            _ => (Color32::from_rgb(48, 184, 111), Color32::from_rgb(48, 184, 111)),
        }
    }
}

impl Widget for MultiAgentBlock {
    fn ui(self, ui: &mut Ui) -> Response {
        let (accent, _border) = self.get_colors();
        let icon = match self.status.as_str() {
            "running" => "⚡",
            "completed" => "✓",
            _ => "✗",
        };
        
        egui::Frame::group(ui.style())
            .stroke(egui::Stroke::new(1.0, accent))
            .corner_radius(CornerRadius::same(8))
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.label(RichText::new(icon).color(accent));
                    ui.vertical(|ui| {
                        ui.label(RichText::new(&self.agent_name).strong().color(accent));
                        ui.label(RichText::new(&self.task_summary).small());
                    });
                    if self.status == "running" {
                        if ui.button("⏹").clicked() {
                            // Stop agent
                        }
                    }
                }).response
            }).response
    }
}

pub struct TerminalBlockCard {
    block: TerminalCommandBlock,
    is_expanded: bool,
    is_selected: bool,
}

impl TerminalBlockCard {
    pub fn new(block: TerminalCommandBlock, is_expanded: bool, is_selected: bool) -> Self {
        Self { block, is_expanded, is_selected }
    }
}

impl Widget for TerminalBlockCard {
    fn ui(self, ui: &mut Ui) -> Response {
        let failed = self.block.status == "finished"
            && self.block.exit_code.is_some()
            && self.block.exit_code.unwrap() != 0;
        let succeeded = self.block.status == "finished" && !failed;
        let should_collapse = succeeded
            && !matches!(self.block.source, TerminalCommandSource::User)
            && !self.is_expanded
            && !self.is_selected;
        
        if matches!(self.block.presentation, TerminalCommandPresentation::ConversationLink) {
            return ui.add(TerminalBlockSummary::new(
                self.block.command.clone(),
                self.block.conversation_title.clone(),
                true,
            ));
        }
        
        if should_collapse {
            return ui.add(TerminalBlockSummary::new(
                self.block.command.clone(),
                None,
                false,
            ));
        }
        
        ui.add(TerminalBlockDetail::new(self.block, failed, self.is_selected))
    }
}

pub struct TerminalBlockSummary {
    label: String,
    is_conversation_link: bool,
}

impl TerminalBlockSummary {
    pub fn new(command: String, conversation_title: Option<String>, is_conversation_link: bool) -> Self {
        let label = if is_conversation_link {
            conversation_title.unwrap_or_else(|| "Return to AI conversation".to_string())
        } else {
            command
        };
        Self { label, is_conversation_link }
    }
}

impl Widget for TerminalBlockSummary {
    fn ui(self, ui: &mut Ui) -> Response {
        ui.horizontal(|ui| {
            let icon = if self.is_conversation_link { "▶" } else { "✓" };
            ui.label(icon);
            ui.label(RichText::new(self.label).monospace());
            if !self.is_conversation_link {
                ui.label("›");
            }
        }).response
    }
}

pub struct TerminalBlockDetail {
    block: TerminalCommandBlock,
    failed: bool,
    is_selected: bool,
}

impl TerminalBlockDetail {
    pub fn new(block: TerminalCommandBlock, failed: bool, is_selected: bool) -> Self {
        Self { block, failed, is_selected }
    }

    fn format_duration(duration_ms: Option<u64>) -> String {
        match duration_ms {
            Some(ms) if ms < 1000 => format!("{:.3}s", ms as f64 / 1000.0),
            Some(ms) => format!("{:.2}s", ms as f64 / 1000.0),
            None => "running".to_string(),
        }
    }

    fn output_for(block: &TerminalCommandBlock) -> String {
        let output = block.output.trim_end();
        let without_echo = if output.starts_with(&block.command) {
            output[block.command.len()..].trim_start_matches(|c: char| c.is_whitespace() || c == '\n').to_string()
        } else {
            output.to_string()
        };
        if without_echo.is_empty() {
            if block.status == "running" {
                "Running command...".to_string()
            } else {
                String::new()
            }
        } else {
            without_echo
        }
    }
}

impl Widget for TerminalBlockDetail {
    fn ui(self, ui: &mut Ui) -> Response {
        let output = Self::output_for(&self.block);
        
        let frame_color = if self.failed {
            Color32::from_rgb(80, 40, 40)
        } else if self.is_selected {
            Color32::from_rgb(40, 60, 80)
        } else {
            ui.visuals().panel_fill
        };
        
        egui::Frame::group(ui.style())
            .fill(frame_color)
            .corner_radius(CornerRadius::same(8))
            .show(ui, |ui| {
                ui.vertical(|ui| {
                    ui.horizontal(|ui| {
                        ui.label("~");
                        ui.label(RichText::new(Self::format_duration(self.block.duration_ms)).small());
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            if ui.button("📎").clicked() {
                                // Attach as agent context
                            }
                            if ui.button("💾").clicked() {
                                // Save as workflow
                            }
                            if ui.button("🔍").clicked() {
                                // Filter block output
                            }
                        });
                    });
                    
                    ui.label(RichText::new(&self.block.command).strong().monospace());
                    
                    if !output.is_empty() {
                        egui::ScrollArea::vertical()
                            .max_height(300.0)
                            .show(ui, |ui| {
                                egui::Frame::dark_canvas(ui.style())
                                    .inner_margin(egui::vec2(8.0, 6.0))
                                    .corner_radius(CornerRadius::same(4))
                                    .show(ui, |ui| {
                                        ui.label(RichText::new(output).monospace().size(11.0));
                                    });
                            });
                    }
                }).response
            }).response
    }
}

pub struct NewConversationBlock;

impl Widget for NewConversationBlock {
    fn ui(self, ui: &mut Ui) -> Response {
        ui.horizontal(|ui| {
            ui.separator();
            ui.label(RichText::new("New conversation started").small().italics());
            ui.separator();
        }).response
    }
}
