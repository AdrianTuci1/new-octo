# Event Streaming, Retry & Reconnection Patterns

> **Context:** Documentație extrasă din `warp/app/src/ai/` pentru implementarea în Octomus Launcher.  
> **Data:** 2026-05-02

---

## 1. Cele Trei Nivele de Reziliență din Warp

Warp implementează **3 mecanisme distincte** pentru a asigura că agentul funcționează robust:

```
Nivel 1: RETRY — Bounded Exponential Backoff
  └── retry.rs — max 3 încercări, 500ms → 1s → 2s cu jitter
  └── Folosit pentru: snapshot upload, HTTP requests one-shot

Nivel 2: RECONNECT — SSE Stream Reconnection
  └── agent_events/driver.rs — loop infinit cu backoff crescător
  └── Folosit pentru: event streams de la server
  └── Proactive reconnect la 14 minute (înainte de Cloud Run timeout)

Nivel 3: RESUME — Conversation Resume After Error
  └── conversation.rs — error.will_attempt_resume()
  └── AgentDriver — AUTO_RESUME_TIMEOUT (30s) wait
  └── Folosit pentru: erori de rețea în mijlocul conversației
```

---

## 2. Nivel 1: Bounded Exponential Backoff (retry.rs)

### 2.1 Codul Original Warp

