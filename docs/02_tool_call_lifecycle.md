# Tool Call Lifecycle: De la LLM Response la Action Result

> **Context:** Documentație extrasă din `warp/app/src/ai/agent/` pentru implementarea în Octomus Launcher.  
> **Data:** 2026-05-02

---

## 1. Panorama Completă

Warp implementează un **sistem bidirectional** de tool calls:

```
LLM → Stream Response → Parse Tool Calls → Execute → Collect Results → Send Back → LLM
```

Asta e exact mecanismul **function calling** din OpenAI/Anthropic, dar cu un layer suplimentar de **permisiuni**, **auto-execute**, și **UI feedback**.

---

## 2. Taxonomia Completă a Acțiunilor

### 2.1 AIAgentActionType — Toate Tool-urile Disponibile

**Fișier:** `warp/app/src/ai/agent/mod.rs`

```rust
pub enum AIAgentActionType {
    // ═══════════════════════════════════════════════════
    // COMENZI TERMINAL
    // ═══════════════════════════════════════════════════
    
    /// Rulează o comandă și returnează output-ul
    RequestCommandOutput {
        command: String,
        /// true = așteaptă terminarea (comanda scurtă)
        /// false = ia un snapshot și continuă (comanda lungă)
        wait_until_completion: bool,
    },
    
    /// Scrie input la o comandă deja rulând (ex: ctrl+c, răspuns prompt)
    WriteToLongRunningShellCommand {
        input: String,
        command_id: AIAgentActionId,
    },
    
    /// Citește output-ul curent al unei comenzi long-running
    ReadShellCommandOutput {
        command_id: AIAgentActionId,
    },

    // ═══════════════════════════════════════════════════
    // FIȘIERE & CODEBASE
    // ═══════════════════════════════════════════════════
    
    /// Citește conținutul unuia sau mai multor fișiere
    ReadFiles {
        file_paths: Vec<String>,
    },
    
    /// Aplică editări pe un fișier (search/replace diff)
    RequestFileEdits {
        file_path: String,
        edits: Vec<FileEdit>,
    },
    
    /// Caută semantic în codebase (embeddings)
    SearchCodebase {
        query: String,
    },
    
    /// Grep clasic (regex/literal)
    Grep {
        pattern: String,
        path: Option<String>,
        is_regex: bool,
        case_insensitive: bool,
        // + alte opțiuni
    },
    
    /// Glob file matching
    FileGlob {
        patterns: Vec<String>,
    },

    // ═══════════════════════════════════════════════════
    // DOCUMENTE (Warp Drive)
    // ═══════════════════════════════════════════════════
    
    ReadDocuments { document_ids: Vec<String> },
    EditDocuments { edits: Vec<DocumentEdit> },
    CreateDocuments { documents: Vec<DocumentCreate> },

    // ═══════════════════════════════════════════════════
    // MCP (Model Context Protocol)
    // ═══════════════════════════════════════════════════
    
    ReadMCPResource { server_id: String, uri: String },
    CallMCPTool { server_id: String, tool_name: String, arguments: Value },

    // ═══════════════════════════════════════════════════
    // UI / AGENT INTERACTIONS
    // ═══════════════════════════════════════════════════
    
    UseComputer { action: ComputerAction },
    SuggestNewConversation { prompt: String },
    SuggestPrompt { prompt: String },
    UploadArtifact { file_path: String },
}
```

### 2.2 AIAgentAction — Wrapper cu Metadata

```rust
pub struct AIAgentAction {
    /// ID unic pentru acțiune (generat de server)
    pub id: AIAgentActionId,
    
    /// Task-ul căruia îi aparține
    pub task_id: TaskId,
    
    /// Acțiunea propriu-zisă
    pub action: AIAgentActionType,
    
    /// ⭐ FLAG CRITIC: dacă e true, TREBUIE trimis rezultat înapoi la LLM
    /// Dacă e false, e fire-and-forget
    pub requires_result: bool,
}
```

---

## 3. Lifecycle-ul Unui Tool Call

### 3.1 Diagrama Completă

