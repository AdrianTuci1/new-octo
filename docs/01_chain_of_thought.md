# Chain-of-Thought: Cum Decide Agentul Când Să Se Oprească

> **Context:** Documentație extrasă din `warp/app/src/ai/` pentru implementarea în Octomus Launcher.  
> **Data:** 2026-05-02

---

## 1. Principiul Fundamental

Warp NU decide local când agentul trebuie să se oprească. **Serverul (cloud)** decide prin conținutul răspunsului streamed:

```
Dacă răspunsul conține `AIAgentAction` cu `requires_result: true`
  → Agentul CONTINUĂ (execută acțiunea, trimite rezultatul, face follow-up request)

Dacă răspunsul conține DOAR text (fără acțiuni)
  → Agentul SE OPREȘTE (conversația e marcată Success)

Dacă răspunsul conține eroare
  → Clasificare: transientă → retry | fatală → oprire
```

**Observație critică:** Logica de decizie este **server-side** (LLM-ul decide), iar clientul doar **reacționează** la ce primește.

---

## 2. Anatomia Unei Decizii: Flow-ul Complet

### 2.1 Warp Flow (Simplificat pentru Octomus)

```
┌─────────────────────────────────────────────────────────┐
│                    EXCHANGE LOOP                         │
│                                                         │
│  1. User trimite query (sau ActionResult)               │
│     └─→ AIAgentInput::UserQuery { query, context }      │
│         SAU                                             │
│         AIAgentInput::ActionResult { result, context }  │
│                                                         │
│  2. Request → Server (SSE stream)                       │
│     └─→ Stream de AIAgentOutputMessage-uri              │
│                                                         │
│  3. Server stream se TERMINĂ                            │
│     └─→ mark_request_completed() pe Conversation        │
│                                                         │
│  4. DECIZIA:                                            │
│     ┌─────────────────────────────────────────┐         │
│     │ output.actions().next().is_some()?       │         │
│     │                                         │         │
│     │  DA → has_new_actions = true             │         │
│     │       Status rămâne InProgress           │         │
│     │       Se execută acțiunile               │         │
│     │       Se trimite ActionResult            │         │
│     │       → REINTRĂ ÎN LOOP (pas 1)         │         │
│     │                                         │         │
│     │  NU → has_new_actions = false            │         │
│     │       Status → ConversationStatus::Success│        │
│     │       → IESE DIN LOOP                   │         │
│     └─────────────────────────────────────────┘         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Codul Cheie din Warp

**Fișier:** `warp/app/src/ai/agent/conversation.rs` (linia 1626-1679)

```rust
pub fn mark_request_completed(
    &mut self,
    stream_id: &ResponseStreamId,
    terminal_view_id: EntityId,
    ctx: &mut ModelContext<BlocklistAIHistoryModel>,
) -> Result<(), UpdateConversationError> {
    // ...
    let mut has_new_actions = false;
    for AddedExchange { exchange_id, task_id } in new_exchanges.into_iter() {
        let completed_exchange = self.mark_exchange_completed(&task_id, exchange_id)?;
        let output = completed_exchange.output_status.output().map(Shared::get_owned);
        if let Some(output_shared) = output {
            let output = output_shared.get();
            // ⭐ DECIZIA CRITICĂ: verifică dacă outputul conține acțiuni
            has_new_actions |= output.actions().next().is_some();
        }
    }

    if !has_new_actions {
        // ⭐ OPRIRE: Nu mai sunt acțiuni → conversația e completă
        self.update_status(ConversationStatus::Success, terminal_view_id, ctx);
    }
    // Dacă has_new_actions == true, status-ul rămâne InProgress
    // și controller-ul va executa acțiunile → genera ActionResult → follow-up
    Ok(())
}
```

---

## 3. Ciclul Complet: De la User Query la Final

```
User: "Creează un fișier hello.rs cu un Hello World"
  │
  ├─→ Exchange 1: UserQuery → Server
  │     Server răspunde cu:
  │       - Text: "Voi crea fișierul..."
  │       - Action: RequestFileEdits { path: "hello.rs", edits: [...] }
  │         requires_result: true ← CONTINUARE
  │
  │     mark_request_completed() → has_new_actions = true → CONTINUĂ
  │
  ├─→ Se execută RequestFileEdits → rezultat: Success { diff: "..." }
  │
  ├─→ Exchange 2: ActionResult { result: FileEditsSuccess } → Server
  │     Server răspunde cu:
  │       - Text: "Am creat fișierul. Acum voi rula compilatorul..."
  │       - Action: RequestCommandOutput { command: "rustc hello.rs" }
  │         requires_result: true ← CONTINUARE
  │
  │     mark_request_completed() → has_new_actions = true → CONTINUĂ
  │
  ├─→ Se execută comanda → rezultat: Completed { exit_code: 0, output: "..." }
  │
  ├─→ Exchange 3: ActionResult { result: CommandCompleted } → Server
  │     Server răspunde cu:
  │       - Text: "Compilarea a reușit! Fișierul hello.rs este gata."
  │       - (FĂRĂ acțiuni) ← OPRIRE
  │
  │     mark_request_completed() → has_new_actions = false
  │       → update_status(ConversationStatus::Success)
  │
  └─→ DONE. AgentDriver primește UpdatedConversationStatus → end_run_now()
