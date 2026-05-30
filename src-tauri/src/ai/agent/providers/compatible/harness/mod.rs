use crate::ai::agent::harness::{
    AgentCancellation, AgentEventSink, AgentHarness, AgentHarnessContext, AgentHarnessError,
    AgentHarnessOutcome,
};

use super::config::OpenAiCompatibleConfig;

mod actions;
mod context;
mod control;
mod executor;
mod heuristics;
mod messages;
mod outcomes;
mod parser;
mod provider;
mod resume;
mod thinking;
mod types;

#[cfg(test)]
mod tests;

pub struct OpenAiCompatibleHarness {
    pub config: OpenAiCompatibleConfig,
}

impl OpenAiCompatibleHarness {
    pub fn new(config: OpenAiCompatibleConfig) -> Self {
        Self { config }
    }
}

impl AgentHarness for OpenAiCompatibleHarness {
    fn kind(&self) -> &'static str {
        "openai-compatible"
    }

    fn validate(&self) -> Result<(), AgentHarnessError> {
        if self.config.api_key.trim().is_empty() {
            return Err(AgentHarnessError::new(
                "OpenAI compatible API key cannot be empty. Please configure it in Settings.",
            ));
        }
        Ok(())
    }

    fn run_async(
        &self,
        context: AgentHarnessContext,
        sink: AgentEventSink,
        cancellation: AgentCancellation,
    ) -> impl std::future::Future<Output = Result<AgentHarnessOutcome, AgentHarnessError>> + Send
    {
        executor::stream_chat_completion(self.config.clone(), context, sink, cancellation)
    }
}
