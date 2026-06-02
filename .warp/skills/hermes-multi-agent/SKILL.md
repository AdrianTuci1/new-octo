---
name: hermes-multi-agent
description: Orchestreaza refactorizari complexe prin delegarea la 5 agenti Hermes in paralel - domain models, services, store slices, view models, si extract components. Foloseste acest skill cand utilizatorul vrea sa refactorizeze un monolit React/Zustand cu OOP SOLID, sau cand vrea sa lanseze mai multi agenti hermes in paralel pe acelasi repo. BUN de folosit cand codul e mare, cu multe props si hook-uri monolitice.
---

# Hermes Multi-Agent Orchestrator

Orchestreaza refactorizari complexe prin lansarea a pana la 5 agenti Hermes in paralel pe Modal, fiecare in sandbox propriu cu clone din GitHub.

## Overview

Orchestratorul ruleaza local (detached). Fiecare subagent primeste un sandbox Modal proaspat (lifetime 3600s), cloneaza repo-ul cu GITHUB_TOKEN auto-pasat, lucreaza pe branch-ul `hermes/*-refactor`, commit + push. Orchestratorul face git fetch + merge local la final.

## Cand sa folosesti

- Refactorizarea unui monolit React cu multi hooks si props pasate
- Impartirea unei componente mari in sub-componente, servicii, view-models, domain models
- Aplicarea principiilor SOLID prin separarea logicii de business de view
- Orice task unde 4-5 agenti paraleli ar reduce timpul semnificativ

## Workflow

### Pasul 0: CRITICAL - Configureaza Hermes pentru Modal cu lifetime corect

Problema reala nu e Modal-ul in sine, ci **`terminal.lifetime_seconds: 300`** (default 5 min) care distruge sandbox-ul inainte sa termine de scris fisiere. Configuratia corecta:

```bash
hermes config set terminal.backend modal
hermes config set terminal.timeout 1800
hermes config set terminal.lifetime_seconds 3600

# Verifica
hermes config show
# Trebuie sa arate: Backend: modal, Timeout: 1800s
# Verifica in config.yaml: lifetime_seconds: 3600
```

**De ce functioneaza**: `env_passthrough` include deja `GITHUB_TOKEN`, deci nu trebuie pasat manual. Cu `-t terminal,file` (fara computer_use/browser) sandbox-ul e stabil.

### Pasul 1: Asigura-te ca branch-ul curent e pe remote

```bash
git push -u origin $(git branch --show-current)
```

Orchestratorul face merge din remote, deci branch-ul de baza trebuie sa existe acolo.

### Pasul 2: Creeaza prompt-urile pentru agenti

Salveaza prompt-urile in `.hermes-prompts/`. Fiecare prompt trebuie sa includa clone (sandbox-urile nu au repo-ul local):

```
GITHUB_TOKEN will be auto-passed via env_passthrough.

\`\`\`bash
git clone https://oauth2:${GITHUB_TOKEN}@github.com/OWNER/REPO.git /tmp/repo
cd /tmp/repo
git checkout BASE_BRANCH
git checkout -b hermes/TASK-NAME
\`\`\`

... TASK DESCRIPTION ...

After done:
git add ...
git commit -m "..."
git push origin hermes/TASK-NAME
```

Agentii tipici pentru un refactor SOLID:

| Agent | Prompt file | Ce face |
|-------|------------|---------|
| domain-models | prompt-domain-models.txt | Clase OOP pure (WorkspaceTab, PaneLayout, TerminalSession...) |
| services-layer | prompt-services-layer.txt | Service classes cu AppWindowStoreApi in constructor |
| store-slices | prompt-store-slices.txt | Restructureaza Zustand store in slices |
| view-models | prompt-view-models.txt | Clase view-model pure TS (fara hooks) |
| components-cleanup | prompt-components-cleanup.txt | Extrage componente inline din AppWindow |

### Pasul 3: Arhitectura: orchestrator local (detached) + subagentii pe Modal

