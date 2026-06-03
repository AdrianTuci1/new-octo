use egui::{Color32, CornerRadius, Response, RichText, Ui, Widget};
use crate::chat::types::{FileDiff, DiffType, FileDiffPreviewStatus};

pub struct DiffView {
    diffs: Vec<FileDiff>,
    status: FileDiffPreviewStatus,
}

impl DiffView {
    pub fn new(diffs: Vec<FileDiff>, status: FileDiffPreviewStatus) -> Self {
        Self { diffs, status }
    }

    fn render_diff_lines(ui: &mut Ui, diff: &FileDiff) {
        match &diff.diff_type {
            DiffType::Update { deltas, .. } => {
                for delta in deltas {
                    ui.horizontal(|ui| {
                        ui.colored_label(Color32::from_rgb(200, 100, 100), "- ...");
                    });
                    for line in delta.insertion.lines() {
                        ui.horizontal(|ui| {
                            ui.colored_label(Color32::from_rgb(100, 200, 100), format!("+ {}", line));
                        });
                    }
                }
            }
            DiffType::Create { delta } => {
                for (i, line) in delta.insertion.lines().enumerate() {
                    ui.horizontal(|ui| {
                        ui.label(
                            RichText::new(format!("{}", i + 1))
                                .monospace()
                                .color(Color32::from_rgb(100, 100, 100)),
                        );
                        ui.colored_label(Color32::from_rgb(100, 200, 100), format!("+ {}", line));
                    });
                }
            }
            DiffType::Delete { .. } => {
                ui.label("File deleted");
            }
        }
    }

    fn file_name_from_path(path: &str) -> String {
        let normalized = path.trim_end_matches('/');
        normalized.split('/').last().unwrap_or(normalized).to_string()
    }
}

impl Widget for DiffView {
    fn ui(self, ui: &mut Ui) -> Response {
        let (status_icon, title_prefix) = match self.status {
            FileDiffPreviewStatus::Accepted => ("✓", "Applied changes across"),
            FileDiffPreviewStatus::Rejected => ("✗", "Rejected changes across"),
            FileDiffPreviewStatus::Pending => ("○", "Proposed changes across"),
        };
        
        let file_count = self.diffs.len();
        let title = format!(
            "{} {} {}",
            title_prefix,
            file_count,
            if file_count == 1 { "file" } else { "files" }
        );
        
        egui::Frame::dark_canvas(ui.style())
            .inner_margin(egui::vec2(8.0, 6.0))
            .corner_radius(CornerRadius::same(6))
            .show(ui, |ui| {
                ui.vertical(|ui| {
                    ui.horizontal(|ui| {
                        ui.label(RichText::new(status_icon).strong());
                        ui.label(RichText::new(title).strong());
                    });
                    ui.separator();
                    
                    if let Some(first_diff) = self.diffs.first() {
                        ui.label(
                            RichText::new(format!("📄 {}", first_diff.file_path))
                                .monospace()
                                .color(Color32::from_rgb(150, 150, 150)),
                        );
                        ui.separator();
                        egui::ScrollArea::vertical()
                            .max_height(300.0)
                            .show(ui, |ui| {
                                Self::render_diff_lines(ui, first_diff);
                            });
                    }
                })
                .response
            })
            .response
    }
}

pub struct FileDiffPreviewGroup {
    diffs: Vec<FileDiff>,
    status: FileDiffPreviewStatus,
}

impl FileDiffPreviewGroup {
    pub fn new(diffs: Vec<FileDiff>, status: FileDiffPreviewStatus) -> Self {
        Self { diffs, status }
    }
}

impl Widget for FileDiffPreviewGroup {
    fn ui(self, ui: &mut Ui) -> Response {
        let create_diffs: Vec<FileDiff> = self.diffs.iter()
            .filter(|d| matches!(d.diff_type, DiffType::Create { .. }))
            .cloned()
            .collect();
        let non_create_diffs: Vec<FileDiff> = self.diffs.iter()
            .filter(|d| !matches!(d.diff_type, DiffType::Create { .. }))
            .cloned()
            .collect();
        
        ui.vertical(|ui| {
            if !create_diffs.is_empty() {
                ui.add(FileArtifactBlock::new(create_diffs, self.status.clone()));
            }
            if !non_create_diffs.is_empty() {
                ui.add(DiffView::new(non_create_diffs, self.status.clone()));
            }
        })
        .response
    }
}

pub struct FileArtifactBlock {
    diffs: Vec<FileDiff>,
    status: FileDiffPreviewStatus,
}

impl FileArtifactBlock {
    pub fn new(diffs: Vec<FileDiff>, status: FileDiffPreviewStatus) -> Self {
        Self { diffs, status }
    }

    fn file_name_from_path(path: &str) -> String {
        let normalized = path.trim_end_matches('/');
        normalized.split('/').last().unwrap_or(normalized).to_string()
    }
}

impl Widget for FileArtifactBlock {
    fn ui(self, ui: &mut Ui) -> Response {
        let mut is_expanded = true;
        let mut active_index = 0usize;
        
        let title = if self.diffs.len() > 1 {
            match self.status {
                FileDiffPreviewStatus::Accepted => format!("Created {} files", self.diffs.len()),
                FileDiffPreviewStatus::Rejected => "Files not created".to_string(),
                FileDiffPreviewStatus::Pending => format!("Proposed {} files", self.diffs.len()),
            }
        } else {
            let file_name = Self::file_name_from_path(&self.diffs.first().map(|d| d.file_path.clone()).unwrap_or_default());
            match self.status {
                FileDiffPreviewStatus::Accepted => format!("Created {}", file_name),
                FileDiffPreviewStatus::Rejected => "File not created".to_string(),
                FileDiffPreviewStatus::Pending => format!("Proposed {}", file_name),
            }
        };
        
        let status_icon = match self.status {
            FileDiffPreviewStatus::Accepted => "✓",
            FileDiffPreviewStatus::Rejected => "✗",
            FileDiffPreviewStatus::Pending => "📄",
        };
        
        ui.vertical(|ui| {
            ui.horizontal(|ui| {
                ui.label(status_icon);
                ui.label(RichText::new(title).strong());
                if ui.button("▼").clicked() {
                    is_expanded = !is_expanded;
                }
            });
            
            if is_expanded {
                if self.diffs.len() > 1 {
                    ui.horizontal(|ui| {
                        for (i, diff) in self.diffs.iter().enumerate() {
                            let label = Self::file_name_from_path(&diff.file_path);
                            if ui.selectable_label(i == active_index, label).clicked() {
                                active_index = i;
                            }
                        }
                    });
                }
                
                if let Some(diff) = self.diffs.get(active_index) {
                    ui.label(RichText::new(&diff.file_path).monospace().small());
                    egui::ScrollArea::vertical()
                        .max_height(320.0)
                        .show(ui, |ui| {
                            DiffView::render_diff_lines(ui, diff);
                        });
                }
            }
        })
        .response
    }
}