```
┌─────────────────────────────────────────────────────────────────┐
│                     TOOL CALL LIFECYCLE                          │
│                                                                 │
│  ┌─ PARSE ──────────────────────────────────────────────────┐   │
│  │                                                          │   │
│  │  Server streamează un mesaj de tip ToolCall:             │   │
│  │    - tool_call_id: "tc_abc123"                          │   │
│  │    - function_name: "request_command_output"             │   │
│  │    - arguments: { "command": "ls -la" }                  │   │
│  │                                                          │   │
│  │  Parser (convert_from.rs) creează:                       │   │
│  │    AIAgentAction {                                       │   │
│  │      id: "tc_abc123",                                    │   │
│  │      action: RequestCommandOutput { command: "ls -la" }, │   │
│  │      requires_result: true,                              │   │
│  │    }                                                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  ┌─ PERMISSION CHECK ──────────────────────────────────────┐   │
│  │                                                          │   │
│  │  Verifică dacă acțiunea poate fi auto-executată:         │   │
│  │    1. AIConversationAutoexecuteMode                      │   │
│  │       - AutoexecuteAll → auto-execute                    │   │
│  │       - AutoexecuteNone → cere aprobare                  │   │
│  │       - Default → check per-action                       │   │
│  │    2. Denylist checking                                  │   │
│  │       - Comanda e pe lista neagră? → refuză              │   │
│  │    3. Action-specific rules                              │   │
│  │       - ReadFiles → always auto-execute                  │   │
│  │       - RequestCommandOutput → depends on setting        │   │
│  │       - RequestFileEdits → depends on setting            │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                    ┌──────┴──────┐                               │
│                    │ Auto-exec?  │                               │
│                    └──────┬──────┘                               │
│                   YES     │     NO                               │
│                    │      │      │                               │
│                    ▼      │      ▼                               │
│  ┌─ EXECUTE ───────┐     │  ┌─ WAIT APPROVAL ────────┐         │
│  │ Rulează direct   │     │  │ Emit event "blocked"   │         │
│  │ fără UI          │     │  │ Așteaptă user input    │         │
│  └────────┬─────────┘     │  └───────────┬────────────┘         │
│           │               │              │                      │
│           ▼               │              ▼                      │
│  ┌─ COLLECT RESULT ───────────────────────────────────────┐     │
│  │                                                         │    │
│  │  AIAgentActionResult {                                  │    │
│  │    id: "tc_abc123",  // ← Același ID ca acțiunea       │    │
│  │    task_id: task_id,                                    │    │
│  │    result: AIAgentActionResultType::                    │    │
│  │      RequestCommandOutput(                              │    │
│  │        RequestCommandOutputResult::Completed {          │    │
│  │          command: "ls -la",                             │    │
│  │          output: "total 42\ndrwxr-xr-x ...",           │    │
│  │          exit_code: Some(0),                            │    │
│  │        }                                                │    │
│  │      )                                                  │    │
│  │  }                                                      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │                                     │
│                           ▼                                     │
│  ┌─ SEND BACK ─────────────────────────────────────────────┐   │
│  │                                                          │   │
│  │  Se creează un nou AIAgentInput::ActionResult:           │   │
│  │    AIAgentInput::ActionResult {                          │   │
│  │      result: <AIAgentActionResult de mai sus>,           │   │
│  │      context: <updated execution context>,               │   │
│  │    }                                                     │   │
│  │                                                          │   │
│  │  Se trimite ca follow-up request la server               │   │
│  │  → Server primește rezultatul și decide:                 │   │
│  │    - Mai are nevoie de alte acțiuni? → trimite noi       │   │
│  │    - E satisfăcut? → trimite doar text (→ STOP)         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Taxonomia Rezultatelor (AIAgentActionResultType)

Fiecare tip de acțiune are propriul tip de rezultat:

### 4.1 Rezultate pentru Comenzi Terminal

```rust
pub enum RequestCommandOutputResult {
    /// Comanda s-a terminat cu succes
    Completed {
        command: String,
        output: String,           // stdout + stderr combinat
        exit_code: Option<i32>,
    },
    
    /// Comanda e long-running — snapshot al output-ului curent
    LongRunningCommandSnapshot {
        command: String,
        grid_contents: String,    // conținutul terminalului
        cursor: String,           // poziția cursorului
        is_alt_screen_active: bool,
    },
    
    /// User-ul a anulat comanda înainte de execuție
    CancelledBeforeExecution,
    
    /// Comanda e pe denylist
    Denylisted { command: String },
}
```

### 4.2 Rezultate pentru File Edits

```rust
pub enum RequestFileEditsResult {
    /// Editările au fost aplicate
    Success {
        diff: String,              // diff-ul generat
        file_path: String,
    },
    
    /// User-ul a refuzat editările
    Cancelled,
    
    /// Diff-ul nu a putut fi aplicat
    DiffApplicationFailed { error: String },
}
```

### 4.3 Rezultate pentru File Operations

```rust
pub enum ReadFilesResult {
    Success { files: Vec<FileContent> },
    Error(String),
    Cancelled,
}

pub enum SearchCodebaseResult {
    Success { files: Vec<FileContent> },
    Failed { message: String },
    Cancelled,
}