```
Terminal local → nohup bash orchestrator.sh (detached, supravietuieste inchiderii terminalului)
                     → hermes chat -q -t terminal,file subagent 1 (Modal, 3600s lifetime) ⎤
                     → hermes chat -q -t terminal,file subagent 2 (Modal, 3600s lifetime) ⎥ paralel (batch 1)
                     → hermes chat -q -t terminal,file subagent 3 (Modal, 3600s lifetime) ⎦
                     → asteapta batch 1
                     → hermes chat -q -t terminal,file subagent 4 (Modal, 3600s lifetime) ⎤
                     → hermes chat -q -t terminal,file subagent 5 (Modal, 3600s lifetime) ⎦ paralel (batch 2)
                     → git fetch + merge local
                     → git push origin refactor/appwindow-solid
```

**Orchestratorul e un script bash local** lansat cu `nohup` + `disown`. El:
1. Lanseaza subagentii in batch-uri paralele pe Modal cu `-t terminal,file` (fara browser/computer_use)
2. GITHUB_TOKEN e auto-pasat via `env_passthrough`
3. Fiecare subagent primeste sandbox propriu cu lifetime 3600s
4. Asteapta batch-urile, face git fetch + merge local, push

### Pasul 3a: Creeaza script-ul orchestrator local

Salveaza in `scripts/orchestrator.sh`:

```bash
#!/bin/bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BASE_BRANCH="refactor/appwindow-solid"
PROMPTS_DIR="$REPO_DIR/.hermes-prompts"
LOGS_DIR="$REPO_DIR/.hermes-logs"

mkdir -p "$LOGS_DIR"

echo "=== Orchestrator started at $(date) ==="
cd "$REPO_DIR"

launch_subagent() {
  local name="$1"
  local prompt_file="$2"
  local log_file="$LOGS_DIR/$name.log"
  local pid_file="$LOGS_DIR/$name.pid"
  local msg="[$(date '+%H:%M:%S')] Launching $name on Modal (lifetime=3600s, tools=terminal,file)..."
  echo "$msg" | tee "$log_file" > /dev/null
  hermes chat -q "$(cat "$prompt_file")" -t terminal,file --yolo >> "$log_file" 2>&1 &
  local child_pid=$!
  echo $child_pid > "$pid_file"
  echo "$msg (PID=$child_pid)" >> "$LOGS_DIR/orchestrator.log"
}

wait_for_pids() {
  local names=("$@")
  for name in "${names[@]}"; do
    local pid_file="$LOGS_DIR/$name.pid"
    if [ ! -f "$pid_file" ]; then
      echo "[$(date '+%H:%M:%S')] $name: no pid file - skipping" | tee -a "$LOGS_DIR/orchestrator.log"
      continue
    fi
    local pid=$(cat "$pid_file")
    echo "[$(date '+%H:%M:%S')] Waiting for $name (PID=$pid)..." | tee -a "$LOGS_DIR/orchestrator.log"
    wait "$pid" 2>/dev/null
    local ec=$?
    echo "[$(date '+%H:%M:%S')] $name finished (exit=$ec)" | tee -a "$LOGS_DIR/orchestrator.log"
    rm -f "$pid_file"
  done
}

# Batch 1: 3 subagents in parallel
launch_subagent "domain-models" "$PROMPTS_DIR/prompt-domain-models.txt"
launch_subagent "services-layer" "$PROMPTS_DIR/prompt-services-layer.txt"
launch_subagent "store-slices" "$PROMPTS_DIR/prompt-store-slices.txt"
wait_for_pids "domain-models" "services-layer" "store-slices"

# Batch 2: 2 subagents in parallel
launch_subagent "view-models" "$PROMPTS_DIR/prompt-view-models.txt"
launch_subagent "components-cleanup" "$PROMPTS_DIR/prompt-components-cleanup.txt"
wait_for_pids "view-models" "components-cleanup"

cd "$REPO_DIR"
echo "=== All subagents finished. Starting merge... ==="

git fetch origin

BRANCHES=(
  "hermes/domain-models-refactor"
  "hermes/services-layer-refactor"
  "hermes/store-slices-refactor"
  "hermes/view-models-refactor"
  "hermes/components-cleanup-refactor"
)

for branch in "${BRANCHES[@]}"; do
  echo "--- Merging $branch ---"
  if git merge --no-edit "origin/$branch" 2>&1; then
    echo "Merged $branch cleanly"
  else
    echo "CONFLICT in $branch - resolving with --theirs..."
    git diff --name-only --diff-filter=U | while read f; do
      git checkout --theirs "$f" 2>/dev/null || true
    done
    git add .
    git commit -m "merge: resolve conflicts from $branch" 2>/dev/null || true
  fi
done

echo "=== Pushing merged result ==="
git push origin "$BASE_BRANCH"
echo "=== DONE at $(date) ==="
```

