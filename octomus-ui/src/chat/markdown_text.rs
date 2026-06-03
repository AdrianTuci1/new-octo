use regex::Regex;

const CSV_BLOCK_MIN_ROWS: usize = 2;
const TABLE_DELIMITERS: [char; 3] = [',', ';', '\t'];
const ROMANIAN_OR_LATIN_UPPERCASE: &str = "A-ZĂÂÎȘȚ";
const ROMANIAN_OR_LATIN_LETTER: &str = "A-ZĂÂÎȘȚa-zăâîșț";
const UNICODE_BULLET_PATTERN: &str = "[•‣◦▪▫‒–—]";
const PROTECTED_BLOCK_PREFIX: &str = "\u{E000}OCTOMUS_MD_BLOCK_";
const PROTECTED_BLOCK_SUFFIX: &str = "\u{E001}";

lazy_static::lazy_static! {
    static ref LOCAL_PATH_INLINE_RE: Regex = Regex::new(
        r"^(?:/(?:[^/\0]+/)*[^/\0]*|\.\.?(?:/[^/\0]+)*/?|~/(?:[^/\0]+/?)*|[A-Za-z]:[\\/](?:[^\\/\0]+[\\/])*[^\\/\0]*)$"
    ).unwrap();
}

pub fn looks_like_local_path(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.contains('\n') {
        return false;
    }
    LOCAL_PATH_INLINE_RE.is_match(trimmed)
}

pub fn normalize_local_inline_path(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.len() > 1 {
        trimmed.trim_end_matches('/').to_string()
    } else {
        trimmed.to_string()
    }
}

pub fn highlight_slash_commands_in_markdown(text: &str) -> String {
    let parts: Vec<&str> = text.split_inclusive('`').collect();
    // Simplified: split around backtick blocks
    let mut result = String::new();
    let mut in_backticks = false;
    for part in text.split('`') {
        if in_backticks {
            result.push('`');
            result.push_str(part);
            if result.ends_with('`') {
                // handled by split
            }
        } else {
            let re = Regex::new(r"(^|\s)(/[a-zA-Z0-9-_]+)(?=$|\s|[.,!?;:])").unwrap();
            let replaced = re.replace_all(part, |caps: &regex::Captures| {
                format!("{}[{}](slash-cmd://{})", &caps[1], &caps[2], &caps[2][1..])
            });
            result.push_str(&replaced);
        }
        in_backticks = !in_backticks;
    }
    result
}

pub fn annotate_local_paths_in_markdown(text: &str) -> String {
    let mut result = String::new();
    let mut in_backticks = false;
    for part in text.split('`') {
        if in_backticks {
            result.push('`');
            result.push_str(part);
        } else {
            let re = Regex::new(
                r"(^|[\s(])((?:~/[^\s`)<>,;]+|\.{1,2}/[^\s`)<>,;]+|/[^\s/`)<>,;]+/[^\s`)<>,;]*))"
            ).unwrap();
            let replaced = re.replace_all(part, |caps: &regex::Captures| {
                let candidate = &caps[2];
                let normalized = candidate.trim_end_matches(|c: char| c == '.' || c == ',' || c == ';' || c == ':' || c == '!' || c == '?');
                let trailing = &candidate[normalized.len()..];
                if looks_like_local_path(normalized) {
                    format!("{}`{}`{}", &caps[1], normalized, trailing)
                } else {
                    caps[0].to_string()
                }
            });
            result.push_str(&replaced);
        }
        in_backticks = !in_backticks;
    }
    result
}

fn split_around_code(text: &str) -> Vec<&str> {
    let re = Regex::new(r"```[\s\S]*?```|`[^`\n]*`").unwrap();
    let mut result = Vec::new();
    let mut last_end = 0;
    for mat in re.find_iter(text) {
        if mat.start() > last_end {
            result.push(&text[last_end..mat.start()]);
        }
        result.push(mat.as_str());
        last_end = mat.end();
    }
    if last_end < text.len() {
        result.push(&text[last_end..]);
    }
    result
}

