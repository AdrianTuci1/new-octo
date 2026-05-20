#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedShellInput {
    pub tokens: Vec<String>,
    pub token_starts: Vec<usize>,
    pub has_trailing_whitespace: bool,
    pub input_len: usize,
}

impl ParsedShellInput {
    pub fn current_token_start(&self) -> Option<usize> {
        if self.has_trailing_whitespace {
            Some(self.input_len)
        } else {
            self.token_starts.last().copied()
        }
    }
}

pub fn parse_shell_input(input: &str) -> ParsedShellInput {
    let mut tokens = Vec::new();
    let mut token_starts = Vec::new();
    let mut current = String::new();
    let mut current_start: Option<usize> = None;
    let mut in_single = false;
    let mut in_double = false;
    let mut escaped = false;

    let push_current = |tokens: &mut Vec<String>,
                        token_starts: &mut Vec<usize>,
                        current: &mut String,
                        current_start: &mut Option<usize>| {
        if let Some(start) = current_start.take() {
            tokens.push(std::mem::take(current));
            token_starts.push(start);
        }
    };

    for (index, ch) in input.char_indices() {
        if escaped {
            current.push(ch);
            escaped = false;
            continue;
        }

        if !in_single && !in_double {
            if ch.is_whitespace()
                || matches!(ch, '|' | '&' | ';' | '(' | ')' | '{' | '}' | '<' | '>')
            {
                push_current(
                    &mut tokens,
                    &mut token_starts,
                    &mut current,
                    &mut current_start,
                );
                continue;
            }
        }

        match ch {
            '\\' if !in_single => {
                if current_start.is_none() {
                    current_start = Some(index);
                }
                escaped = true;
            }
            '\'' if !in_double => {
                if current_start.is_none() {
                    current_start = Some(index);
                }
                in_single = !in_single;
            }
            '"' if !in_single => {
                if current_start.is_none() {
                    current_start = Some(index);
                }
                in_double = !in_double;
            }
            _ => {
                if current_start.is_none() {
                    current_start = Some(index);
                }
                current.push(ch);
            }
        }
    }

    if escaped {
        if current_start.is_none() {
            current_start = Some(input.len());
        }
        current.push('\\');
    }

    push_current(
        &mut tokens,
        &mut token_starts,
        &mut current,
        &mut current_start,
    );

    ParsedShellInput {
        tokens,
        token_starts,
        has_trailing_whitespace: input.chars().last().is_some_and(char::is_whitespace),
        input_len: input.len(),
    }
}

pub fn shell_split_words(input: &str) -> Vec<String> {
    parse_shell_input(input).tokens
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_quoted_words_and_keeps_token_starts() {
        let parsed = parse_shell_input(r#"modal run "modal training.py" --flag"#);
        assert_eq!(
            parsed.tokens,
            vec!["modal", "run", "modal training.py", "--flag"]
        );
        assert_eq!(parsed.token_starts, vec![0, 6, 10, 30]);
        assert!(!parsed.has_trailing_whitespace);
        assert_eq!(parsed.current_token_start(), Some(30));
    }

    #[test]
    fn marks_trailing_whitespace() {
        let parsed = parse_shell_input("modal run ");
        assert!(parsed.has_trailing_whitespace);
        assert_eq!(parsed.current_token_start(), Some("modal run ".len()));
        assert_eq!(parsed.tokens, vec!["modal", "run"]);
    }
}