```

---

## 4. Cum Știe AgentDriver Că S-a Terminat

**Fișier:** `warp/app/src/ai/agent_sdk/driver.rs` (linia 1700-2043)

AgentDriver monitorizează `BlocklistAIHistoryEvent::UpdatedConversationStatus`:

```rust
// execute_run() — subscribing la history events
BlocklistAIHistoryEvent::UpdatedConversationStatus { conversation_id, .. } => {
    let conversation = history_model.conversation(conversation_id);
    
    if conversation.status().is_in_progress() {
        // Conversația a fost reluată → anulează idle timeout
        run_exit.cancel_idle_timeout();
        return;
    }

    // ⭐ Conversația NU mai e in_progress → decide ce face
    let output_status = match conversation_output_status_from_conversation(conversation) {
        AmbientConversationStatus::Success => SDKConversationOutputStatus::Success,
        AmbientConversationStatus::Cancelled { reason } => Cancelled { reason },
        AmbientConversationStatus::Error { error } => {
            // ⭐ RETRY LOGIC: dacă eroarea e tranzientă
            if error.will_attempt_resume() {
                // Dă-i 30s să facă retry automat
                run_exit.end_run_after(AUTO_RESUME_TIMEOUT, output_status);
                return;
            }
            Error { error }
        }
        AmbientConversationStatus::Blocked { blocked_action } => Blocked { blocked_action },
    };

    // Success/Blocked/Cancelled → oprire (cu sau fără idle timeout)
    if let Some(idle_timeout) = me.idle_on_complete {
        run_exit.end_run_after(idle_timeout, output_status);
    } else {
        run_exit.end_run_now(output_status);
    }
}
```

---

## 5. Cazuri Speciale

### 5.1 Comenzi Long-Running (wait_until_completion: false)

Când LLM-ul cere o comandă dar NU vrea să aștepte terminarea:

```rust
AIAgentActionType::RequestCommandOutput {
    command: "npm run dev",
    wait_until_completion: false,  // ← Agent-monitored
}
```

→ Agentul pornește comanda, ia un snapshot al output-ului curent, și continuă.
→ Poate verifica mai târziu cu `ReadShellCommandOutput`.

### 5.2 Subagent Calls

Serverul poate crea sub-task-uri:

```rust
AIAgentOutputMessageType::Subagent(SubagentCall {
    task_id: "subtask-123",
    subagent_type: SubagentType::Cli,  // sau Research, Advice, etc.
})
```

→ Se creează un nou Task în TaskStore cu propriile Exchange-uri.
→ Task-ul principal rămâne InProgress până când sub-task-urile se termină.

### 5.3 Blocked State (Waiting for User Approval)

Când o acțiune necesită aprobare manuală:

```rust
SDKConversationOutputStatus::Blocked { blocked_action }
```

→ Agentul se oprește și raportează "blocked".
→ Userul aprobă → conversația se reia.

### 5.4 Error cu Auto-Resume

```rust
if error.will_attempt_resume() {
    // Server va retrimite requestul automat
    run_exit.end_run_after(AUTO_RESUME_TIMEOUT, output_status);
}
```

→ AgentDriver NU se oprește imediat, ci așteaptă `AUTO_RESUME_TIMEOUT` (30s).
→ Dacă retry-ul reușește, status-ul revine la InProgress.
→ Dacă timeout expiră, se oprește cu eroare.

---

## 6. Implementare în Octomus

### 6.1 Model Simplificat de Decizie

```rust
// src-tauri/src/ai/decision.rs