fn repair_compact_markdown_chunk(text: &str) -> String {
    let mut result = text.replace("\r\n", "\n").replace('\r', "\n");
    
    // Headings glued to prose
    let re1 = Regex::new(&format!(r"([^#\n])\s*(#{{2,6}})(?=[0-9{}])", ROMANIAN_OR_LATIN_UPPERCASE)).unwrap();
    result = re1.replace_all(&result, "$1\n\n$2").to_string();
    
    let re2 = Regex::new(r"(^|\n)(#{2,6})(?!#)(?=\S)").unwrap();
    result = re2.replace_all(&result, "$1$2 ").to_string();
    
    // Unicode bullets
    let re3 = Regex::new(&format!(r"(^|\n)\s*{}\s+", UNICODE_BULLET_PATTERN)).unwrap();
    result = re3.replace_all(&result, "$1- ").to_string();
    
    let re4 = Regex::new(&format!(r"([:;.!])\s+{}\s+", UNICODE_BULLET_PATTERN)).unwrap();
    result = re4.replace_all(&result, "$1\n\n- ").to_string();
    
    let re5 = Regex::new(&format!(r"([^\n])\s+{}\s+", UNICODE_BULLET_PATTERN)).unwrap();
    result = re5.replace_all(&result, "$1\n- ").to_string();
    
    // Bold headings glued
    let re6 = Regex::new(r"([.!])\*\*\*(?=\S)").unwrap();
    result = re6.replace_all(&result, "$1\n\n***").to_string();
    
    let re7 = Regex::new(r"\*\*\*([^*\n]+?)\*\*(?=\S|$)").unwrap();
    result = re7.replace_all(&result, "**$1**").to_string();
    
    let re8 = Regex::new(&format!(r"(\*\*\*[^*\n]+?\*\*\*)(?=[{}])", ROMANIAN_OR_LATIN_UPPERCASE)).unwrap();
    result = re8.replace_all(&result, "$1\n\n").to_string();
    
    // Lists after prose
    let re9 = Regex::new(r"([:;.!])\s+((?:[-*+]|\d+[.)])\s+)(?=\S)").unwrap();
    result = re9.replace_all(&result, "$1\n\n$2").to_string();
    
    let re10 = Regex::new(&format!(r"([^#\n])\s+(\d{{1,2}}[.)]\s+)(?=[{}`])", ROMANIAN_OR_LATIN_LETTER)).unwrap();
    result = re10.replace_all(&result, "$1\n$2").to_string();
    
    let re11 = Regex::new(&format!(r"([^\n])\s+([-*+]\s+)(?=[{}`])", ROMANIAN_OR_LATIN_LETTER)).unwrap();
    result = re11.replace_all(&result, "$1\n$2").to_string();
    
    // Pipe pseudo-breaks
    let re12 = Regex::new(r"([.!])\|\s*\*\*(?=\S)").unwrap();
    result = re12.replace_all(&result, "$1\n\n**").to_string();
    
    let re13 = Regex::new(r"([.!])(?=\*[^*\n]{{2,80}}:\*)").unwrap();
    result = re13.replace_all(&result, "$1\n\n").to_string();
    
    result
}

pub fn repair_compact_markdown(text: &str) -> String {
    let parts = split_around_code(text);
    let mut result = String::new();
    for (i, part) in parts.iter().enumerate() {
        if i % 2 == 1 {
            result.push_str(part);
        } else {
            result.push_str(&repair_compact_markdown_chunk(part));
        }
    }
    result
}

fn parse_delimited_line(line: &str, delimiter: char) -> Option<Vec<String>> {
    let mut cells: Vec<String> = Vec::new();
    let mut cell = String::new();
    let mut in_quotes = false;
    let chars: Vec<char> = line.chars().collect();
    
    for i in 0..chars.len() {
        let ch = chars[i];
        if in_quotes {
            if ch == '"' {
                if i + 1 < chars.len() && chars[i + 1] == '"' {
                    cell.push('"');
                } else if i + 1 >= chars.len() || chars[i + 1] == delimiter {
                    in_quotes = false;
                } else {
                    cell.push(ch);
                }
            } else {
                cell.push(ch);
            }
            continue;
        }
        if ch == '"' {
            if cell.trim().is_empty() {
                in_quotes = true;
            } else {
                cell.push(ch);
            }
            continue;
        }
        if ch == delimiter {
            cells.push(cell.trim().to_string());
            cell.clear();
            continue;
        }
        cell.push(ch);
    }
    
    if in_quotes {
        return None;
    }
    cells.push(cell.trim().to_string());
    Some(cells)
}

fn escape_markdown_table_cell(value: &str) -> String {
    value.replace('\\', "\\\\").replace('|', "\\|").replace('\n', " ").trim().to_string()
}