**Fișier:** [`warp/app/src/ai/agent_sdk/retry.rs`](file:///Users/adriantucicovenco/Proiecte/warp/app/src/ai/agent_sdk/retry.rs)

```rust
// Constante
const MAX_ATTEMPTS: usize = 3;
const INITIAL_BACKOFF: Duration = Duration::from_millis(500);
const BACKOFF_FACTOR: f32 = 2.0;
const BACKOFF_JITTER: f32 = 0.3;

// Funcția principală
pub async fn with_bounded_retry<T, F, Fut>(
    operation: &str,
    mut attempt_fn: F,
) -> Result<T>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<T>>,
{
    let mut delay = INITIAL_BACKOFF;
    for attempt in 1..=MAX_ATTEMPTS {
        match attempt_fn().await {
            Ok(value) => return Ok(value),
            // Eroare permanentă SAU ultimul attempt → return error
            Err(e) if attempt >= MAX_ATTEMPTS || !is_transient_http_error(&e) => return Err(e),
            // Eroare tranzientă → retry
            Err(e) => {
                log::warn!("{operation}: attempt {attempt}/{MAX_ATTEMPTS} failed: {e:#}");
                Timer::after(duration_with_jitter(delay, BACKOFF_JITTER)).await;
                delay = delay.mul_f32(BACKOFF_FACTOR);
            }
        }
    }
    unreachable!()
}
```

### 2.2 Timeline de Retry

```
Attempt 1 ────── FAIL (transient)
    │
    ├── wait: 500ms ± 150ms (jitter 30%)
    │
Attempt 2 ────── FAIL (transient)
    │
    ├── wait: 1000ms ± 300ms
    │
Attempt 3 ────── FAIL
    │
    └── Return Error (nu mai reîncearcă)
```

### 2.3 Ce Face `is_transient_http_error`

```rust
pub fn is_transient_http_error(err: &anyhow::Error) -> bool {
    // Verifică dacă eroarea e:
    // - Connection refused/timeout
    // - 429 Too Many Requests
    // - 500, 502, 503, 504 Server Error
    // - DNS resolution failure
    // 
    // NU sunt transiente:
    // - 400 Bad Request
    // - 401 Unauthorized
    // - 403 Forbidden
    // - 404 Not Found
    // - Orice eroare de parsare
}
```

### 2.4 Portare pentru Octomus

```rust
// src-tauri/src/ai/retry.rs

use std::future::Future;
use std::time::Duration;
use rand::Rng;

pub const MAX_ATTEMPTS: usize = 3;
pub const INITIAL_BACKOFF: Duration = Duration::from_millis(500);
pub const BACKOFF_FACTOR: f32 = 2.0;
pub const BACKOFF_JITTER: f32 = 0.3;

/// Adaugă jitter uniform pe un Duration
pub fn duration_with_jitter(base: Duration, jitter_fraction: f32) -> Duration {
    let mut rng = rand::thread_rng();
    let jitter = base.mul_f32(jitter_fraction);
    let offset = rng.gen_range(Duration::ZERO..=jitter);
    // 50% chance to add or subtract
    if rng.gen_bool(0.5) {
        base + offset
    } else {
        base.saturating_sub(offset)
    }
}

/// Verifică dacă o eroare reqwest e tranzientă
pub fn is_transient_error(err: &anyhow::Error) -> bool {
    if let Some(reqwest_err) = err.downcast_ref::<reqwest::Error>() {
        if reqwest_err.is_timeout() || reqwest_err.is_connect() {
            return true;
        }
        if let Some(status) = reqwest_err.status() {
            return matches!(
                status.as_u16(),
                429 | 500 | 502 | 503 | 504
            );
        }
    }
    false
}

/// Retry cu bounded exponential backoff
/// Adaptare directă din Warp: Timer → tokio::time::sleep
pub async fn with_bounded_retry<T, F, Fut>(
    operation: &str,
    mut attempt_fn: F,
) -> anyhow::Result<T>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = anyhow::Result<T>>,
{
    let mut delay = INITIAL_BACKOFF;
    for attempt in 1..=MAX_ATTEMPTS {
        match attempt_fn().await {
            Ok(value) => return Ok(value),
            Err(e) if attempt >= MAX_ATTEMPTS || !is_transient_error(&e) => return Err(e),
            Err(e) => {
                log::warn!("{operation}: attempt {attempt}/{MAX_ATTEMPTS} failed: {e:#}");
                tokio::time::sleep(duration_with_jitter(delay, BACKOFF_JITTER)).await;
                delay = delay.mul_f32(BACKOFF_FACTOR);
            }
        }
    }
    anyhow::bail!("retry loop exhausted (MAX_ATTEMPTS={MAX_ATTEMPTS})")
}
```

---

## 3. Nivel 2: SSE Reconnecting Event Driver

### 3.1 Arhitectura

**Fișier:** [`warp/app/src/ai/agent_events/driver.rs`](file:///Users/adriantucicovenco/Proiecte/warp/app/src/ai/agent_events/driver.rs)

```
┌─── AgentEventDriver ──────────────────────────────────┐
│                                                        │
│  Config:                                               │
│    run_ids: ["run_123"]                               │
│    since_sequence: 0                                   │
│    reconnect_backoff_steps: [1, 2, 5, 10] (secunde)   │
│    proactive_reconnect_after: 14 minute               │
│    failures_before_error_log: 5                        │
│                                                        │
│  ┌─── OUTER LOOP (infinit) ────────────────────────┐  │
│  │                                                  │  │
│  │  source.open_stream(run_ids, since_sequence)    │  │
│  │                                                  │  │
│  │  ┌─── INNER LOOP ──────────────────────────┐    │  │
│  │  │                                          │    │  │
│  │  │  Select:                                 │    │  │
│  │  │    stream.next() vs reconnect_timer      │    │  │
│  │  │                                          │    │  │
│  │  │  ├── Open → reset failures, Connected   │    │  │
│  │  │  ├── Event → consumer.on_event()         │    │  │
│  │  │  │          update since_sequence        │    │  │
│  │  │  │          persist_cursor()             │    │  │
│  │  │  ├── Error → failures++, backoff, break │    │  │
│  │  │  ├── None → stream closed, backoff, break│    │  │
│  │  │  └── Timer → ProactiveReconnect, break  │    │  │
│  │  │                                          │    │  │
│  │  └──────────────────────────────────────────┘    │  │
│  │                                                  │  │
│  │  Backoff: [1s, 2s, 5s, 10s, 10s, 10s, ...]     │  │
│  │                                                  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### 3.2 Codul Cheie

```rust
pub async fn run_agent_event_driver<S, C>(
    source: S,
    config: AgentEventDriverConfig,
    consumer: &mut C,
) -> Result<()>
where
    S: AgentEventSource,
    C: AgentEventConsumer,
{
    let mut since_sequence = config.since_sequence;
    let mut failures = 0usize;

    loop {
        // ═══ OPEN STREAM ═══
        let mut stream = match source.open_stream(&config.run_ids, since_sequence).await {
            Ok(stream) => stream,
            Err(err) => {
                failures += 1;
                let backoff = agent_event_backoff(failures, config.reconnect_backoff_steps);
                Timer::after(backoff).await;
                continue;  // ← retry outer loop
            }
        };

        // ═══ PROACTIVE RECONNECT DEADLINE ═══
        let deadline = config.proactive_reconnect_after
            .map(|d| Instant::now() + d);

        // ═══ INNER LOOP ═══
        loop {
            let next_item = if let Some(deadline) = deadline {
                let remaining = deadline.saturating_duration_since(Instant::now());
                if remaining.is_zero() {
                    NextDriverItem::ProactiveReconnect
                } else {
                    // Race: stream event vs timer
                    select(stream.next(), Timer::after(remaining))
                }
            } else {
                NextDriverItem::StreamItem(stream.next().await)
            };

            match next_item {
                // Timer expirat → reconectare proactivă
                ProactiveReconnect => break,

                // Stream opened → reset failures
                StreamItem(Some(Ok(Open))) => {
                    failures = 0;
                    consumer.on_driver_state(Connected).await;
                }

                // Event primit → procesare
                StreamItem(Some(Ok(Event(event)))) => {
                    failures = 0;
                    if event.sequence <= since_sequence { continue; }

                    let control_flow = consumer.on_event(event).await?;
                    since_sequence = event.sequence;
                    consumer.persist_cursor(since_sequence).await;

                    if control_flow == Stop { return Ok(()); }
                }

                // Eroare → backoff + reconnect
                StreamItem(Some(Err(err))) | StreamItem(None) => {
                    failures += 1;
                    let backoff = agent_event_backoff(failures, ...);
                    Timer::after(backoff).await;
                    break;  // ← retry outer loop
                }
            }
        }
    }
}
```

### 3.3 Backoff Escalonant

```rust
fn agent_event_backoff(failures: usize, steps: &[u64]) -> Duration {
    // steps = [1, 2, 5, 10]
    let index = failures.saturating_sub(1).min(steps.len() - 1);
    Duration::from_secs(steps[index])
}

// Rezultat:
//   failure 1 → 1s
//   failure 2 → 2s
//   failure 3 → 5s
//   failure 4+ → 10s (cap)
```

### 3.4 Proactive Reconnect: De Ce?

Cloud Run (și alte platforme) au un **timeout de streaming** (tipic 20 min). Warp reconectează **proactiv** la 14 minute pentru a evita o deconectare bruscă:

```
t=0min   ────── stream open ──────────────────────── t=14min
                                                       │
                                                       └── ProactiveReconnect
                                                            │
t=14min  ────── new stream open ─────────────────── t=28min
                                                       │
                                                       └── ProactiveReconnect
```

### 3.5 Portare pentru Octomus

```rust
// src-tauri/src/ai/event_driver.rs

use std::time::{Duration, Instant};
use anyhow::Result;
use futures::StreamExt;

/// Backoff steps (secunde)
pub const RECONNECT_BACKOFF_STEPS: &[u64] = &[1, 2, 5, 10];

/// Reconectare proactivă înainte de timeout
pub const PROACTIVE_RECONNECT_AFTER: Duration = Duration::from_secs(14 * 60);

/// Erori consecutive înainte de log::error
pub const FAILURES_BEFORE_ERROR_LOG: usize = 5;

/// Starea driver-ului
#[derive(Debug, Clone)]
pub enum DriverState {
    Connected,
    Reconnecting { failures: usize, backoff: Duration },
    ProactiveReconnect,
}

/// Trait pentru sursa de evenimente
#[async_trait::async_trait]
pub trait EventSource: Send + Sync {
    type Event: Send;
    type Stream: futures::Stream<Item = Result<Self::Event>> + Unpin + Send;
    
    async fn open_stream(&self, since_sequence: i64) -> Result<Self::Stream>;
}

/// Trait pentru consumatorul de evenimente
#[async_trait::async_trait]
pub trait EventConsumer: Send {
    type Event: Send;
    
    /// Procesează un eveniment. Returnează false pentru a opri driver-ul.
    async fn on_event(&mut self, event: Self::Event) -> Result<bool>;
    
    /// Notificare despre starea driver-ului (opțional)
    async fn on_state_change(&mut self, _state: DriverState) {}
}

/// Driver de evenimente cu reconnect automat
pub async fn run_event_driver<S, C>(
    source: S,
    consumer: &mut C,
    mut since_sequence: i64,
) -> Result<()>
where
    S: EventSource<Event = C::Event>,
    C: EventConsumer,
{
    let mut failures: usize = 0;

    loop {
        // Deschide stream-ul
        let stream = match source.open_stream(since_sequence).await {
            Ok(s) => s,
            Err(err) => {
                failures += 1;
                let backoff = compute_backoff(failures);
                log_failure(failures, &backoff, &err);
                consumer.on_state_change(DriverState::Reconnecting { failures, backoff }).await;
                tokio::time::sleep(backoff).await;
                continue;
            }
        };

        failures = 0;
        consumer.on_state_change(DriverState::Connected).await;

        let deadline = Instant::now() + PROACTIVE_RECONNECT_AFTER;
        let mut stream = Box::pin(stream);

        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                consumer.on_state_change(DriverState::ProactiveReconnect).await;
                break; // Reconectare proactivă
            }

            // Race: next event vs timer
            let next = tokio::select! {
                item = stream.next() => item,
                _ = tokio::time::sleep(remaining) => {
                    consumer.on_state_change(DriverState::ProactiveReconnect).await;
                    break;
                }
            };

            match next {
                Some(Ok(event)) => {
                    let should_continue = consumer.on_event(event).await?;
                    if !should_continue {
                        return Ok(());
                    }
                }
                Some(Err(err)) => {
                    failures += 1;
                    let backoff = compute_backoff(failures);
                    log_failure(failures, &backoff, &err);
                    consumer.on_state_change(DriverState::Reconnecting { failures, backoff }).await;
                    tokio::time::sleep(backoff).await;
                    break;
                }
                None => {
                    // Stream s-a închis
                    failures += 1;
                    let backoff = compute_backoff(failures);
                    log::warn!("Event stream closed, reconnecting in {backoff:?}");
                    consumer.on_state_change(DriverState::Reconnecting { failures, backoff }).await;
                    tokio::time::sleep(backoff).await;
                    break;
                }
            }
        }
    }
}

