#![allow(dead_code)]

use super::actions::AgentAction;

#[derive(Debug, Clone)]
pub enum AgentDecision {
    Continue {
        pending_actions: Vec<AgentAction>,
    },
    Stop,
}

impl AgentDecision {
    pub fn from_actions(actions: &[AgentAction]) -> Self {
        let pending_actions = actions
            .iter()
            .filter(|action| action.requires_result)
            .cloned()
            .collect::<Vec<_>>();

        if pending_actions.is_empty() {
            Self::Stop
        } else {
            Self::Continue { pending_actions }
        }
    }
}
