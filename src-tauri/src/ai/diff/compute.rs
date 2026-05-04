use similar::{DiffOp, TextDiff};
use std::ops::Range;
use super::validation::{DiffDelta, DiffType};

pub fn compute_diff(base: &str, new: &str) -> DiffType {
    let diffs = TextDiff::configure()
        .algorithm(similar::Algorithm::Patience)
        .diff_lines(base, new);
    
    let mut deltas = Vec::new();

    for op in diffs.ops() {
        match op {
            DiffOp::Equal { .. } => continue,
            DiffOp::Delete { old_index, old_len, new_index } => {
                deltas.push(DiffDelta {
                    replacement_line_range: (*old_index + 1)..(*old_index + *old_len + 1),
                    insertion: String::new(),
                });
            }
            DiffOp::Insert { new_index, new_len, .. } => {
                let insertion = diffs.iter_new_slices().skip(*new_index).take(*new_len).collect::<Vec<_>>().join("");
                deltas.push(DiffDelta {
                    replacement_line_range: (*new_index + 1)..(*new_index + 1),
                    insertion,
                });
            }
            DiffOp::Replace { old_index, old_len, new_index, new_len } => {
                let insertion = diffs.iter_new_slices().skip(*new_index).take(*new_len).collect::<Vec<_>>().join("");
                deltas.push(DiffDelta {
                    replacement_line_range: (*old_index + 1)..(*old_index + *old_len + 1),
                    insertion,
                });
            }
        }
    }

    DiffType::Update {
        deltas,
        rename: None,
    }
}

pub fn generate_unified_diff(file_name: &str, base: &str, new: &str) -> String {
    let text_diff = TextDiff::from_lines(base, new);
    text_diff
        .unified_diff()
        .context_radius(3)
        .header(file_name, file_name)
        .to_string()
}
