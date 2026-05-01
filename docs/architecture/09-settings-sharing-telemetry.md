# Settings, Session Sharing & Telemetry

> Reverse-engineered din Warp: `settings/` (~600K), `terminal/shared_session/` (~80K),
> `server/telemetry/` (~15K logic + 1.2M events).
> Adaptat pentru Octomus: Tauri v2 + Rust + React.

---

## 1. Settings & Cloud Sync

Warp folosește un sistem hibrid de stocare a configurațiilor: `settings.toml` (editabil manual) și `user_preferences.json` (preferințe binare/UI).

### 1.1 CloudPreferencesSyncer — Arhitectura Sync

Sistemul de sincronizare este conceput să fie robust la conflicte și utilizare offline.

```rust
pub struct CloudPreferencesSyncer {
    dirty_local_prefs: HashSet<String>,      // Prefs modificate local ce așteaptă sync
    has_completed_initial_load: bool,        // Flag pentru prima încărcare (determină cine câștigă)
    force_local_wins_on_startup: bool,       // Dacă userul a editat settings.toml offline
    toml_file_path: PathBuf,
}
```

### 1.2 Algoritmul de Reconciliere (Startup)

1.  **Detectare Divergență**: La pornire, se compară hash-ul curent al `settings.toml` cu hash-ul salvat la ultimul sync reușit (`SettingsFileLastSyncedHash`).
2.  **Conflict Resolution**:
    *   Dacă hash-urile diferă (editare manuală offline) → **Local Wins** (valorile din fișier sunt urcate în cloud).
    *   Dacă sunt identice → **Cloud Wins** (valorile din server suprascriu memoria locală).
3.  **Debouncing**: Modificările UI (ex: mutarea unui slider) sunt grupate (500ms) înainte de a fi trimise către `UpdateManager`.

---

## 2. Session Sharing (Real-time Collaboration)

Warp permite partajarea unui terminal în timp real ("Warp Drive for Teams").

### 2.1 Shared Session Manager

```rust
pub struct Manager {
    shared: HashMap<EntityId, SharedSessionState>, // Sesiuni oferite de acest client
    joined: HashMap<EntityId, SharedSessionState>, // Sesiuni la care suntem spectatori
    ended_session_ids: HashMap<EntityId, SessionId>, // Istoric pentru copy-link
}
```

### 2.2 Fluxul de Partajare

*   **Sharer (Gazda)**:
    1.  Creează un `SessionId` unic prin backend.
    2.  Punctele de intrare din PTY (output buffer) sunt interceptate și transmise prin protocolul de sharing.
    3.  `PresenceManager` urmărește cine s-a conectat (avatare, poziție cursor).
*   **Viewer (Spectatorul)**:
    1.  Join prin URL → se creează o sesiune de tip `WarpifiedRemote`.
    2.  Datele ANSI vin prin rețea (WebSocket/Relay) în loc de un PTY local.
    3.  Interfața randează grid-ul primit ca și cum ar fi un terminal local, dar în mod read-only (implicit).

---

## 3. Telemetry — Observability System

Warp are un sistem de telemetrie extrem de detaliat (RudderStack), separat în UGC (User Generated Content) și evenimente non-sensibile.

### 3.1 TelemetryApi

```rust
pub struct TelemetryApi {
    client: http_client::Client, // Client HTTP custom cu hooks pentru logare
}

impl TelemetryApi {
    // Batches up events and sends to Rudderstack
    pub async fn flush_events(&self, settings: PrivacySettingsSnapshot) -> Result<usize>;
    
    // Persistă evenimentele pe disc dacă app-ul se închide forțat (rudder_telemetry_events.json)
    pub fn flush_and_persist_events(&self, max_count: usize) -> Result<()>;
}
```

### 3.2 Categorii de Date

*   **Non-UGC**: Click-uri pe butoane, erori de bootstrap, versiuni de shell, latență terminal.
*   **UGC (Sensitive)**: Prompt-uri AI, output-uri de comenzi (dacă userul a optat pentru "AI improvements").
    *   *Redacție*: Warp folosește `secret_redaction.rs` pentru a curăța token-uri/parole înainte de trimitere.

---

## 4. GitHub & External Integrations

Nu există un singur modul "GitHub", ci integrări punctuale:

1.  **Auth / OAuth**: Folosit pentru sincronizarea setărilor și accesul la Warp Drive. Token-ul este stocat securizat în Keychain/SecretService.
2.  **Skill Resolution**: `ai/skills/` clonează automat repository-uri de pe GitHub (`git@github.com:...`) pentru a încărca definiții de agenți.
3.  **Context Chips**: Parser de URL-uri care transformă link-uri de PR/Issue în obiecte interactive în input.
4.  **PR Reviews**: Integrare cu `gh` CLI pentru a lista și comenta pe pull requests direct din terminal.

---

## 5. Octomus Adaptation (Tauri v2)

### 5.1 Settings System (Rust)

```rust
// src-tauri/src/settings/mod.rs

#[derive(Serialize, Deserialize, Clone)]
pub struct OctomusSettings {
    pub theme: String,
    pub font_size: u32,
    pub ai_provider: String,
    pub telemetry_enabled: bool,
    // ...
}

pub struct SettingsManager {
    current: OctomusSettings,
    path: PathBuf,
}

impl SettingsManager {
    pub fn load() -> Self;
    pub fn save(&self);
    pub fn sync_with_cloud(&mut self); // Implementare similară cu hash-ul din Warp
}
```

### 5.2 Telemetry (Tauri)

Vom folosi un sistem similar de batching pentru a nu încărca procesul principal:

```rust
// src-tauri/src/telemetry/mod.rs

pub enum OctomusEvent {
    SpotlightOpened,
    CommandExecuted { cmd: String, exit_code: i32 },
    AIQueryStarted { provider: String },
    Error { code: String, message: String },
}

pub fn track_event(event: OctomusEvent) {
    // Adaugă într-o coadă (Vec) în memorie
    // La fiecare 60s sau 50 de evenimente, trimite batch-ul (reqwest)
}
```

### 5.3 Privacy by Design

Octomus ar trebui să permită:
1.  **Zero-Telemetry Mode**: Oprire completă a oricărui outbound request de tracking.
2.  **Local-Only Mode**: Niciun sync de setări în cloud, totul salvat într-un SQLite local.
3.  **Redaction Pipeline**: Filtru în Rust care scanează orice trimite telemetria pentru pattern-uri de API keys (regex based).
