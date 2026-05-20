#[derive(Debug, Clone)]
pub enum ShellHook {
    PreExec {
        command: String,
    },
    PreCmd {
        status: Option<i32>,
        cwd: Option<String>,
    },
    Finish {
        block_id: String,
        status: Option<i32>,
    },
    CompletionsStart {
        format: String,
    },
    CompletionsEnd,
    CompletionResult {
        completion: String,
    },
    CompletionUpdateDescription {
        value: String,
    },
    CompletionsPrompt,
}

#[derive(Debug, Clone)]
pub enum TerminalStreamEvent {
    Text(Vec<u8>),
    Hook(ShellHook),
}

#[derive(Debug, Default)]
pub struct HookParser {
    buffer: Vec<u8>,
}

impl HookParser {
    #[cfg(test)]
    pub fn push(&mut self, chunk: &[u8]) -> Vec<ShellHook> {
        self.push_events(chunk)
            .into_iter()
            .filter_map(|event| match event {
                TerminalStreamEvent::Hook(hook) => Some(hook),
                TerminalStreamEvent::Text(_) => None,
            })
            .collect()
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

#[cfg(test)]
mod tests {
    use super::{HookParser, ShellHook};

    #[test]
    fn parses_bel_terminated_hooks() {
        let mut parser = HookParser::default();
        let hooks = parser.push(b"hello\x1b]7777;preexec;git status\x07world");

        assert_eq!(hooks.len(), 1);
        assert!(matches!(
            &hooks[0],
            ShellHook::PreExec { command } if command == "git status"
        ));
    }

    #[test]
    fn parses_split_hooks() {
        let mut parser = HookParser::default();

        assert!(parser.push(b"\x1b]7777;precmd;").is_empty());
        let hooks = parser.push(b"127\x07");

        assert_eq!(hooks.len(), 1);
        assert!(matches!(
            hooks[0],
            ShellHook::PreCmd {
                status: Some(127),
                cwd: None
            }
        ));
    }

    #[test]
    fn parses_precmd_cwd() {
        let mut parser = HookParser::default();
        let hooks = parser.push(b"\x1b]7777;precmd;0;/user/projects/ml-training\x07");

        assert_eq!(hooks.len(), 1);
        assert!(matches!(
            &hooks[0],
            ShellHook::PreCmd {
                status: Some(0),
                cwd: Some(cwd)
            } if cwd == "/user/projects/ml-training"
        ));
    }

    #[test]
    fn preserves_text_around_hooks() {
        let mut parser = HookParser::default();
        let events = parser.push_events(b"one\x1b]7777;preexec;pwd\x07two");

        assert!(matches!(&events[0], super::TerminalStreamEvent::Text(text) if text == b"one"));
        assert!(
            matches!(&events[1], super::TerminalStreamEvent::Hook(ShellHook::PreExec { command }) if command == "pwd")
        );
        assert!(matches!(&events[2], super::TerminalStreamEvent::Text(text) if text == b"two"));
    }

    #[test]
    fn cleans_common_terminal_sequences() {
        assert_eq!(
            super::clean_terminal_text(b"\x1b[31mred\x1b[0m\r\nok\x08!"),
            "red\no!"
        );
    }

    #[test]
    fn parses_explicit_finish_hook() {
        let mut parser = HookParser::default();
        let hooks = parser.push(b"\x1b]7777;finish;block-1;2\x07");

        assert_eq!(hooks.len(), 1);
        assert!(matches!(
            &hooks[0],
            ShellHook::Finish {
                block_id,
                status: Some(2)
            } if block_id == "block-1"
        ));
    }

    #[test]
    fn parses_completion_start_and_result_hooks() {
        let mut parser = HookParser::default();
        let hooks =
            parser.push(b"\x1b]9280;completions;A;raw\x07\x1b]9280;completions;C;git status\x07");

        assert_eq!(hooks.len(), 2);
        assert!(matches!(
            &hooks[0],
            ShellHook::CompletionsStart { format } if format == "raw"
        ));
        assert!(matches!(
            &hooks[1],
            ShellHook::CompletionResult { completion } if completion == "git status"
        ));
    }
}
