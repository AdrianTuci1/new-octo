use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};

use tauri::{AppHandle, Emitter};

use super::{
    manager::AgentHarnessManager,
    types::{
        AgentDoneEvent, AgentErrorEvent, AgentInputMessage, AgentRunStatus, AgentRunStatusEvent,
        AgentTokenEvent, AgentToolCall, AgentToolCallEvent, AgentToolResultEvent, AgentUsage,
    },
};

const EVENT_STATUS: &str = "agent:status";
const EVENT_TOKEN: &str = "agent:token";
const EVENT_TOOL_CALL: &str = "agent:tool_call";
const EVENT_TOOL_RESULT: &str = "agent:tool_result";
const EVENT_DONE: &str = "agent:done";
const EVENT_ERROR: &str = "agent:error";

#[derive(Clone)]
pub struct AgentCancellation {
    flag: Arc<AtomicBool>,
}

impl AgentCancellation {
    pub fn new(flag: Arc<AtomicBool>) -> Self {
        Self { flag }
    }

    pub fn is_cancelled(&self) -> bool {
        self.flag.load(Ordering::SeqCst)
    }
}

#[derive(Debug, Clone)]
pub struct AgentHarnessContext {
    pub run_id: String,
    pub conversation_id: String,
    pub assistant_message_id: String,
    pub prompt: String,
    pub messages: Vec<AgentInputMessage>,
    pub cwd: Option<String>,
    pub model_id: String,
}

#[derive(Debug, Clone)]
pub struct AgentHarnessOutcome {
    pub status: AgentRunStatus,
    pub usage: AgentUsage,
}

#[derive(Debug, Clone)]
pub struct AgentHarnessError {
    pub message: String,
}

impl AgentHarnessError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

pub trait AgentHarness: Send + Sync + 'static {
    fn kind(&self) -> &'static str;
    fn validate(&self) -> Result<(), AgentHarnessError>;
    fn run_async(
        &self,
        context: AgentHarnessContext,
        sink: AgentEventSink,
        cancellation: AgentCancellation,
    ) -> impl std::future::Future<Output = Result<AgentHarnessOutcome, AgentHarnessError>> + Send;
}

#[derive(Clone)]
pub struct AgentEventSink {
    app: AppHandle,
    window: tauri::Window,
    manager: AgentHarnessManager,
    run_id: String,
    conversation_id: String,
    assistant_message_id: String,
}

impl AgentEventSink {
    pub fn new(
        app: AppHandle,
        window: tauri::Window,
        manager: AgentHarnessManager,
        context: &AgentHarnessContext,
    ) -> Self {
        Self {
            app,
            window,
            manager,
            run_id: context.run_id.clone(),
            conversation_id: context.conversation_id.clone(),
            assistant_message_id: context.assistant_message_id.clone(),
        }
    }

    pub fn status(&self, status: AgentRunStatus, message: impl Into<Option<String>>) {
        let message = message.into();
        let _ = self
            .manager
            .set_status(&self.run_id, status, message.clone());
        let _ = self.window.emit(
            EVENT_STATUS,
            AgentRunStatusEvent {
                run_id: self.run_id.clone(),
                conversation_id: self.conversation_id.clone(),
                assistant_message_id: self.assistant_message_id.clone(),
                status,
                message,
            },
        );
    }

    pub fn token(&self, text: impl Into<String>) {
        let text_str = text.into();
        println!("[AI] Emitting token event to frontend: {}", text_str);
        let res = self.window.emit(
            EVENT_TOKEN,
            AgentTokenEvent {
                run_id: self.run_id.clone(),
                conversation_id: self.conversation_id.clone(),
                assistant_message_id: self.assistant_message_id.clone(),
                text: text_str,
            },
        );
        if let Err(e) = res {
            println!("[AI] ERROR emitting token event: {:?}", e);
        }
    }

    pub fn tool_call(&self, tool_call: AgentToolCall) {
        println!("[AI] Emitting tool call: {} with args: {}", tool_call.name, tool_call.args);
        let res = self.window.emit(
            EVENT_TOOL_CALL,
            AgentToolCallEvent {
                run_id: self.run_id.clone(),
                conversation_id: self.conversation_id.clone(),
                assistant_message_id: self.assistant_message_id.clone(),
                tool_call,
            },
        );
        if let Err(e) = res {
            println!("[AI] ERROR emitting tool call event: {:?}", e);
        }
    }

    pub fn tool_result(&self, tool_call_id: impl Into<String>, result: impl Into<String>) {
        let _ = self.window.emit(
            EVENT_TOOL_RESULT,
            AgentToolResultEvent {
                run_id: self.run_id.clone(),
                conversation_id: self.conversation_id.clone(),
                assistant_message_id: self.assistant_message_id.clone(),
                tool_call_id: tool_call_id.into(),
                result: result.into(),
            },
        );
    }

    pub fn done(&self, status: AgentRunStatus, usage: AgentUsage) {
        self.status(status, None::<String>);
        let _ = self.window.emit(
            EVENT_DONE,
            AgentDoneEvent {
                run_id: self.run_id.clone(),
                conversation_id: self.conversation_id.clone(),
                assistant_message_id: self.assistant_message_id.clone(),
                status,
                usage,
            },
        );
    }

    pub fn error(&self, error: impl Into<String>) {
        let error = error.into();
        let _ = self.manager.fail(&self.run_id, error.clone());
        let _ = self.window.emit(
            EVENT_ERROR,
            AgentErrorEvent {
                run_id: self.run_id.clone(),
                conversation_id: self.conversation_id.clone(),
                assistant_message_id: self.assistant_message_id.clone(),
                error,
            },
        );
    }
}

pub fn sleep_or_cancel(cancellation: &AgentCancellation, duration: Duration) -> bool {
    let slices = duration.as_millis().max(1).div_ceil(10) as u64;

    for _ in 0..slices {
        if cancellation.is_cancelled() {
            return true;
        }
        thread::sleep(Duration::from_millis(10));
    }

    cancellation.is_cancelled()
}
