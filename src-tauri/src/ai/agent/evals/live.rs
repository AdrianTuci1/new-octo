use crate::ai::agent::providers::OpenAiCompatibleConfig;
use std::sync::{Mutex, OnceLock};

use super::runner::run_live_eval;
use super::scenarios::LIVE_EVAL_SCENARIOS;

static LIVE_EVAL_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

#[test]
#[ignore = "live model-backed eval; run with tests.env"]
fn workspace_search_and_read_eval() {
    run_named_live_eval("workspace-search-read");
}

#[test]
#[ignore = "live model-backed eval; run with tests.env"]
fn multi_file_edit_eval() {
    run_named_live_eval("multi-file-edit");
}

#[test]
#[ignore = "live model-backed eval; run with tests.env"]
fn skill_assisted_search_eval() {
    run_named_live_eval("skill-assisted-search");
}

#[test]
#[ignore = "live model-backed eval; run with tests.env"]
fn cloud_agent_launch_eval() {
    run_named_live_eval("cloud-agent-launch");
}

fn run_named_live_eval(id: &str) {
    let lock = LIVE_EVAL_LOCK.get_or_init(|| Mutex::new(()));
    let _guard = lock.lock().unwrap_or_else(|error| error.into_inner());
    let scenario = LIVE_EVAL_SCENARIOS
        .iter()
        .find(|scenario| scenario.id == id)
        .unwrap_or_else(|| panic!("missing eval scenario `{id}`"));
    let config = OpenAiCompatibleConfig::from_env()
        .unwrap_or_else(|| panic!("missing OCTOMUS_AI_API_KEY/OPENAI_API_KEY for live eval"));
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap_or_else(|error| panic!("failed to build Tokio runtime for live eval: {error}"));

    let result = runtime
        .block_on(run_live_eval(config, scenario))
        .unwrap_or_else(|error| panic!("live eval '{}' failed: {error}", scenario.id));

    if let Some(verdict) = result.judge_verdict {
        println!("[agent-eval] judge verdict: {}", verdict.summary);
    }
}
