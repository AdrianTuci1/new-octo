#![allow(dead_code)]

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use super::{actions::AgentAction, actions::AgentActionResult, types::AgentUsage};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConversationStatus {
    InProgress,
    Success,
    Cancelled,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Exchange {
    pub id: String,
    pub input: ExchangeInput,
    pub output: Option<ExchangeOutput>,
    pub status: ExchangeStatus,
    pub started_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
    pub model_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum ExchangeInput {
    UserQuery { query: String },
    ActionResults { results: Vec<AgentActionResult> },
    ResumeConversation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeOutput {
    pub text: String,
    pub actions: Vec<AgentAction>,
    pub reasoning: Option<String>,
    pub token_usage: Option<AgentUsage>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ExchangeStatus {
    Streaming,
    Completed,
    Cancelled,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub id: String,
    pub exchanges: Vec<Exchange>,
    pub status: ConversationStatus,
    pub title: Option<String>,
    pub model_id: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub total_tokens: u32,
}

impl Conversation {
    pub fn new(model_id: impl Into<String>) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            exchanges: Vec::new(),
            status: ConversationStatus::InProgress,
            title: None,
            model_id: model_id.into(),
            created_at: now,
            updated_at: now,
            total_tokens: 0,
        }
    }

    pub fn start_exchange(&mut self, input: ExchangeInput) -> &mut Exchange {
        let exchange = Exchange {
            id: Uuid::new_v4().to_string(),
            input,
            output: None,
            status: ExchangeStatus::Streaming,
            started_at: Utc::now(),
            finished_at: None,
            model_id: Some(self.model_id.clone()),
        };

        self.exchanges.push(exchange);
        self.status = ConversationStatus::InProgress;
        self.updated_at = Utc::now();
        self.exchanges
            .last_mut()
            .expect("newly pushed exchange must exist")
    }

    pub fn complete_current_exchange(&mut self, output: ExchangeOutput) -> bool {
        let has_actions = !output.actions.is_empty();

        if let Some(exchange) = self.exchanges.last_mut() {
            if let Some(usage) = &output.token_usage {
                self.total_tokens += usage.total_tokens;
            }
            exchange.output = Some(output);
            exchange.status = ExchangeStatus::Completed;
            exchange.finished_at = Some(Utc::now());
        }

        self.updated_at = Utc::now();
        if !has_actions {
            self.status = ConversationStatus::Success;
        }

        has_actions
    }

    pub fn mark_error(&mut self) {
        self.status = ConversationStatus::Error;
        self.updated_at = Utc::now();
        if let Some(exchange) = self.exchanges.last_mut() {
            exchange.status = ExchangeStatus::Error;
            exchange.finished_at = Some(Utc::now());
        }
    }

    pub fn mark_cancelled(&mut self) {
        self.status = ConversationStatus::Cancelled;
        self.updated_at = Utc::now();
        if let Some(exchange) = self.exchanges.last_mut() {
            exchange.status = ExchangeStatus::Cancelled;
            exchange.finished_at = Some(Utc::now());
        }
    }

    pub fn to_api_messages(&self) -> Vec<serde_json::Value> {
        let mut messages = Vec::new();

        for exchange in &self.exchanges {
            match &exchange.input {
                ExchangeInput::UserQuery { query } => {
                    messages.push(json!({
                        "role": "user",
                        "content": query,
                    }));
                }
                ExchangeInput::ActionResults { results } => {
                    for result in results {
                        messages.push(json!({
                            "role": "tool",
                            "tool_call_id": result.tool_call_id,
                            "content": result.to_content_string(),
                        }));
                    }
                }
                ExchangeInput::ResumeConversation => {
                    messages.push(json!({
                        "role": "user",
                        "content": "Please continue.",
                    }));
                }
            }

            if let Some(output) = &exchange.output {
                let mut assistant_message = json!({
                    "role": "assistant",
                    "content": output.text,
                });
                if !output.actions.is_empty() {
                    assistant_message["tool_calls"] = output
                        .actions
                        .iter()
                        .map(AgentAction::to_api_tool_call)
                        .collect::<Vec<_>>()
                        .into();
                }
                messages.push(assistant_message);
            }
        }

        messages
    }

    pub fn initial_query(&self) -> Option<&str> {
        self.exchanges.first().and_then(|exchange| match &exchange.input {
            ExchangeInput::UserQuery { query } => Some(query.as_str()),
            _ => None,
        })
    }

    pub fn latest_exchange(&self) -> Option<&Exchange> {
        self.exchanges.last()
    }

    pub fn is_finished(&self) -> bool {
        !matches!(self.status, ConversationStatus::InProgress)
    }
}
