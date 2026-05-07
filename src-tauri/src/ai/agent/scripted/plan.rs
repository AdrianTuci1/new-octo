use super::super::harness::AgentHarnessContext;

pub struct ScriptedPlan {
    pub response: String,
    pub tool_command: Option<String>,
    pub web_search_query: Option<String>,
    pub execution_plan_tool: Option<&'static str>,
    pub execution_plan: Option<serde_json::Value>,
    pub follow_up_prompt: Option<String>,
}

pub fn build_plan(context: &AgentHarnessContext) -> ScriptedPlan {
    let prompt = context.prompt.trim();
    let normalized = prompt.to_lowercase();
    let latest_tool_message = context
        .messages
        .iter()
        .rev()
        .find(|message| message.role == "tool")
        .map(|message| message.content.trim().to_string());

    if let Some(tool_content) = latest_tool_message.as_deref() {
        if tool_content.contains("Web search results for")
            || tool_content.contains("No web results found for")
        {
            return ScriptedPlan {
                tool_command: None,
                web_search_query: None,
                execution_plan_tool: None,
                execution_plan: None,
                follow_up_prompt: Some("Care rezultat ți se pare cel mai relevant și vrei să-l analizăm?".to_string()),
                response: "Am primit rezultatele căutării web și pot continua pe baza lor. În fluxul final, aici agentul ar rezuma ce contează și ar alege următorul pas fără heuristici în frontend.".to_string(),
            };
        }

        if context.messages.iter().any(|message| {
            message.role == "tool"
                && message
                    .content
                    .contains("Define the agent artifact and planning surfaces")
        }) {
            return ScriptedPlan {
                tool_command: None,
                web_search_query: None,
                execution_plan_tool: Some("plan_execution"),
                execution_plan: Some(serde_json::json!({
                    "planId": "plan-phase-3",
                    "stepId": "2",
                    "action": "started",
                    "summary": "Pasul de orchestration este activ și rulează cu două workstreams paralele.",
                    "workstreams": [
                        {
                            "id": "memory-graph",
                            "title": "Memory graph integration",
                            "status": "inProgress",
                            "stepIds": ["2"]
                        },
                        {
                            "id": "ui-sync",
                            "title": "UI sync for task state",
                            "status": "pending",
                            "stepIds": ["2"]
                        }
                    ]
                })),
                follow_up_prompt: Some("Vrei să continuăm cu următorul pas din plan și să legăm actualizările de orchestration?".to_string()),
                response: "Am marcat pornirea pasului activ și am atașat workstream-urile paralele, astfel încât task-urile copil să poată primi exchange-uri reale.".to_string(),
            };
        }

        return ScriptedPlan {
            tool_command: None,
            web_search_query: None,
            execution_plan_tool: None,
            execution_plan: None,
            follow_up_prompt: Some("Vrei să interpretăm rezultatul și să alegem pasul următor?".to_string()),
            response: "Am primit rezultatul tool-ului și continui direct din backend. În această arhitectură, răspunsul următor vine din agent, nu dintr-un prompt fabricat în frontend.".to_string(),
        };
    }

    if normalized.contains("git") {
        return ScriptedPlan {
            tool_command: Some("git status --short".to_string()),
            web_search_query: None,
            execution_plan_tool: None,
            execution_plan: None,
            follow_up_prompt: Some("Vrei să vedem și fișierele modificate în detaliu?".to_string()),
            response: format!(
                "Pot verifica starea repository-ului fara sa rulez nimic automat. Harness-ul a pregatit o propunere de comanda, iar UI-ul pastreaza aprobarea la utilizator.\n\n```bash\ngit status --short\n```\n\nContext primit: `{}`",
                super::util::compact_prompt(prompt)
            ),
        };
    }

    if normalized.contains("eroare")
        || normalized.contains("error")
        || normalized.contains("fail")
        || normalized.contains("crash")
    {
        return ScriptedPlan {
            tool_command: Some("ls /tmp/octomus-this-path-should-not-exist".to_string()),
            web_search_query: None,
            execution_plan_tool: None,
            execution_plan: None,
            follow_up_prompt: Some("Explică-mi de ce a eșuat comanda și care e pasul sigur următor.".to_string()),
            response: "Am ales o comanda controlata pentru a testa fluxul de eroare si cardul de terminal. Ea ramane doar propusa pana la aprobare.\n\n```bash\nls /tmp/octomus-this-path-should-not-exist\n```\n\nDupa ce o rulezi, harness-ul poate primi blocul de terminal ca input contextual pentru urmatorul pas.".to_string(),
        };
    }

    if normalized.contains("file") || normalized.contains("fisier") || normalized.contains("rg") {
        return ScriptedPlan {
            tool_command: Some("rg --files".to_string()),
            web_search_query: None,
            execution_plan_tool: None,
            execution_plan: None,
            follow_up_prompt: Some("Arată-mi fișierul principal și punctul de intrare.".to_string()),
            response: "Pentru inspectie rapida de proiect, harness-ul propune o cautare de fisiere prin `rg`, pastrand executia sub controlul tau.\n\n```bash\nrg --files\n```\n\nAcesta este punctul unde, mai tarziu, conectam tool registry-ul real pentru read/search/edit.".to_string(),
        };
    }

    if normalized.contains("știri")
        || normalized.contains("stiri")
        || normalized.contains("nout")
        || normalized.contains("latest")
        || normalized.contains("recent")
        || normalized.contains("robotic")
    {
        return ScriptedPlan {
            tool_command: None,
            web_search_query: Some(prompt.to_string()),
            execution_plan_tool: None,
            execution_plan: None,
            follow_up_prompt: None,
            response: "Pornesc o căutare web locală și revin după ce primesc rezultatele."
                .to_string(),
        };
    }

    if normalized.contains("implement")
        || normalized.contains("implementation")
        || normalized.contains("faza")
        || normalized.contains("phase")
        || normalized.contains("plan")
    {
        return ScriptedPlan {
            tool_command: None,
            web_search_query: None,
            execution_plan_tool: Some("propose_plan"),
            execution_plan: Some(serde_json::json!({
                "id": "plan-phase-3",
                "title": "Execution plan for advanced agent workflow",
                "summary": "Stabilim pașii principali înainte să trecem la orchestration mai avansat.",
                "version": "v1",
                "steps": [
                    { "id": "1", "label": "Define the agent artifact and planning surfaces", "status": "completed" },
                    { "id": "2", "label": "Persist plans in conversation memory", "status": "pending" },
                    { "id": "3", "label": "Connect plan updates to future orchestration state", "status": "pending" }
                ],
                "workstreams": [
                    {
                        "id": "memory-graph",
                        "title": "Memory graph integration",
                        "status": "pending",
                        "stepIds": ["2"]
                    },
                    {
                        "id": "ui-sync",
                        "title": "UI sync for task state",
                        "status": "pending",
                        "stepIds": ["2", "3"]
                    }
                ]
            })),
            follow_up_prompt: Some("Vrei să continuăm cu actualizarea acestui plan pe măsură ce agentul execută pașii?".to_string()),
            response: "Am propus un plan de execuție în chat, ca fundație pentru orchestration și pentru task-uri cu mai mulți pași.".to_string(),
        };
    }

    ScriptedPlan {
        tool_command: None,
        web_search_query: None,
        execution_plan_tool: None,
        execution_plan: None,
        follow_up_prompt: Some("Ce ai vrea să explorăm mai departe în acest subiect?".to_string()),
        response: format!(
            "Am rulat cererea prin harness-ul local. In forma actuala, motorul face lifecycle complet: creeaza run-ul, emite stari, stream-uieste raspunsul, accepta anulare si finalizeaza usage estimativ.\n\nCererea ta:\n\n> {}\n\nUrmatorul strat va putea injecta un model real fara ca `AgentDriver` sau harness-ul sa stie despre auth, credite ori proxy.",
            prompt
        ),
    }
}