pub enum GrepResult {
    Success { matched_files: Vec<GrepMatch> },
    Error(String),
    Cancelled,
}
```

### 4.4 Pattern-ul Comun: Cancelled

**IMPORTANT:** Fiecare rezultat poate fi `Cancelled`. Warp verifică asta:

```rust
impl AIAgentActionResult {
    pub fn is_rejected(&self) -> bool {
        matches!(
            self.result,
            AIAgentActionResultType::RequestFileEdits(RequestFileEditsResult::Cancelled)
                | AIAgentActionResultType::RequestCommandOutput(
                    RequestCommandOutputResult::CancelledBeforeExecution
                )
                | AIAgentActionResultType::ReadFiles(ReadFilesResult::Cancelled)
                // ... etc
        )
    }
}
```

Când user-ul refuză o acțiune, se trimite `Cancelled` înapoi la LLM, care decide cum să continue.

---

## 5. Cazuri Speciale

### 5.1 Comenzi Long-Running (Agent-Monitored)

Când `wait_until_completion: false`:

```
1. Agent pornește comanda (ex: "npm run dev")
2. Așteaptă un interval scurt (configurable)
3. Ia un "snapshot" al grid-ului terminal
4. Trimite LongRunningCommandSnapshot ca rezultat
5. LLM-ul vede output-ul curent și decide:
   - Totul arată bine → continuă cu alte acțiuni
   - Ceva nu e ok → trimite WriteToLongRunningShellCommand (ex: ctrl+c)
   - Are nevoie de mai mult output → trimite ReadShellCommandOutput
```

### 5.2 Write to Long-Running Shell Command

```rust
// LLM-ul poate interacționa cu comenzi deja pornite:
AIAgentActionType::WriteToLongRunningShellCommand {
    input: "y\n",          // trimite "y" și Enter
    command_id: "tc_abc",  // referință la comanda originală
}
```

Rezultatele posibile:
```rust
pub enum WriteToLongRunningShellCommandResult {
    CommandFinished { output: String, exit_code: Option<i32> },
    Snapshot { grid_contents: String, cursor: String },
    Cancelled,
    Error(WriteToLongRunningShellError),
}
```

### 5.3 Multiple Tool Calls Simultane

LLM-ul poate trimite **mai multe tool calls** într-un singur răspuns. Warp le procesează **secvențial** (în ordinea primirii), dar rezultatele sunt colectate și trimise **toate** într-un singur follow-up request.

---

## 6. Implementare în Octomus

### 6.1 Tipuri de Acțiuni (Subset Inițial)

```rust
// src-tauri/src/ai/actions.rs

/// Tool-urile disponibile pentru agentul Octomus (subset inițial)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OctomusActionType {
    /// Execută o comandă în terminal
    RunCommand {
        command: String,
        /// Dacă true, așteaptă terminarea. Dacă false, ia snapshot.
        wait_until_completion: bool,
    },
    
    /// Citește fișiere
    ReadFiles {
        file_paths: Vec<String>,
    },
    
    /// Creează sau suprascrie un fișier
    WriteFile {
        file_path: String,
        content: String,
    },
    
    /// Aplică un diff pe un fișier existent
    EditFile {
        file_path: String,
        search: String,
        replace: String,
    },
    
    /// Grep prin fișiere
    Grep {
        pattern: String,
        path: Option<String>,
        is_regex: bool,
    },
}

/// Un tool call parsat din răspunsul LLM-ului
#[derive(Debug, Clone)]
pub struct AgentAction {
    /// ID-ul tool call-ului (de la LLM)
    pub id: String,
    
    /// Acțiunea propriu-zisă
    pub action: OctomusActionType,
    
    /// Dacă LLM-ul așteaptă rezultat
    pub requires_result: bool,
}
```

### 6.2 Tipuri de Rezultate

```rust
// src-tauri/src/ai/action_results.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ActionResult {
    /// Comandă executată
    CommandCompleted {
        command: String,
        output: String,
        exit_code: Option<i32>,
    },
    
    /// Snapshot al comenzii long-running
    CommandSnapshot {
        command: String,
        output: String,
    },
    
    /// Fișiere citite
    FilesRead {
        files: Vec<FileContent>,
    },
    
    /// Fișier scris/editat
    FileWritten {
        file_path: String,
        diff: Option<String>,
    },
    
    /// Rezultat grep
    GrepMatches {
        matches: Vec<GrepMatch>,
    },
    
    /// Acțiune refuzată de user
    Cancelled,
    
    /// Eroare la execuție
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentActionResult {
    /// Același ID ca al acțiunii originale
    pub tool_call_id: String,
    /// Rezultatul
    pub result: ActionResult,
}
```

### 6.3 Executor de Acțiuni

```rust
// src-tauri/src/ai/executor.rs