fn parse_delimited_table_rows(lines: &[&str]) -> Option<Vec<Vec<String>>> {
    for delimiter in TABLE_DELIMITERS {
        if !lines[0].contains(delimiter) {
            continue;
        }
        let parsed: Vec<Vec<String>> = lines.iter()
            .filter_map(|line| parse_delimited_line(line, delimiter))
            .collect();
        if parsed.len() < lines.len() || parsed.iter().any(|row| row.len() < 2) {
            continue;
        }
        let col_count = parsed[0].len();
        if col_count >= 2 && parsed.iter().all(|row| row.len() == col_count) {
            return Some(parsed);
        }
    }
    None
}

fn build_markdown_table_from_rows(rows: &[Vec<String>]) -> String {
    let header = &rows[0];
    let sep: Vec<String> = header.iter().map(|_| "---".to_string()).collect();
    let body = &rows[1..];
    let mut lines = vec![
        format!("| {} |", header.iter().map(|c| escape_markdown_table_cell(c)).collect::<Vec<_>>().join(" | ")),
        format!("| {} |", sep.join(" | ")),
    ];
    for row in body {
        lines.push(format!("| {} |", row.iter().map(|c| escape_markdown_table_cell(c)).collect::<Vec<_>>().join(" | ")));
    }
    lines.join("\n")
}

fn split_pipe_table_row(row: &str) -> Vec<&str> {
    let mut cells: Vec<&str> = row.split('|').map(|s| s.trim()).collect();
    if cells.first() == Some(&"") {
        cells.remove(0);
    }
    if cells.last() == Some(&"") {
        cells.pop();
    }
    cells
}

fn is_markdown_table_separator_cell(value: &str) -> bool {
    Regex::new(r"^:?-{3,}:?$").unwrap().is_match(value.trim())
}

fn is_pipe_table_separator_line(line: &str) -> bool {
    let cells = split_pipe_table_row(line);
    cells.len() >= 2 && cells.iter().all(|c| is_markdown_table_separator_cell(c))
}

fn normalize_markdown_pipe_table_rows(lines: &[&str], start_index: usize) -> Option<(usize, String)> {
    let header_cells = split_pipe_table_row(lines[start_index]);
    let col_count = header_cells.len();
    if col_count < 2 || start_index + 1 >= lines.len() || !is_pipe_table_separator_line(lines[start_index + 1]) {
        return None;
    }
    let mut table_rows = vec![
        format!("| {} |", header_cells.iter().map(|c| escape_markdown_table_cell(c)).collect::<Vec<_>>().join(" | ")),
        format!("| {} |", header_cells.iter().map(|_| "---".to_string()).collect::<Vec<_>>().join(" | ")),
    ];
    let mut index = start_index + 2;
    let mut pending_row = String::new();
    
    fn flush_pending_row(pending: &mut String, col_count: usize, table_rows: &mut Vec<String>) -> bool {
        let trimmed = pending.trim();
        if trimmed.is_empty() {
            return false;
        }
        let cells = split_pipe_table_row(trimmed);
        if cells.len() != col_count {
            return false;
        }
        table_rows.push(format!("| {} |", cells.iter().map(|c| escape_markdown_table_cell(c)).collect::<Vec<_>>().join(" | ")));
        pending.clear();
        true
    }
    
    while index < lines.len() {
        let line = lines[index];
        let trimmed = line.trim();
        if trimmed.is_empty() {
            break;
        }
        if !trimmed.contains('|') && pending_row.is_empty() {
            break;
        }
        let candidate = if pending_row.is_empty() {
            trimmed.to_string()
        } else {
            let left = pending_row.trim_end();
            if Regex::new(r"[*_`(/-]$").unwrap().is_match(left) || Regex::new(r"^[,.;:!?%)]").unwrap().is_match(trimmed) {
                format!("{}{}", left, trimmed)
            } else {
                format!("{} {}", left, trimmed)
            }
        };
        let candidate_cols = split_pipe_table_row(&candidate).len();
        if pending_row.is_empty() && candidate_cols > col_count {
            break;
        }
        pending_row = candidate;
        if candidate_cols >= col_count && !flush_pending_row(&mut pending_row, col_count, &mut table_rows) {
            break;
        }
        index += 1;
    }
    
    if !pending_row.trim().is_empty() && !flush_pending_row(&mut pending_row, col_count, &mut table_rows) {
        return None;
    }
    
    if table_rows.len() <= 2 {
        return None;
    }
    
    Some((index, table_rows.join("\n")))
}

