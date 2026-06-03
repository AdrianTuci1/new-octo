#[derive(Debug, Clone, PartialEq)]
pub enum DiffLine {
    Context(String),
    Added(String),
    Removed(String),
}

pub fn parse_diff(text: &str) -> Vec<DiffLine> {
    text.lines()
        .map(|line| {
            if line.starts_with('+') {
                DiffLine::Added(line[1..].to_string())
            } else if line.starts_with('-') {
                DiffLine::Removed(line[1..].to_string())
            } else {
                DiffLine::Context(line.to_string())
            }
        })
        .collect()
}