fn compute_backoff(failures: usize) -> Duration {
    let index = failures.saturating_sub(1).min(RECONNECT_BACKOFF_STEPS.len() - 1);
    Duration::from_secs(RECONNECT_BACKOFF_STEPS[index])
}

fn log_failure(failures: usize, backoff: &Duration, err: &anyhow::Error) {
    if failures >= FAILURES_BEFORE_ERROR_LOG {
        log::error!("Event stream failed {failures} times, retrying in {backoff:?}: {err:#}");
    } else {
        log::warn!("Event stream failed, retrying in {backoff:?}: {err:#}");
    }
}
```

---

## 4. Nivel 3: Conversation Resume After Error

### 4.1 Mecanismul

Când un request eșuează în mijlocul conversației, Warp poate face **auto-resume**:

```rust
// conversation.rs
pub fn mark_request_completed_with_error(
    &mut self,
    error: RenderableAIError,
    // ...
) {
    // Marchează exchange-ul ca Error
    exchange.output_status = Finished {
        finished_output: FinishedAIAgentOutput::Error {
            output: partial_output,
            error: error.clone(),
        }
    };
    
    // Actualizează status-ul conversației
    self.update_status(ConversationStatus::Error, ...);
}
```

```rust
// driver.rs — AgentDriver monitorizează
AmbientConversationStatus::Error { error } => {
    if error.will_attempt_resume() {
        // ⭐ NU se oprește imediat!
        // Dă timeout de 30s pentru retry automat
        run_exit.end_run_after(AUTO_RESUME_TIMEOUT, output_status);
        return;
    }
    // Eroare fatală → oprire imediată
    run_exit.end_run_now(output_status);
}
```

### 4.2 Ce Înseamnă `will_attempt_resume()`

```rust
pub enum RenderableAIError {
    Other {
        message: String,
        will_attempt_resume: bool,  // ← Serverul setează asta
    },
    RateLimited { retry_after: Duration },
    // etc.
}