fn normalize_markdown_pipe_tables_in_markdown(text: &str) -> String {
    let parts = split_around_code(text);
    let mut result = String::new();
    for (i, part) in parts.iter().enumerate() {
        if i % 2 == 1 {
            result.push_str(part);
            continue;
        }
        let lines: Vec<&str> = part.lines().collect();
        let mut output: Vec<String> = Vec::new();
        let mut index = 0;
        while index < lines.len() {
            let current = lines[index];
            let next = lines.get(index + 1).copied().unwrap_or("");
            if current.contains('|') && is_pipe_table_separator_line(next) {
                if let Some((end_idx, table)) = normalize_markdown_pipe_table_rows(&lines, index) {
                    output.push(table);
                    index = end_idx;
                    continue;
                }
            }
            output.push(current.to_string());
            index += 1;
        }
        result.push_str(&output.join("\n"));
    }
    result
}

fn convert_delimited_lines_to_markdown_table(lines: &[&str]) -> Option<String> {
    let trimmed: Vec<&str> = lines.iter().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
    if trimmed.len() < CSV_BLOCK_MIN_ROWS {
        return None;
    }
    let re_skip = Regex::new(r"^(?:[-*+]\s+|\d+[.)]\s+|>|```|\|)").unwrap();
    if trimmed.iter().any(|l| re_skip.is_match(l)) {
        return None;
    }
    let rows = parse_delimited_table_rows(&trimmed)?;
    let col_count = rows[0].len();
    if col_count < 2 || rows.iter().any(|r| r.len() != col_count) {
        return None;
    }
    Some(build_markdown_table_from_rows(&rows))
}

fn convert_compact_delimited_rows(block: &str) -> Option<String> {
    if !block.contains("||") {
        return None;
    }
    let lines: Vec<&str> = block.split("||").map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
    convert_delimited_lines_to_markdown_table(&lines)
}

fn line_can_be_delimited_table_row(line: &str) -> bool {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return false;
    }
    let re_skip = Regex::new(r"^(?:[-*+]\s+|\d+[.)]\s+|>|```|\|)").unwrap();
    if re_skip.is_match(trimmed) {
        return false;
    }
    TABLE_DELIMITERS.iter().any(|d| trimmed.contains(*d))
}

fn convert_delimited_table_runs(text: &str) -> String {
    let lines: Vec<&str> = text.lines().collect();
    let mut output: Vec<String> = Vec::new();
    let mut index = 0;
    while index < lines.len() {
        if !line_can_be_delimited_table_row(lines[index]) {
            output.push(lines[index].to_string());
            index += 1;
            continue;
        }
        let mut end_index = index;
        while end_index < lines.len() && line_can_be_delimited_table_row(lines[end_index]) {
            end_index += 1;
        }
        let run = &lines[index..end_index];
        if let Some(table) = convert_delimited_lines_to_markdown_table(run) {
            output.push(table);
        } else {
            output.extend(run.iter().map(|s| s.to_string()));
        }
        index = end_index;
    }
    output.join("\n")
}

fn convert_csv_code_fences_in_markdown(text: &str) -> String {
    let re = Regex::new(r"```(?:csv|tsv|table|markdown|md)\s*\n([\s\S]*?)```").unwrap();
    re.replace_all(text, |caps: &regex::Captures| {
        let body = caps.get(1).map(|m| m.as_str()).unwrap_or("");
        convert_fenced_table_body_to_markdown(body).unwrap_or_else(|| caps[0].to_string())
    }).to_string()
}

pub fn convert_csv_tables_in_markdown(text: &str) -> String {
    let parts = split_around_code(text);
    let mut result = String::new();
    for (i, part) in parts.iter().enumerate() {
        if i % 2 == 1 {
            result.push_str(part);
            continue;
        }
        let blocks: Vec<String> = part.split("\n\n")
            .map(|block| convert_compact_delimited_rows(block).unwrap_or_else(|| block.to_string()))
            .collect();
        let joined = blocks.join("\n\n");
        result.push_str(&convert_delimited_table_runs(&joined));
    }
    result
}

