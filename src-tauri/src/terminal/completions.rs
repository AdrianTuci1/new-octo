use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ShellCompletionFormat {
    Raw,
    IncrementallyTyped,
}

impl ShellCompletionFormat {
    pub fn from_format_type(format: &str) -> Option<Self> {
        match format {
            "raw" => Some(Self::Raw),
            "incrementally_typed" => Some(Self::IncrementallyTyped),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellCompletion {
    pub name: String,
    pub description: Option<String>,
}

impl ShellCompletion {
    pub fn new(name: String) -> Self {
        Self {
            name: name.trim().to_string(),
            description: None,
        }
    }

    pub fn update_description(&mut self, value: String) {
        let value = value.trim();
        if !value.is_empty() {
            self.description = Some(value.to_string());
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ShellData {
    Raw {
        output: String,
    },
    IncrementallyTyped {
        output: Vec<ShellCompletion>,
    },
}

impl ShellData {
    pub fn from_format_type(format: &str) -> Option<Self> {
        match ShellCompletionFormat::from_format_type(format)? {
            ShellCompletionFormat::Raw => Some(Self::Raw {
                output: String::new(),
            }),
            ShellCompletionFormat::IncrementallyTyped => Some(Self::IncrementallyTyped {
                output: Vec::new(),
            }),
        }
    }
}

impl From<ShellData> for Vec<ShellCompletion> {
    fn from(shell_data: ShellData) -> Self {
        match shell_data {
            ShellData::Raw { output } => output
                .split_whitespace()
                .map(|name| ShellCompletion::new(name.to_string()))
                .collect(),
            ShellData::IncrementallyTyped { mut output } => {
                output.sort_by(|a, b| a.name.cmp(&b.name));
                output
            }
        }
    }
}

#[derive(Debug, Default)]
pub struct CompletionTracker {
    pending: Option<ShellData>,
}

impl CompletionTracker {
    pub fn start(&mut self, format: ShellCompletionFormat) {
        self.pending = Some(match format {
            ShellCompletionFormat::Raw => ShellData::Raw {
                output: String::new(),
            },
            ShellCompletionFormat::IncrementallyTyped => ShellData::IncrementallyTyped {
                output: Vec::new(),
            },
        });
    }

    pub fn push_result(&mut self, completion: ShellCompletion) {
        match self.pending.as_mut() {
            Some(ShellData::IncrementallyTyped { output }) => output.push(completion),
            Some(ShellData::Raw { output }) => {
                if !output.is_empty() {
                    output.push(' ');
                }
                output.push_str(&completion.name);
            }
            None => {}
        }
    }

    pub fn update_last_description(&mut self, value: String) {
        if let Some(ShellData::IncrementallyTyped { output }) = self.pending.as_mut() {
            if let Some(last) = output.last_mut() {
                last.update_description(value);
            }
        }
    }

    pub fn finish(&mut self) -> Option<ShellData> {
        self.pending.take()
    }

    pub fn is_active(&self) -> bool {
        self.pending.is_some()
    }
}
