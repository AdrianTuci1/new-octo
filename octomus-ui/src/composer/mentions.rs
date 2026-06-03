use regex::Regex;

/// ContextMentions — 1:1 port of React `contextMentions.ts`.
#[derive(Debug, Clone, PartialEq)]
pub struct Mention {
    pub text: String,
    pub start: usize,
    pub end: usize,
    pub kind: MentionKind,
}

#[derive(Debug, Clone, PartialEq)]
pub enum MentionKind {
    File,
    Directory,
    Symbol,
    Url,
}

pub fn find_mentions(text: &str) -> Vec<Mention> {
    let mut mentions = Vec::new();
    let re = Regex::new(r"@([a-zA-Z0-9_./\-~]+)").unwrap();
    for cap in re.captures_iter(text) {
        let m = cap.get(0).unwrap();
        let name = cap.get(1).map(|x| x.as_str()).unwrap_or("").to_string();
        let kind = if name.starts_with("http://") || name.starts_with("https://") {
            MentionKind::Url
        } else if name.ends_with('/') {
            MentionKind::Directory
        } else if name.contains('.') {
            MentionKind::File
        } else {
            MentionKind::Symbol
        };
        mentions.push(Mention {
            text: name,
            start: m.start(),
            end: m.end(),
            kind,
        });
    }
    mentions
}

pub fn insert_mention(text: &mut String, cursor: usize, mention: &str) {
    let insert = format!("@{}", mention);
    text.insert_str(cursor, &insert);
}

pub fn remove_mention(text: &mut String, mention: &Mention) {
    text.replace_range(mention.start..mention.end, "");
}