fn normalize_pipe_table_lines_to_markdown_table(lines: &[&str]) -> Option<String> {
    let trimmed: Vec<&str> = lines.iter().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
    if trimmed.len() < 2 {
        return None;
    }
    let parsed: Vec<Vec<&str>> = trimmed.iter().map(|l| split_pipe_table_row(l)).collect();
    let col_count = parsed[0].len();
    if col_count < 2 || parsed.iter().any(|r| r.len() != col_count) || !parsed[1].iter().all(|c| is_markdown_table_separator_cell(c)) {
        return None;
    }
    let header = &parsed[0];
    let body = &parsed[2..];
    Some(format!(
        "| {} |\n| {} |\n{}",
        header.iter().map(|c| escape_markdown_table_cell(c)).collect::<Vec<_>>().join(" | "),
        header.iter().map(|_| "---".to_string()).collect::<Vec<_>>().join(" | "),
        body.iter().map(|row| format!("| {} |", row.iter().map(|c| escape_markdown_table_cell(c)).collect::<Vec<_>>().join(" | "))).collect::<Vec<_>>().join("\n")
    ))
}

fn convert_fenced_table_body_to_markdown(body: &str) -> Option<String> {
    let lines: Vec<&str> = body.lines().collect();
    normalize_pipe_table_lines_to_markdown_table(&lines)
        .or_else(|| convert_delimited_lines_to_markdown_table(&lines))
}

fn convert_loose_pipe_table_block(block: &str) -> Option<String> {
    let mut trimmed = block.trim();
    if !trimmed.contains("||") || !trimmed.contains('|') {
        return None;
    }
    trimmed = trimmed.trim_start_matches(|c| c == '"' || c == '\'').trim_end_matches(|c| c == '"' || c == '\'').trim();
    let rows: Vec<&str> = trimmed.split("||").map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
    if rows.len() < 2 {
        return None;
    }
    let parsed: Vec<Vec<&str>> = rows.iter().map(|r| split_pipe_table_row(r)).collect();
    if parsed.iter().any(|r| r.len() < 2) {
        return None;
    }
    let col_count = parsed[0].len();
    if col_count < 2 || parsed.iter().any(|r| r.len() != col_count) {
        return None;
    }
    let first = &parsed[0];
    let second = &parsed[1];
    let rest = &parsed[2..];
    let header: Vec<String> = first.iter().map(|c| escape_markdown_table_cell(c)).collect();
    let separator: Vec<String> = if second.iter().all(|c| is_markdown_table_separator_cell(c)) {
        second.iter().map(|_| "---".to_string()).collect()
    } else {
        header.iter().map(|_| "---".to_string()).collect()
    };
    let body_rows: Vec<Vec<&str>> = if second.iter().all(|c| is_markdown_table_separator_cell(c)) {
        rest.to_vec()
    } else {
        let mut v = vec![second.clone()];
        v.extend_from_slice(rest);
        v
    };
    let mut lines = vec![
        format!("| {} |", header.join(" | ")),
        format!("| {} |", separator.join(" | ")),
    ];
    for row in body_rows {
        lines.push(format!("| {} |", row.iter().map(|c| escape_markdown_table_cell(c)).collect::<Vec<_>>().join(" | ")));
    }
    Some(lines.join("\n"))
}

pub fn convert_loose_pipe_tables_in_markdown(text: &str) -> String {
    let parts = split_around_code(text);
    let mut result = String::new();
    for (i, part) in parts.iter().enumerate() {
        if i % 2 == 1 {
            result.push_str(part);
            continue;
        }
        let blocks: Vec<String> = part.split("\n\n")
            .map(|block| convert_loose_pipe_table_block(block).unwrap_or_else(|| block.to_string()))
            .collect();
        result.push_str(&blocks.join("\n\n"));
    }
    result
}

fn classify_markdown_line(line: &str) -> &str {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return "blank";
    }
    let re_list = Regex::new(r"^\s*(?:[-*+]\s+|\d+[.)]\s+)").unwrap();
    if re_list.is_match(line) {
        return "list";
    }
    let re_table = Regex::new(r"^\s*\|.*\|\s*$").unwrap();
    if re_table.is_match(line) || trimmed.split('|').count() >= 3 {
        return "table";
    }
    if line.trim_start().starts_with('>') {
        return "quote";
    }
    let re_block = Regex::new(r"^\s{0,3}#{1,6}\s+").unwrap();
    let re_hr = Regex::new(r"^\s*(?:-{3,}|\*{3,}|_{3,})\s*$").unwrap();
    if re_block.is_match(line) || re_hr.is_match(line) {
        return "block";
    }
    "plain"
}

