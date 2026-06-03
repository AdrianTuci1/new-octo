use egui::{Button, Color32, Response, RichText, Ui, Widget};

use crate::state::chat::CommandApproval;

pub struct CommandApprovalRow {
    approval: Option<CommandApproval>,
    on_edit: Option<Box<dyn FnOnce()>>,
    on_save_edit: Option<Box<dyn FnOnce(CommandApproval)>>,
    on_reject: Option<Box<dyn FnOnce(CommandApproval)>>,
    on_accept: Option<Box<dyn FnOnce(CommandApproval)>>,
    on_auto_approve: Option<Box<dyn FnOnce(CommandApproval)>>,
}

impl CommandApprovalRow {
    pub fn new(approval: Option<CommandApproval>) -> Self {
        Self {
            approval,
            on_edit: None,
            on_save_edit: None,
            on_reject: None,
            on_accept: None,
            on_auto_approve: None,
        }
    }

    pub fn on_edit(mut self, cb: impl FnOnce() + 'static) -> Self {
        self.on_edit = Some(Box::new(cb));
        self
    }

    pub fn on_save_edit(mut self, cb: impl FnOnce(CommandApproval) + 'static) -> Self {
        self.on_save_edit = Some(Box::new(cb));
        self
    }

    pub fn on_reject(mut self, cb: impl FnOnce(CommandApproval) + 'static) -> Self {
        self.on_reject = Some(Box::new(cb));
        self
    }

    pub fn on_accept(mut self, cb: impl FnOnce(CommandApproval) + 'static) -> Self {
        self.on_accept = Some(Box::new(cb));
        self
    }

    pub fn on_auto_approve(mut self, cb: impl FnOnce(CommandApproval) + 'static) -> Self {
        self.on_auto_approve = Some(Box::new(cb));
        self
    }
}

impl Widget for CommandApprovalRow {
    fn ui(self, ui: &mut Ui) -> Response {
        let approval = match self.approval {
            Some(a) => a,
            None => {
                return ui.allocate_response(egui::Vec2::ZERO, egui::Sense::hover());
            }
        };

        let command_text = approval.command.clone().unwrap_or_default();
        let approval_clone = approval.clone();
        let approval_clone2 = approval.clone();

        egui::Frame::NONE
            .fill(Color32::from_rgb(45, 45, 50))
            .corner_radius(egui::CornerRadius::same(8))
            .inner_margin(egui::vec2(12.0, 8.0))
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.label(RichText::new("⚠ Command approval").strong());
                    ui.label(RichText::new(command_text.as_str()).monospace());
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui
                            .add(Button::new("Reject").fill(Color32::from_rgb(160, 60, 60)))
                            .clicked()
                        {
                            if let Some(cb) = self.on_reject {
                                cb(approval_clone);
                            }
                        }
                        if ui
                            .add(Button::new("Approve").fill(Color32::from_rgb(60, 140, 60)))
                            .clicked()
                        {
                            if let Some(cb) = self.on_accept {
                                cb(approval_clone2);
                            }
                        }
                    });
                })
                .response
            })
            .response
    }
}
