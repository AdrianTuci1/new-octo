pub mod compute;
pub mod validation;

pub use compute::*;
pub use validation::*;

use std::fs;
use std::path::Path;

#[tauri::command]
pub async fn apply_file_diff(file_path: String, diff: DiffType) -> Result<(), String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        if let DiffType::Create { delta } = diff {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::write(path, delta.insertion).map_err(|e| e.to_string())?;
            return Ok(());
        }
        return Err(format!("File does not exist: {}", file_path));
    }

    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();

    match diff {
        DiffType::Update { deltas, rename } => {
            // Apply deltas in reverse order to keep indices valid
            let mut sorted_deltas = deltas;
            sorted_deltas.sort_by(|a, b| {
                b.replacement_line_range
                    .start
                    .cmp(&a.replacement_line_range.start)
            });

            for delta in sorted_deltas {
                let start = delta.replacement_line_range.start.saturating_sub(1);
                let end = delta.replacement_line_range.end.saturating_sub(1);

                let insertion_lines: Vec<String> =
                    delta.insertion.lines().map(|s| s.to_string()).collect();

                if start <= lines.len() {
                    let end_clamped = end.min(lines.len());
                    lines.splice(start..end_clamped, insertion_lines);
                }
            }

            if let Some(rename) = rename {
                fs::rename(path, rename).map_err(|e| e.to_string())?;
            }
        }
        DiffType::Delete { .. } => {
            fs::remove_file(path).map_err(|e| e.to_string())?;
            return Ok(());
        }
        DiffType::Create { .. } => {
            return Err("File already exists".to_string());
        }
    }

    let new_content = lines.join("\n");
    fs::write(path, new_content).map_err(|e| e.to_string())?;

    Ok(())
}
