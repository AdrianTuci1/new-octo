# Agent Tips & Predict (Warp Port)

Documentul de față analizează două sisteme critice din Warp care îmbunătățesc experiența utilizatorului prin proactivitate: **Agent Tips** (educare) și **Predict** (anticipare).

## 1. Agent Tips (`agent_tips.rs`)

Sistemul de Tips este conceput să ofere sugestii scurte și utile în chat, ajutând utilizatorii să descopere funcționalități avansate.

### Arhitectura:
*   **`AgentTip`**: O structură care conține descrierea, un link către documentație, numele unei acțiuni (pentru keybinding) și o categorie (`General`, `Mcp`, `Code`, etc.).
*   **`AITip` Trait**: Definește comportamentul standard pentru orice tip (formatare text, extragere keybinding).
*   **Filtrare Contextuală (`is_tip_applicable`)**:
    *   Sistemul verifică dacă un tip este relevant în contextul curent.
    *   *Exemplu*: Tipul care recomandă `/init` pentru indexare apare doar dacă `CodebaseIndexManager` confirmă că directorul curent **nu** este indexat.

### Logica de Afișare (`AITipModel`):
*   **Selecție**: Alege un tip aleatoriu din lista celor aplicabile.
*   **Cooldown**: Implementează o perioadă de așteptare de **60 de secunde** între afișările de tips pentru a evita oboseala utilizatorului.
*   **Keybinding Injection**: Înlocuiește automat `<keybinding>` în text cu tasta reală configurată în setările Warp (ex: `Cmd+P`).

---

## 2. Predict & Intelligent Autosuggestions (`ai/predict/`)

Sistemul Predict încearcă să anticipeze următoarea comandă sau întrebare a utilizatorului.

### A. Colectarea Contextului (`generate_ai_input_suggestions.rs`)
Pentru a genera sugestii inteligente, Warp trimite către LLM un context bogat:
*   **`ContextMessageInput`**: Ultimele 5 blocuri de terminal (de obicei).
    *   Include: Input-ul utilizatorului, Output-ul comenzii (trunchiat inteligent), PWD, Git Branch și Exit Code.
    *   *Trunchiere*: Se păstrează doar primele N linii și ultimele M linii din output pentru a rămâne în limitele de tokeni ale modelului.
*   **`HistoryContext`**: Fragmente din istoricul de comenzi care se potrivesc cu pattern-ul curent.

### B. Modelul de Predicție a Comenzii Următoare (`next_command_model.rs`)
Acesta gestionează ceea ce Warp numește "Zero-state suggestions" (sugestii care apar imediat ce o comandă s-a terminat, înainte ca utilizatorul să tasteze).

#### Logica Hibridă (Istoric vs. AI):
1.  **Căutare în Istoric**: Sistemul caută în baza de date locală (SQLite) comenzi rulate anterior după pattern-ul curent.
2.  **Threshold de Încredere**: Dacă o comandă din istoric are o probabilitate mare (ex: >25%) și s-a repetat de minim 2 ori, Warp o oferă ca sugestie **instant**, sărind peste apelul la LLM.
3.  **Fallback la AI**: Dacă istoricul nu este concludent, se face o cerere asincronă la server/LLM.

#### Validare Locală (`is_command_valid`):
Un aspect crucial este validarea sugestiilor înainte de afișare:
*   **Existenta Fișierelor**: Dacă sugestia este `cat README.md`, sistemul verifică local dacă `README.md` există în PWD. Dacă nu există, sugestia este respinsă.
*   **Parsing Command**: Folosește specificațiile de completare (Completion Specs) pentru a verifica dacă structura comenzii este corectă.

---

## 3. Recomandări pentru Octomus

1.  **Tips Simple**: Implementarea unui sistem similar de `AgentTips` în React este facilă și oferă un sentiment de "premium" aplicației.
2.  **Context Injection**: Octomus ar trebui să colecteze `exit_code` și `pwd` după fiecare execuție de comandă pentru a le trimite ca context în următorul prompt către LLM.
3.  **Validare Proactivă**: Înainte de a afișa o propunere de comandă de la agent, Octomus ar putea verifica local dacă argumentele (fișiere/foldere) sunt valide, reducând erorile de tip "file not found".
