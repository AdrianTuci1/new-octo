use super::types::StageControlDecision;

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

pub(super) fn planning_stage_instruction() -> String {
    format!(
        "Stage executor pentru `planning`: fie emiți un singur tool call dintre `propose_plan`, `update_plan`, `plan_execution`, fie răspunzi doar cu `{}` dacă nu vrei plan, fie cu `[[emit-final-answer]]` urmat de răspuns dacă task-ul e deja complet. Nu da text vizibil obișnuit fără unul dintre aceste rezultate.",
        MARK_DECLINE_PLAN
    )
}

pub(super) fn tool_selection_stage_instructions(pass_index: u32) -> Vec<String> {
    let mut instructions = vec![
        "Stage executor pentru `tool-selection`: alege exact următoarea acțiune utilă. Dacă poți răspunde direct, răspunde direct. Dacă ai nevoie de un tool, emite exact un tool call valid și nu amesteca pseudo-markup în textul vizibil.".to_string(),
        "Dacă vrei să propui o comandă de terminal, numele exact al tool-ului este `propose_terminal_command` și argumentele trebuie să includă un câmp `command` concret. Nu inventa aliasuri precum `shell:execute` sau alte variante similare. Nu emite niciodată acest tool fără `command`; un tool call cu args goale este invalid. Dacă nu poți formula comanda acum, răspunde direct sau cere o clarificare scurtă.".to_string(),
    ];

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
