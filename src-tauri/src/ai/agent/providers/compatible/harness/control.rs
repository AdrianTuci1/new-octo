use super::heuristics::local_terminal_check_instruction;
use super::types::StageControlDecision;
use crate::ai::agent::harness::AgentHarnessContext;

pub(super) const MAX_STAGE_PASSES: u32 = 10;
const MARK_CONTINUE_TO_PLANNING: &str = "[[continue-to-planning]]";
const MARK_SKIP_PLANNING: &str = "[[skip-planning]]";
const MARK_DECLINE_PLAN: &str = "[[decline-plan]]";
const MARK_EMIT_FINAL_ANSWER: &str = "[[emit-final-answer]]";

pub(super) fn parse_stage_control(text: &str) -> Option<StageControlDecision> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Some(answer) = trimmed.strip_prefix(MARK_EMIT_FINAL_ANSWER) {
        return Some(StageControlDecision::EmitFinalAnswer(
            answer.trim().to_string(),
        ));
    }

    let first_non_empty_line = trimmed
        .lines()
        .find(|line| !line.trim().is_empty())
        .map(str::trim)?;

    match first_non_empty_line {
        MARK_CONTINUE_TO_PLANNING => Some(StageControlDecision::ContinueToPlanning),
        MARK_SKIP_PLANNING => Some(StageControlDecision::SkipPlanning),
        MARK_DECLINE_PLAN => Some(StageControlDecision::DeclinePlan),
        _ => None,
    }
}

pub(super) fn reasoning_stage_instruction(
    prompt_supports_visible_plan: bool,
    local_check: bool,
) -> String {
    let plan_hint = if prompt_supports_visible_plan {
        "Sarcina pare multi-step sau de implementare, deci `[[continue-to-planning]]` este de obicei alegerea corectă."
    } else {
        "`[[skip-planning]]` este preferat dacă nu ai nevoie de un artefact de plan vizibil."
    };
    let local_hint = if local_check {
        "Pentru verificări locale de runtime sau mediu, alege `[[skip-planning]]` ca pas următor."
    } else {
        ""
    };

    format!(
        "Stage executor pentru `reasoning`: nu ai voie să emiți tool calls. \
        La finalul acestui pas trebuie să produci exact unul dintre marker-ele `{}` sau `{}` ori `[[emit-final-answer]]`. \
        Dacă poți răspunde complet fără tool-uri, folosește `[[emit-final-answer]]` pe prima linie și pune răspunsul final după marker. \
        Altfel, răspunde numai cu marker-ul de tranziție, fără explicații vizibile suplimentare. {} {}",
        MARK_CONTINUE_TO_PLANNING, MARK_SKIP_PLANNING, plan_hint, local_hint
    )
}

pub(super) fn planning_stage_instruction() -> String {
    format!(
        "Stage executor pentru `planning`: fie emiți un singur tool call dintre `propose_plan`, `update_plan`, `plan_execution`, fie răspunzi doar cu `{}` dacă nu vrei plan, fie cu `[[emit-final-answer]]` urmat de răspuns dacă task-ul e deja complet. Nu da text vizibil obișnuit fără unul dintre aceste rezultate.",
        MARK_DECLINE_PLAN
    )
}

pub(super) fn tool_selection_stage_instructions(
    context: &AgentHarnessContext,
    local_terminal_check_requested: bool,
    pass_index: u32,
) -> Vec<String> {
    let mut instructions = vec![
        "Stage executor pentru `tool-selection`: alege exact următoarea acțiune utilă. Dacă poți răspunde direct, răspunde direct. Dacă ai nevoie de un tool, emite exact un tool call valid și nu amesteca pseudo-markup în textul vizibil.".to_string(),
    ];

    if local_terminal_check_requested {
        instructions.push(local_terminal_check_instruction(&context.prompt));
    }

    if pass_index > 0 {
        instructions.push(
            "Acesta este un retry de stage. Nu repeta aceeași alegere ineficientă; alege următorul pas minim care avansează clar task-ul."
                .to_string(),
        );
    }

    instructions
}

pub(super) fn verifying_stage_instruction() -> String {
    "Stage executor pentru `verifying`: interpretează rezultatul tool-ului. Dacă mai trebuie un pas, emite exact un nou tool call valid. Dacă sarcina este rezolvată, oferă răspunsul final direct. Dacă actualizezi planul, fă-o prin `update_plan` sau `plan_execution` și apoi continuă spre răspunsul final.".to_string()
}
