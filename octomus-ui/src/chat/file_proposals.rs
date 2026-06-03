use crate::chat::types::{FileDiff, DiffType, DiffDelta, LineRange};

const SHELL_LANGUAGES: &[&str] = &["bash", "console", "fish", "ps1", "powershell", "sh", "shell", "terminal", "zsh"];

fn clean_possible_file_path(value: &str) -> String {
    value.trim()
        .trim_start_matches("- ")
        .trim_start_matches("* ")
        .trim_start_matches("filename ")
        .trim_start_matches("file ")
        .trim_start_matches("path ")
        .trim_start_matches('`')
        .trim_end_matches('`')
        .trim_start_matches("**")
        .trim_end_matches("**")
        .trim_start_matches('"')
        .trim_end_matches('"')
        .trim_start_matches('\'')
        .trim_end_matches('\'')
        .trim()
        .to_string()
}

fn extract_file_path_from_fence(info: &str, previous_line: &str) -> Option<String> {
    let info_parts: Vec<&str> = info.trim().split_whitespace().collect();
    let language = info_parts.first().map(|s| s.to_lowercase()).unwrap_or_default();
    if SHELL_LANGUAGES.contains(&language.as_str()) {
        return None;
    }
    let metadata = info_parts[1..].join(" ");
    // Try to find file path in metadata
    let re = regex::Regex::new(r#"(?:^|[\s""'`=:/])((?:\.{1,2}/|/)?(?:[\w.-]+/)+[\w.-]+\.[A-Za-z0-9]{1,12}|[\w.-]+\.[A-Za-z0-9]{1,12})(?=$|[\s""'`),;])"#).unwrap();
    if let Some(caps) = re.captures(&metadata) {
        if let Some(m) = caps.get(1) {
            return Some(clean_possible_file_path(m.as_str()));
        }
    }
    // Try previous line
    let prev = clean_possible_file_path(previous_line);
    if let Some(caps) = re.captures(&prev) {
        if let Some(m) = caps.get(1) {
            return Some(clean_possible_file_path(m.as_str()));
        }
    }
    None
}

pub fn extract_file_proposal_from_markdown(body: &str) -> (String, Vec<FileDiff>) {
    let lines: Vec<&str> = body.lines().collect();
    let mut file_diffs: Vec<FileDiff> = Vec::new();
    let mut visible_lines: Vec<String> = Vec::new();
    let mut index = 0;
    
    while index < lines.len() {
        let line = lines[index];
        let re_fence = regex::Regex::new(r"^```([^\n`]*)$").unwrap();
        if let Some(caps) = re_fence.captures(line) {
            let info = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            let previous_visible_line = visible_lines.last().map(|s| s.as_str()).unwrap_or("");
            let file_path = extract_file_path_from_fence(info, previous_visible_line);
            let mut code_lines: Vec<String> = Vec::new();
            let mut end_index = index + 1;
            
            while end_index < lines.len() {
                if lines[end_index].trim() == "```" {
                    break;
                }
                code_lines.push(lines[end_index].to_string());
                end_index += 1;
            }
            
            if end_index >= lines.len() {
                visible_lines.push(line.to_string());
                visible_lines.extend(code_lines);
                break;
            }
            
            if file_path.is_none() {
                visible_lines.push(line.to_string());
                visible_lines.extend(code_lines);
                visible_lines.push(lines[end_index].to_string());
                index = end_index + 1;
                continue;
            }
            
            let fp = file_path.unwrap();
            if !previous_visible_line.is_empty() && clean_possible_file_path(previous_visible_line).contains(&fp) {
                visible_lines.pop();
            }
            
            file_diffs.push(FileDiff {
                file_path: fp,
                diff_type: DiffType::Create {
                    delta: DiffDelta {
                        replacement_line_range: LineRange { start: 1, end: 1 },
                        insertion: code_lines.join("\n"),
                    }
                },
                original_content: None,
            });
            index = end_index + 1;
            continue;
        }
        visible_lines.push(line.to_string());
        index += 1;
    }
    
    let visible_body = visible_lines.join("\n");
    let re = regex::Regex::new(r"\n{3,}").unwrap();
    let cleaned = re.replace_all(&visible_body, "\n\n").trim_end().to_string();
    (cleaned, file_diffs)
}