### Pasul 3b: Lansare orchestrator local detached

```bash
# Opreste procese vechi
pkill -f orchestrator.sh 2>/dev/null || true

# Curata log-uri vechi
rm -rf .hermes-logs && mkdir -p .hermes-logs

# Lanseaza in background, supravietuieste inchiderii terminalului
nohup bash scripts/orchestrator.sh > .hermes-logs/orchestrator.log 2>&1 &
ORCH_PID=$!
disown %1
echo "Orchestrator PID=$ORCH_PID - poti inchide terminalul"
```

### Pasul 4: Monitorizare

```bash
# Vezi progresul
tail -f .hermes-logs/orchestrator.log

# Verifica daca au aparut branch-uri
git ls-remote origin | grep hermes
```

### Pasul 5: Pull rezultatul

Dupa ce orchestratorul a terminat:

```bash
git pull origin refactor/appwindow-solid
```

### Pasul 6: Curatenie

```bash
git push origin --delete hermes/domain-models-refactor hermes/services-layer-refactor hermes/store-slices-refactor hermes/view-models-refactor hermes/components-cleanup-refactor
git branch | grep hermes | xargs git branch -D 2>/dev/null
```

## Cerinte

- `hermes config set terminal.backend modal`
- `hermes config set terminal.timeout 1800`
- `hermes config set terminal.lifetime_seconds 3600` **← CRITICIIAL**: default 300s distruge sandbox-ul
- `GITHUB_TOKEN` in `env_passthrough` (verifica in `config.yaml`: `terminal.env_passthrough`)
- Branch-ul de baza trebuie sa existe pe remote
- Hermes CLI instalat (`which hermes`)

## Anti-patterns (LECTII INVATATE)

1. **`lifetime_seconds: 300` e cauza reala a degradarii.** Nu Modal-ul in sine, ci lifetime-ul default de 5 minute distruge sandbox-ul inainte sa termine. Solutia: `hermes config set terminal.lifetime_seconds 3600`.

2. **Timeout-ul de 180s omoara subagentii.** Solutia: `hermes config set terminal.timeout 1800`.

3. **NU folosi `-t` cu computer_use/browser pe Modal.** Consuma resurse si destabilizeaza sandbox-ul. Foloseste `-t terminal,file`.

4. **NU lansa toti 5 subagentii fara `wait`.** Foloseste `&` + `wait` explicit cu batch-uri paralele.

5. **KeyboardInterrupt la inchiderea terminalului.** Foloseste `nohup ... & disown` pentru orchestrator.

6. **NU uita sa faci push la branch-ul de baza inainte.** Subagentii cloneaza din remote.

7. **GITHUB_TOKEN e auto-pasat daca e in `env_passthrough`.** Nu mai pune `GITHUB_TOKEN=$(gh auth token)` in orchestrator — e redundant.

8. **Daca un subagent crapa, verifica log-ul.** Log-urile sunt in `.hermes-logs/<nume-subagent>.log`.