impl RenderableAIError {
    pub fn will_attempt_resume(&self) -> bool {
        matches!(self, Self::Other { will_attempt_resume: true, .. })
    }
}
```

### 4.3 Flow-ul de Resume

```
Exchange 5: UserQuery → Server
  │
  ├── Stream response: partial text + tool call
  │
  ├── ⚡ EROARE DE REȚEA ⚡
  │
  ├── mark_request_completed_with_error(error { will_attempt_resume: true })
  │
  ├── ConversationStatus → Error
  │
  ├── AgentDriver primește UpdatedConversationStatus
  │     └── error.will_attempt_resume() == true
  │         └── end_run_after(AUTO_RESUME_TIMEOUT = 30s)
  │             └── Timer-ul de 30s pornește
  │
  ├── ═══ MEANWHILE: Server-side retry ═══
  │     Controller-ul face retry automat
  │     Trimite un nou request cu ResumeConversation
  │
  ├── ConversationStatus → InProgress (din nou!)
  │     └── AgentDriver primește UpdatedConversationStatus
  │         └── status.is_in_progress() → cancel_idle_timeout()
  │             └── Timer-ul de 30s se anulează ✅
  │
  └── Conversația continuă normal
```

---

## 5. Pattern: IdleTimeoutSender (Timer Cancel Fără Handle-uri)

### 5.1 Problema

Cum anulezi un timer **fără** să stochezi un `JoinHandle`?

### 5.2 Soluția Warp: Generation Counter

**Fișier:** `warp/app/src/ai/agent_sdk/driver.rs`

```rust
struct IdleTimeoutSender<T: Send> {
    tx_cell: Arc<Mutex<Option<oneshot::Sender<T>>>>,
    generation: Arc<AtomicUsize>,
}

