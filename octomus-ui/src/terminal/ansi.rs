use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AnsiColor {
    Black,
    Red,
    Green,
    Yellow,
    Blue,
    Magenta,
    Cyan,
    White,
    BrightBlack,
    BrightRed,
    BrightGreen,
    BrightYellow,
    BrightBlue,
    BrightMagenta,
    BrightCyan,
    BrightWhite,
    Indexed(u8),
    Rgb(u8, u8, u8),
    Default,
}

impl Default for AnsiColor {
    fn default() -> Self {
        AnsiColor::Default
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ShellHook {
    PreExec { command: String },
    PreCmd { status: Option<i32>, cwd: Option<String> },
    Finish { block_id: String, status: Option<i32> },
    CompletionsStart { format: String },
    CompletionsEnd,
    CompletionResult { completion: String },
    CompletionUpdateDescription { value: String },
    CompletionsPrompt,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TerminalStreamEvent {
    Text(Vec<u8>),
    Hook(ShellHook),
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct CellStyle {
    pub fg: AnsiColor,
    pub bg: AnsiColor,
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub strikethrough: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StyledCell {
    pub ch: char,
    pub style: CellStyle,
}

impl Default for StyledCell {
    fn default() -> Self {
        Self {
            ch: ' ',
            style: CellStyle::default(),
        }
    }
}

#[derive(Debug, Default)]
pub struct AnsiParser {
    buffer: Vec<u8>,
}

impl AnsiParser {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push_events(&mut self, chunk: &[u8]) -> Vec<TerminalStreamEvent> {
        self.buffer.extend_from_slice(chunk);

        let mut events = Vec::new();
        let mut cursor = 0;

        loop {
            let Some((start, marker_len)) = find_next_marker(&self.buffer[cursor..]) else {
                let keep_suffix = partial_marker_suffix_len(&self.buffer[cursor..]);
                let emit_end = self.buffer.len().saturating_sub(keep_suffix);

                if emit_end > cursor {
                    events.push(TerminalStreamEvent::Text(
                        self.buffer[cursor..emit_end].to_vec(),
                    ));
                }

                self.buffer.drain(0..emit_end);
                return events;
            };

            let absolute_start = cursor + start;
            if absolute_start > cursor {
                events.push(TerminalStreamEvent::Text(
                    self.buffer[cursor..absolute_start].to_vec(),
                ));
            }

            let payload_start = absolute_start + marker_len;
            let Some((terminator_start, terminator_len)) =
                find_osc_terminator(&self.buffer[payload_start..])
            else {
                if absolute_start > 0 {
                    self.buffer.drain(0..absolute_start);
                }
                return events;
            };

            let payload_end = payload_start + terminator_start;
            if let Some(hook) = parse_payload(&self.buffer[payload_start..payload_end]) {
                events.push(TerminalStreamEvent::Hook(hook));
            }

            cursor = payload_end + terminator_len;
        }
    }

    pub fn push_hooks(&mut self, chunk: &[u8]) -> Vec<ShellHook> {
        self.push_events(chunk)
            .into_iter()
            .filter_map(|event| match event {
                TerminalStreamEvent::Hook(hook) => Some(hook),
                TerminalStreamEvent::Text(_) => None,
            })
            .collect()
    }

    pub fn parse_styled_line(input: &str) -> Vec<StyledCell> {
        let mut cells = Vec::new();
        let mut chars = input.chars().peekable();
        let mut style = CellStyle::default();

        while let Some(ch) = chars.next() {
            if ch == '\x1b' {
                if chars.next() == Some('[') {
                    let mut code = String::new();
                    while let Some(&next) = chars.peek() {
                        if next.is_ascii_digit() || next == ';' {
                            code.push(next);
                            chars.next();
                        } else {
                            break;
                        }
                    }
                    if let Some(&terminator) = chars.peek() {
                        if (0x40..=0x7e).contains(&(terminator as u32)) {
                            chars.next();
                        }
                    }
                    Self::apply_sgr_code(&code, &mut style);
                }
                continue;
            }
            cells.push(StyledCell { ch, style: style.clone() });
        }

        cells
    }

    fn apply_sgr_code(code: &str, style: &mut CellStyle) {
        let parts: Vec<u8> = code
            .split(';')
            .filter_map(|s| s.parse().ok())
            .collect();

        let mut i = 0;
        while i < parts.len() {
            match parts.get(i) {
                Some(0) => *style = CellStyle::default(),
                Some(1) => style.bold = true,
                Some(3) => style.italic = true,
                Some(4) => style.underline = true,
                Some(9) => style.strikethrough = true,
                Some(22) => style.bold = false,
                Some(23) => style.italic = false,
                Some(24) => style.underline = false,
                Some(29) => style.strikethrough = false,
                Some(30) => style.fg = AnsiColor::Black,
                Some(31) => style.fg = AnsiColor::Red,
                Some(32) => style.fg = AnsiColor::Green,
                Some(33) => style.fg = AnsiColor::Yellow,
                Some(34) => style.fg = AnsiColor::Blue,
                Some(35) => style.fg = AnsiColor::Magenta,
                Some(36) => style.fg = AnsiColor::Cyan,
                Some(37) => style.fg = AnsiColor::White,
                Some(38) => {
                    if let Some(5) = parts.get(i + 1) {
                        if let Some(idx) = parts.get(i + 2) {
                            style.fg = AnsiColor::Indexed(*idx);
                        }
                        i += 2;
                    } else if let Some(2) = parts.get(i + 1) {
                        if let (Some(r), Some(g), Some(b)) =
                            (parts.get(i + 2), parts.get(i + 3), parts.get(i + 4))
                        {
                            style.fg = AnsiColor::Rgb(*r, *g, *b);
                        }
                        i += 4;
                    }
                }
                Some(39) => style.fg = AnsiColor::Default,
                Some(40) => style.bg = AnsiColor::Black,
                Some(41) => style.bg = AnsiColor::Red,
                Some(42) => style.bg = AnsiColor::Green,
                Some(43) => style.bg = AnsiColor::Yellow,
                Some(44) => style.bg = AnsiColor::Blue,
                Some(45) => style.bg = AnsiColor::Magenta,
                Some(46) => style.bg = AnsiColor::Cyan,
                Some(47) => style.bg = AnsiColor::White,
                Some(48) => {
                    if let Some(5) = parts.get(i + 1) {
                        if let Some(idx) = parts.get(i + 2) {
                            style.bg = AnsiColor::Indexed(*idx);
                        }
                        i += 2;
                    } else if let Some(2) = parts.get(i + 1) {
                        if let (Some(r), Some(g), Some(b)) =
                            (parts.get(i + 2), parts.get(i + 3), parts.get(i + 4))
                        {
                            style.bg = AnsiColor::Rgb(*r, *g, *b);
                        }
                        i += 4;
                    }
                }
                Some(49) => style.bg = AnsiColor::Default,
                Some(90) => style.fg = AnsiColor::BrightBlack,
                Some(91) => style.fg = AnsiColor::BrightRed,
                Some(92) => style.fg = AnsiColor::BrightGreen,
                Some(93) => style.fg = AnsiColor::BrightYellow,
                Some(94) => style.fg = AnsiColor::BrightBlue,
                Some(95) => style.fg = AnsiColor::BrightMagenta,
                Some(96) => style.fg = AnsiColor::BrightCyan,
                Some(97) => style.fg = AnsiColor::BrightWhite,
                Some(100) => style.bg = AnsiColor::BrightBlack,
                Some(101) => style.bg = AnsiColor::BrightRed,
                Some(102) => style.bg = AnsiColor::BrightGreen,
                Some(103) => style.bg = AnsiColor::BrightYellow,
                Some(104) => style.bg = AnsiColor::BrightBlue,
                Some(105) => style.bg = AnsiColor::BrightMagenta,
                Some(106) => style.bg = AnsiColor::BrightCyan,
                Some(107) => style.bg = AnsiColor::BrightWhite,
                _ => {}
            }
            i += 1;
        }
    }
}

fn parse_payload(payload: &[u8]) -> Option<ShellHook> {
    let payload = String::from_utf8_lossy(payload);
    let (hook, rest) = payload.split_once(';')?;
    match hook {
        "preexec" => Some(ShellHook::PreExec {
            command: rest.to_string(),
        }),
        "precmd" => {
            let mut parts = rest.splitn(2, ';');
            let status = parts.next().and_then(|value| value.parse::<i32>().ok());
            let cwd = parts
                .next()
                .and_then(|value| (!value.is_empty()).then(|| value.to_string()));
            Some(ShellHook::PreCmd { status, cwd })
        }
        "finish" => {
            let mut finish_parts = rest.splitn(2, ';');
            let block_id = finish_parts.next().unwrap_or_default().to_string();
            let status = finish_parts
                .next()
                .and_then(|value| value.parse::<i32>().ok());
            Some(ShellHook::Finish { block_id, status })
        }
        "completions" => {
            let mut completion_parts = rest.splitn(2, ';');
            let action = completion_parts.next().unwrap_or_default();
            let value = completion_parts.next().unwrap_or_default().to_string();
            match action {
                "A" => Some(ShellHook::CompletionsStart { format: value }),
                "B" => Some(ShellHook::CompletionsEnd),
                "C" => Some(ShellHook::CompletionResult { completion: value }),
                action if action.starts_with("D?") => match &action[2..] {
                    "description" => Some(ShellHook::CompletionUpdateDescription { value }),
                    _ => None,
                },
                "P" => Some(ShellHook::CompletionsPrompt),
                _ => None,
            }
        }
        _ => None,
    }
}

fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn find_next_marker(bytes: &[u8]) -> Option<(usize, usize)> {
    let classic = b"\x1b]7777;";
    let completion = b"\x1b]9280;";

    let classic_pos = find_bytes(bytes, classic).map(|start| (start, classic.len()));
    let completion_pos = find_bytes(bytes, completion).map(|start| (start, completion.len()));

    match (classic_pos, completion_pos) {
        (Some(left), Some(right)) => Some(if left.0 <= right.0 { left } else { right }),
        (Some(left), None) => Some(left),
        (None, Some(right)) => Some(right),
        (None, None) => None,
    }
}

fn find_osc_terminator(bytes: &[u8]) -> Option<(usize, usize)> {
    for index in 0..bytes.len() {
        if bytes[index] == b'\x07' {
            return Some((index, 1));
        }
        if index + 1 < bytes.len() && bytes[index] == b'\x1b' && bytes[index + 1] == b'\\' {
            return Some((index, 2));
        }
    }
    None
}

fn partial_marker_suffix_len(bytes: &[u8]) -> usize {
    let markers = [b"\x1b]7777;".as_slice(), b"\x1b]9280;".as_slice()];
    let max_len = markers.iter().map(|marker| marker.len()).max().unwrap_or(0);
    let max_len = max_len.saturating_sub(1).min(bytes.len());

    for len in (1..=max_len).rev() {
        if markers
            .iter()
            .any(|marker| bytes.ends_with(&marker[..len.min(marker.len())]))
        {
            return len;
        }
    }

    0
}

pub fn clean_terminal_text(bytes: &[u8]) -> String {
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        match bytes[index] {
            b'\x1b' => {
                index = skip_escape_sequence(bytes, index);
            }
            b'\r' => {
                if bytes.get(index + 1) != Some(&b'\n') {
                    output.push(b'\n');
                }
                index += 1;
            }
            b'\x08' => {
                output.pop();
                index += 1;
            }
            byte if byte < 0x20 && byte != b'\n' && byte != b'\t' => {
                index += 1;
            }
            byte => {
                output.push(byte);
                index += 1;
            }
        }
    }

    String::from_utf8_lossy(&output).to_string()
}

fn skip_escape_sequence(bytes: &[u8], start: usize) -> usize {
    let Some(next) = bytes.get(start + 1) else {
        return start + 1;
    };

    match *next {
        b'[' => {
            let mut index = start + 2;
            while index < bytes.len() {
                if (0x40..=0x7e).contains(&bytes[index]) {
                    return index + 1;
                }
                index += 1;
            }
            bytes.len()
        }
        b']' => {
            let mut index = start + 2;
            while index < bytes.len() {
                if bytes[index] == b'\x07' {
                    return index + 1;
                }
                if index + 1 < bytes.len() && bytes[index] == b'\x1b' && bytes[index + 1] == b'\\' {
                    return index + 2;
                }
                index += 1;
            }
            bytes.len()
        }
        _ => (start + 2).min(bytes.len()),
    }
}

impl fmt::Display for AnsiColor {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AnsiColor::Black => write!(f, "black"),
            AnsiColor::Red => write!(f, "red"),
            AnsiColor::Green => write!(f, "green"),
            AnsiColor::Yellow => write!(f, "yellow"),
            AnsiColor::Blue => write!(f, "blue"),
            AnsiColor::Magenta => write!(f, "magenta"),
            AnsiColor::Cyan => write!(f, "cyan"),
            AnsiColor::White => write!(f, "white"),
            AnsiColor::BrightBlack => write!(f, "bright-black"),
            AnsiColor::BrightRed => write!(f, "bright-red"),
            AnsiColor::BrightGreen => write!(f, "bright-green"),
            AnsiColor::BrightYellow => write!(f, "bright-yellow"),
            AnsiColor::BrightBlue => write!(f, "bright-blue"),
            AnsiColor::BrightMagenta => write!(f, "bright-magenta"),
            AnsiColor::BrightCyan => write!(f, "bright-cyan"),
            AnsiColor::BrightWhite => write!(f, "bright-white"),
            AnsiColor::Indexed(i) => write!(f, "indexed-{}", i),
            AnsiColor::Rgb(r, g, b) => write!(f, "rgb({},{},{})", r, g, b),
            AnsiColor::Default => write!(f, "default"),
        }
    }
}