pub async fn execute_action(
    action: &AgentAction,
    working_dir: &Path,
    sink: &AgentEventSink,
    cancel: &AgentCancellation,
) -> AgentActionResult {
    let result = match &action.action {
        OctomusActionType::RunCommand { command, wait_until_completion } => {
            execute_command(command, *wait_until_completion, working_dir, cancel).await
        }
        OctomusActionType::ReadFiles { file_paths } => {
            read_files(file_paths, working_dir).await
        }
        OctomusActionType::WriteFile { file_path, content } => {
            write_file(file_path, content, working_dir).await
        }
        OctomusActionType::EditFile { file_path, search, replace } => {
            edit_file(file_path, search, replace, working_dir).await
        }
        OctomusActionType::Grep { pattern, path, is_regex } => {
            grep_files(pattern, path.as_deref(), *is_regex, working_dir).await
        }
    };
    
    // Emit event pentru UI
    sink.emit_tool_result(&action.id, &result);
    
    AgentActionResult {
        tool_call_id: action.id.clone(),
        result,
    }
}

/// Execută toate acțiunile secvențial și colectează rezultatele
pub async fn execute_all_actions(
    actions: &[AgentAction],
    working_dir: &Path,
    sink: &AgentEventSink,
    cancel: &AgentCancellation,
) -> Vec<AgentActionResult> {
    let mut results = Vec::with_capacity(actions.len());
    
    for action in actions {
        if cancel.is_cancelled() {
            results.push(AgentActionResult {
                tool_call_id: action.id.clone(),
                result: ActionResult::Cancelled,
            });
            continue;
        }
        
        results.push(execute_action(action, working_dir, sink, cancel).await);
    }
    
    results
}
```

### 6.4 Integrare cu OpenAI Function Calling

```rust
// Adăugare în openai.rs — construiește mesajele de follow-up

fn build_tool_result_messages(
    results: &[AgentActionResult],
) -> Vec<serde_json::Value> {
    results.iter().map(|r| {
        serde_json::json!({
            "role": "tool",
            "tool_call_id": r.tool_call_id,
            "content": match &r.result {
                ActionResult::CommandCompleted { output, exit_code, .. } => {
                    format!("Exit code: {}\n\n{}", 
                        exit_code.map_or("unknown".into(), |c| c.to_string()),
                        output
                    )
                }
                ActionResult::FilesRead { files } => {
                    files.iter()
                        .map(|f| format!("=== {} ===\n{}", f.path, f.content))
                        .collect::<Vec<_>>()
                        .join("\n\n")
                }
                ActionResult::FileWritten { file_path, diff } => {
                    format!("File written: {}\n{}", file_path, 
                        diff.as_deref().unwrap_or("(no diff)"))
                }
                ActionResult::Cancelled => "Action was cancelled by the user.".into(),
                ActionResult::Error(e) => format!("Error: {e}"),
                _ => format!("{:?}", r.result),
            }
        })
    }).collect()
}
```

---

## 7. Ce Avem Deja vs. Ce Trebuie Adăugat

| Funcționalitate | Status Octomus | Ce lipsește |
|---|---|---|
| Parse tool calls din SSE stream | ✅ `openai.rs` | — |
| `propose_terminal_command` tool | ✅ Implementat | — |
| `requires_result` flag | ❌ Nu e implementat | Trebuie adăugat la parsare |
| Follow-up cu `role: tool` messages | ❌ Hardcoded la un singur tool call | Trebuie generalizat |
| Multiple tool calls per response | ❌ Nu e suportat | Trebuie adăugat |
| ReadFiles / WriteFile / EditFile | ❌ Nu există | Trebuie implementat |
| Grep | ❌ Nu există | Trebuie implementat |
| Permission checking (auto-execute) | ❌ Nu există | Opțional inițial |
| Long-running command management | ❌ Nu există | P2 |

---

## 8. Fișiere Warp Relevante

| Fișier | Ce conține |
|---|---|
| [`mod.rs`](file:///Users/adriantucicovenco/Proiecte/warp/app/src/ai/agent/mod.rs#L842-L916) | `AIAgentAction`, `AIAgentActionType`, `requires_result` |
| [`mod.rs`](file:///Users/adriantucicovenco/Proiecte/warp/app/src/ai/agent/mod.rs#L1191-L1226) | `AIAgentActionResult`, `is_rejected()` |
| [`mod.rs`](file:///Users/adriantucicovenco/Proiecte/warp/app/src/ai/agent/mod.rs#L967-L1188) | `MarkdownActionResult` — display formatting |
| [`mod.rs`](file:///Users/adriantucicovenco/Proiecte/warp/app/src/ai/agent/mod.rs#L2480-L2485) | `AIAgentInput::ActionResult` — follow-up input |
| [`convert_from.rs`](file:///Users/adriantucicovenco/Proiecte/warp/app/src/ai/agent/api/convert_from.rs#L621) | Setarea `requires_result: true` |