impl<T: Send + 'static> IdleTimeoutSender<T> {
    /// Trimite rezultatul ACUM
    fn end_run_now(&self, value: T) {
        if let Some(tx) = self.tx_cell.lock().take() {
            let _ = tx.send(value);
        }
    }
    
    /// Trimite rezultatul DUPĂ un delay
    fn end_run_after(&self, timeout: Duration, value: T) {
        // Incrementează generația
        let gen = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let tx_cell = self.tx_cell.clone();
        let generation = self.generation.clone();
        
        // Spawn timer
        tokio::spawn(async move {
            tokio::time::sleep(timeout).await;
            // ⭐ Verifică dacă generația s-a schimbat
            if generation.load(Ordering::SeqCst) == gen {
                // Nu s-a anulat → trimite
                if let Some(tx) = tx_cell.lock().take() {
                    let _ = tx.send(value);
                }
            }
            // Dacă generația e diferită, timer-ul e stale → ignore
        });
    }
    
    /// Anulează orice timer pending (prin incrementarea generației)
    fn cancel_idle_timeout(&self) {
        self.generation.fetch_add(1, Ordering::SeqCst);
    }
}
```

### 5.3 De Ce E Elegant

1. **Nu stochezi JoinHandle** — nu trebuie `abort()`
2. **Lock-free cancel** — doar un `fetch_add` atomic
3. **Idempotent** — poți apela `cancel_idle_timeout()` de câte ori vrei
4. **Nici un leak** — timer-ul expiră dar nu face nimic

---

## 6. Sumar: Ce Trebuie Implementat în Octomus

### Prioritate P0 (Imediat)

| Modul | Sursă | Efort |
|---|---|---|
| `retry.rs` | Port direct din Warp | 30 min |
| `is_transient_error()` | Adaptare pe reqwest | 15 min |
| `duration_with_jitter()` | Implementare locală | 10 min |

### Prioritate P1 (Săptămâna viitoare)

| Modul | Sursă | Efort |
|---|---|---|
| `event_driver.rs` | Port din Warp (simplificat) | 2-3 ore |
| `IdleTimeoutSender` | Port direct | 30 min |

### Prioritate P2 (Viitor)

| Modul | Sursă | Efort |
|---|---|---|
| Auto-resume conversation | Adapt din conversation.rs | 1-2 ore |
| Proactive reconnect | Inclus în event_driver | — |

---

## 7. Fișiere Warp Relevante

| Fișier | Ce conține | Linii |
|---|---|---|
| [`retry.rs`](file:///Users/adriantucicovenco/Proiecte/warp/app/src/ai/agent_sdk/retry.rs) | `with_bounded_retry()` — copiabil direct | 1-64 |
| [`driver.rs`](file:///Users/adriantucicovenco/Proiecte/warp/app/src/ai/agent_events/driver.rs) | `run_agent_event_driver()` — reconnecting loop | 1-369 |
| [`driver.rs`](file:///Users/adriantucicovenco/Proiecte/warp/app/src/ai/agent_sdk/driver.rs#L1861-L1914) | `UpdatedConversationStatus` — resume logic | L1861-1914 |
| [`driver.rs`](file:///Users/adriantucicovenco/Proiecte/warp/app/src/ai/agent_sdk/driver.rs#L1700-L1710) | `IdleTimeoutSender` — generation-based cancel | L1700-1710 |