/// Determină dacă agentul trebuie să continue sau să se oprească.
pub enum AgentDecision {
    /// Agentul trebuie să execute acțiunile și să facă follow-up
    Continue { 
        pending_actions: Vec<AgentAction>,
    },
    /// Agentul a terminat cu succes
    Stop,
    /// Eroare — retry sau oprire
    Error { 
        error: AgentError,
        should_retry: bool,
    },
}

impl AgentDecision {
    pub fn from_response(response: &AgentResponse) -> Self {
        // Verifică dacă răspunsul conține tool calls cu requires_result
        let pending_actions: Vec<_> = response.tool_calls
            .iter()
            .filter(|tc| tc.requires_result)
            .cloned()
            .collect();

        if pending_actions.is_empty() {
            AgentDecision::Stop
        } else {
            AgentDecision::Continue { pending_actions }
        }
    }
}
```

### 6.2 Agent Loop Simplificat

```rust
// Pseudo-cod pentru OctomusAgentLoop
pub async fn run_agent_loop(
    prompt: String,
    harness: &dyn AgentHarness,
    sink: &AgentEventSink,
    cancel: &AgentCancellation,
) -> Result<AgentRunStatus, AgentError> {
    let mut conversation = Conversation::new();
    let mut current_input = AgentInput::UserQuery(prompt);
    
    loop {
        if cancel.is_cancelled() {
            return Ok(AgentRunStatus::Cancelled);
        }

        // 1. Trimite input-ul curent (query sau action result)
        let exchange = conversation.start_exchange(current_input.clone());
        
        // 2. Stream response de la LLM
        let response = with_bounded_retry(|| {
            harness.run_exchange(&exchange, sink, cancel)
        }).await?;

        // 3. Marchează exchange-ul ca finalizat
        conversation.complete_exchange(exchange.id, &response);

        // 4. DECIZIA: continuă sau se oprește?
        match AgentDecision::from_response(&response) {
            AgentDecision::Stop => {
                conversation.set_status(ConversationStatus::Success);
                return Ok(AgentRunStatus::Completed);
            }
            AgentDecision::Continue { pending_actions } => {
                // Execută acțiunile
                let results = execute_actions(pending_actions, sink, cancel).await;
                
                // Construiește ActionResult pentru follow-up
                current_input = AgentInput::ActionResults(results);
                // → REINTRĂ ÎN LOOP
            }
            AgentDecision::Error { error, should_retry } => {
                if should_retry {
                    // Retry-ul e gestionat de with_bounded_retry
                    continue;
                }
                conversation.set_status(ConversationStatus::Error);
                return Err(error);
            }
        }
    }
}
```

---

## 7. Diferențe Cheie: Warp vs. Octomus

| Aspect | Warp | Octomus (propus) |
|---|---|---|
| **Cine decide oprirea** | Serverul (prin conținutul răspunsului) | La fel — LLM-ul decide |
| **Unde e loop-ul** | Distribuit: server streamează → client reacționează → controller trimite follow-up | Centralizat: `run_agent_loop()` e un singur async fn |
| **UI framework coupling** | Strâns (GPUI ModelContext, Entity events) | Decuplat (Tauri events, fără UI framework dependency) |
| **Multi-agent** | TaskStore cu arbore de sub-task-uri | Nu e necesar inițial — un singur task |
| **Retry** | `with_bounded_retry()` din `retry.rs` | Identic — port direct |
| **Cancellation** | `AgentCancellation` (atomic flag) | Identic — deja implementat |

---

## 8. Fișiere Warp Relevante

| Fișier | Ce conține | Linie cheie |
|---|---|---|
| [`conversation.rs`](file:///Users/adriantucicovenco/Proiecte/warp/app/src/ai/agent/conversation.rs) | `mark_request_completed()` — decizia stop/continue | L1626-1679 |
| [`driver.rs`](file:///Users/adriantucicovencu/Proiecte/warp/app/src/ai/agent_sdk/driver.rs) | `execute_run()` — monitorizare completion | L1700-2043 |
| [`mod.rs`](file:///Users/adriantucicovenco/Proiecte/warp/app/src/ai/agent/mod.rs) | `AIAgentAction.requires_result` — flag-ul de continuare | L854-858 |
| [`mod.rs`](file:///Users/adriantucicovenco/Proiecte/warp/app/src/ai/agent/mod.rs) | `AIAgentInput::ActionResult` — follow-up input | L2480-2485 |