fn normalize_loose_paragraph_breaks(text: &str) -> String {
    let parts: Vec<&str> = text.split_inclusive('`').collect();
    let mut result = String::new();
    let mut in_backticks = false;
    for part in text.split('`') {
        if in_backticks {
            result.push('`');
            result.push_str(part);
        } else {
            let lines: Vec<&str> = part.lines().collect();
            let mut blocks: Vec<String> = Vec::new();
            let mut current_block: Vec<String> = Vec::new();
            let mut current_kind: &str = "";
            
            for line in lines {
                let kind = classify_markdown_line(line);
                if kind == "blank" {
                    if !current_block.is_empty() {
                        blocks.push(current_block.join("\n"));
                        current_block.clear();
                        current_kind = "";
                    }
                    continue;
                }
                if current_block.is_empty() {
                    current_block.push(line.to_string());
                    current_kind = kind;
                    continue;
                }
                let should_continue = current_kind == kind && (kind == "list" || kind == "table" || kind == "quote");
                if should_continue {
                    current_block.push(line.to_string());
                    continue;
                }
                if !current_block.is_empty() {
                    blocks.push(current_block.join("\n"));
                    current_block.clear();
                }
                current_block.push(line.to_string());
                current_kind = kind;
            }
            if !current_block.is_empty() {
                blocks.push(current_block.join("\n"));
            }
            result.push_str(&blocks.join("\n\n"));
        }
        in_backticks = !in_backticks;
    }
    result
}

fn collect_protected_markdown_blocks(text: &str) -> (String, Vec<String>) {
    let lines: Vec<&str> = text.lines().collect();
    let mut blocks: Vec<String> = Vec::new();
    let mut output: Vec<String> = Vec::new();
    let mut index = 0;
    
    while index < lines.len() {
        let line = lines[index];
        let re_fence = Regex::new(r"^\s*```").unwrap();
        if re_fence.is_match(line) {
            let mut block_lines: Vec<String> = vec![line.to_string()];
            index += 1;
            while index < lines.len() {
                block_lines.push(lines[index].to_string());
                let re_end = Regex::new(r"^\s*```\s*$").unwrap();
                if re_end.is_match(lines[index]) {
                    index += 1;
                    break;
                }
                index += 1;
            }
            let placeholder = format!("{}{}{}", PROTECTED_BLOCK_PREFIX, blocks.len(), PROTECTED_BLOCK_SUFFIX);
            blocks.push(block_lines.join("\n"));
            output.push(placeholder);
            continue;
        }
        if line.contains('|') && index + 1 < lines.len() && is_pipe_table_separator_line(lines[index + 1]) {
            let mut block_lines = vec![line.to_string(), lines[index + 1].to_string()];
            index += 2;
            while index < lines.len() && lines[index].trim().contains('|') {
                block_lines.push(lines[index].to_string());
                index += 1;
            }
            let placeholder = format!("{}{}{}", PROTECTED_BLOCK_PREFIX, blocks.len(), PROTECTED_BLOCK_SUFFIX);
            blocks.push(block_lines.join("\n"));
            output.push(placeholder);
            continue;
        }
        output.push(line.to_string());
        index += 1;
    }
    
    (output.join("\n"), blocks)
}

fn restore_protected_markdown_blocks(text: &str, blocks: &[String]) -> String {
    let re = Regex::new(&format!(r"{}(\d+){}", regex::escape(PROTECTED_BLOCK_PREFIX), regex::escape(PROTECTED_BLOCK_SUFFIX))).unwrap();
    re.replace_all(text, |caps: &regex::Captures| {
        let idx: usize = caps[1].parse().unwrap_or(0);
        blocks.get(idx).map(|s| s.as_str()).unwrap_or(&caps[0]).to_string()
    }).to_string()
}

pub fn prepare_markdown_body(text: &str) -> String {
    let table_normalized = normalize_markdown_pipe_tables_in_markdown(
        &convert_loose_pipe_tables_in_markdown(
            &convert_csv_tables_in_markdown(
                &convert_csv_code_fences_in_markdown(text)
            )
        )
    );
    let (protected_text, blocks) = collect_protected_markdown_blocks(&table_normalized);
    let formatted = highlight_slash_commands_in_markdown(
        &annotate_local_paths_in_markdown(
            &normalize_loose_paragraph_breaks(
                &repair_compact_markdown(&protected_text)
            )
        )
    );
    restore_protected_markdown_blocks(&formatted, &blocks)
}
