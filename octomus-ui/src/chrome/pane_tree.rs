use crate::chrome::workspace_types::*;
use egui::*;

#[derive(Debug, Clone, Default)]
pub struct WorkspacePaneTreeState {
    pub layout: WorkspacePaneLayout,
    pub active_pane_id: Option<String>,
    pub selected_tab_id: String,
    pub dragging_splitter: Option<String>,
    pub drag_start_pos: Option<Pos2>,
    pub drag_current_pos: Option<Pos2>,
}

pub struct WorkspacePaneTreeProps {
    pub render_pane_content: Box<dyn FnMut(&mut Ui, &str)>,
    pub on_resize_split: Option<Box<dyn FnMut(String, f32)>>,
    pub on_move_pane: Option<Box<dyn FnMut(String, String)>>,
    pub on_close_pane: Option<Box<dyn FnMut(String)>>,
    pub on_focus_pane: Option<Box<dyn FnMut(String)>>,
}

impl Default for WorkspacePaneTreeProps {
    fn default() -> Self {
        Self {
            render_pane_content: Box::new(|_ui: &mut Ui, _pane_id: &str| {}),
            on_resize_split: None,
            on_move_pane: None,
            on_close_pane: None,
            on_focus_pane: None,
        }
    }
}

pub fn render_workspace_pane_tree(ui: &mut Ui, props: &mut WorkspacePaneTreeProps, state: &mut WorkspacePaneTreeState) {
    let available = ui.available_rect_before_wrap();
    let root = state.layout.root.clone();
    render_pane_node(ui, available, &root, props, state);
}

fn render_pane_node(ui: &mut Ui, rect: Rect, node: &WorkspacePaneNode, props: &mut WorkspacePaneTreeProps, state: &mut WorkspacePaneTreeState) {
    match node {
        WorkspacePaneNode::Leaf { pane_id } => {
            let mut child_ui = ui.new_child(UiBuilder::new().max_rect(rect));
            (props.render_pane_content)(&mut child_ui, pane_id);
        }
        WorkspacePaneNode::Split { direction, children } => {
            if children.len() < 2 {
                if let Some(first) = children.first() {
                    render_pane_node(ui, rect, first, props, state);
                }
                return;
            }
            
            let is_h = *direction == WorkspacePaneDirection::Horizontal;
            let count = children.len();
            let total = if is_h { rect.width() } else { rect.height() };
            let splitter_size = 4.0;
            let content_size = (total - splitter_size * (count - 1) as f32) / count as f32;
            
            for (i, child) in children.iter().enumerate() {
                let child_rect = if is_h {
                    Rect::from_min_size(
                        Pos2::new(rect.min.x + i as f32 * (content_size + splitter_size), rect.min.y),
                        Vec2::new(content_size, rect.height()),
                    )
                } else {
                    Rect::from_min_size(
                        Pos2::new(rect.min.x, rect.min.y + i as f32 * (content_size + splitter_size)),
                        Vec2::new(rect.width(), content_size),
                    )
                };
                
                render_pane_node(ui, child_rect, child, props, state);
                
                // Render splitter
                if i < count - 1 {
                    let splitter_rect = if is_h {
                        Rect::from_min_size(
                            Pos2::new(child_rect.max.x, rect.min.y),
                            Vec2::new(splitter_size, rect.height()),
                        )
                    } else {
                        Rect::from_min_size(
                            Pos2::new(rect.min.x, child_rect.max.y),
                            Vec2::new(rect.width(), splitter_size),
                        )
                    };
                    
                    let splitter_id = ui.id().with(format!("splitter_{}_{}", i, if is_h { "h" } else { "v" }));
                    let splitter_response = ui.interact(splitter_rect, splitter_id, Sense::drag());
                    
                    let hover_color = ui.visuals().widgets.hovered.bg_fill;
                    let default_color = ui.visuals().widgets.inactive.bg_fill;
                    let color = if splitter_response.hovered() || splitter_response.dragged() {
                        hover_color
                    } else {
                        default_color
                    };
                    
                    ui.painter().rect_filled(splitter_rect, 0.0, color);
                    
                    if splitter_response.dragged() {
                        if let Some(pointer_pos) = ui.ctx().pointer_latest_pos() {
                            let new_ratio = if is_h {
                                (pointer_pos.x - rect.min.x) / rect.width()
                            } else {
                                (pointer_pos.y - rect.min.y) / rect.height()
                            };
                            let clamped = new_ratio.clamp(0.1, 0.9);
                            if let Some(ref mut cb) = props.on_resize_split {
                                cb(format!("split_{}_{}", i, if is_h { "h" } else { "v" }), clamped);
                            }
                        }
                    }
                }
            }
        }
    }
}

pub fn add_pane_to_layout(layout: &mut WorkspacePaneLayout, new_pane_id: String, direction: WorkspacePaneDirection) {
    match &mut layout.root {
        WorkspacePaneNode::Leaf { pane_id: existing } => {
            let existing_clone = existing.clone();
            layout.root = WorkspacePaneNode::Split {
                direction,
                children: vec![
                    WorkspacePaneNode::Leaf { pane_id: existing_clone },
                    WorkspacePaneNode::Leaf { pane_id: new_pane_id.clone() },
                ],
            };
        }
        WorkspacePaneNode::Split { direction: existing_dir, children } => {
            if *existing_dir == direction {
                children.push(WorkspacePaneNode::Leaf { pane_id: new_pane_id.clone() });
            } else {
                // Nest: create a new split with the existing children as one side
                let old_root = std::mem::replace(
                    &mut layout.root,
                    WorkspacePaneNode::Leaf { pane_id: String::new() }
                );
                layout.root = WorkspacePaneNode::Split {
                    direction,
                    children: vec![
                        old_root,
                        WorkspacePaneNode::Leaf { pane_id: new_pane_id.clone() },
                    ],
                };
            }
        }
    }
    layout.active_pane_id = new_pane_id;
}

pub fn remove_pane_from_layout(layout: &mut WorkspacePaneLayout, target_pane_id: &str) {
    fn remove_node(node: &mut WorkspacePaneNode, target: &str) -> bool {
        match node {
            WorkspacePaneNode::Leaf { pane_id } => {
                if pane_id == target {
                    return true;
                }
                false
            }
            WorkspacePaneNode::Split { children, .. } => {
                let mut found = false;
                children.retain(|child| {
                    let mut child_clone = child.clone();
                    if remove_node(&mut child_clone, target) {
                        found = true;
                        false
                    } else {
                        true
                    }
                });
                found
            }
        }
    }
    
    remove_node(&mut layout.root, target_pane_id);
    
    // Simplify: if a split has only one child, replace it with that child
    fn simplify(node: &mut WorkspacePaneNode) {
        if let WorkspacePaneNode::Split { children, .. } = node {
            if children.len() == 1 {
                let single = children.remove(0);
                *node = single;
                return;
            }
            for child in children.iter_mut() {
                simplify(child);
            }
        }
    }
    simplify(&mut layout.root);
    
    // Update active pane
    fn first_pane_id(node: &WorkspacePaneNode) -> Option<String> {
        match node {
            WorkspacePaneNode::Leaf { pane_id } => Some(pane_id.clone()),
            WorkspacePaneNode::Split { children, .. } => {
                for child in children {
                    if let Some(id) = first_pane_id(child) {
                        return Some(id);
                    }
                }
                None
            }
        }
    }
    if let Some(new_active) = first_pane_id(&layout.root) {
        layout.active_pane_id = new_active;
    }
}
