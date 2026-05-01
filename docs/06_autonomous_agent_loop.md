# Autonomous Agent Loop (Warp Port)

Acest document descrie modul în care transformăm interfața actuală de chat a Octomus într-un agent autonom capabil de execuție iterativă (Tool-Use Loop).

## 1. De la "Harness" la "Orchestrator"

Sistemul actual Octomus folosește un `AgentHarness` care face o singură cerere la LLM. Pentru autonomie, avem nevoie de un `AgentDriver` (după modelul Warp) care să gestioneze ciclul de viață al unei sarcini.

### Fluxul Iterativ:
1.  **Input**: Promptul utilizatorului + Istoricul conversației.
2.  **LLM Call**: Modelul returnează Text sau unul/mai multe **Tool Calls**.
3.  **Local Execution**: Octomus execută uneltele (ex: `ls`, `cat`, `git status`) local în Tauri.
4.  **Feedback Loop**: Rezultatele uneltelor sunt adăugate în istoricul conversației ca mesaje de tip `tool`.
5.  **Re-evaluare**: LLM-ul primește rezultatele și decide dacă sarcina este gata sau dacă mai are nevoie de alte unelte.

---

## 2. Componente de Implementat (Backend)

### A. `ToolExecutor`
Un modul care mapează numele uneltelor (ex: `propose_terminal_command`, `read_file`) la funcții Rust care interacționează cu sistemul de operare.
*   **Locație sugerată**: `src-tauri/src/ai/tools/`

### B. `AgentLoop`
O mașină de stări care rulează loop-ul iterativ.
```rust
while !status.is_terminal() {
    let output = harness.run_async(context).await?;
    if let Some(tool_calls) = output.tool_calls {
        for call in tool_calls {
            let result = executor.execute(call).await;
            context.add_tool_result(call.id, result);
        }
    } else {
        break; // Răspuns final text
    }
}
```

---

## 3. Integrarea cu Terminalul (Warp-style)

În Warp, agentul nu doar propune comenzi, ci poate citi output-ul terminalului pentru a decide pașii următori.
*   **Context Injection**: Înainte de fiecare pas, injectăm în prompt `CWD` și, opțional, ultimele N linii din output-ul terminalului activ.
*   **Command Proposals**: Pentru siguranță, anumite comenzi (ex: `rm -rf`) vor necesita în continuare confirmarea utilizatorului (via `WaitingForTool` status), în timp ce comenzile de citire (`ls`, `cat`) pot fi auto-aprobate.

---

## 4. Starea Conversației (Persistence)

Conversația trebuie să fie persistentă pentru a permite reluarea după repornirea aplicației.
*   **`Exchange`**: O unitate formată din cererea utilizatorului și toate iterațiile de tool-calls aferente.
*   **SQLite**: Salvarea fiecărui mesaj (role: user/assistant/tool) în baza de date locală.

---

## 5. Roadmap Portare

1.  **Etapa 1**: Implementarea `BashTool` (execuție comenzi) și `FileReadTool`.
2.  **Etapa 2**: Crearea `AgentLoop` în `ai/mod.rs` care să gestioneze iterațiile.
3.  **Etapa 3**: Actualizarea UI-ului (React) pentru a afișa stările intermediare (ex: "Agentul rulează `git status`...") în loc de a aștepta un răspuns final masiv.
