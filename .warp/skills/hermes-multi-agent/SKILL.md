---
name: hermes-multi-agent
description: Orchestreaza refactorizari complexe prin delegarea la 5 agenti Hermes in paralel - domain models, services, store slices, view models, si extract components. Foloseste acest skill cand utilizatorul vrea sa refactorizeze un monolit React/Zustand cu OOP SOLID, sau cand vrea sa lanseze mai multi agenti hermes in paralel pe acelasi repo. BUN de folosit cand codul e mare, cu multe props si hook-uri monolitice.
---

# Hermes Multi-Agent Orchestrator (cu Oz)

Orchestreaza lansarea a 3-5 agenti Hermes in paralel pe Modal direct din conversatia cu Oz. Fiecare agent ruleaza in sandbox propriu (lifetime 3600s), cloneaza repo-ul cu GITHUB_TOKEN, scrie cod pe branch-ul `hermes/*-task`, face commit + push. Orchestratorul (script bash local lansat de Oz) face merge la final.

## Overview

Flow complet orchestrat din aceasta conversatie:
```
Oz conversation → creeaza prompt-uri in .hermes-prompts/
               → scrie scripts/orchestrator.sh
               → ruleaza comanda in terminal: nohup bash orchestrator.sh &
               → orchestratorul pe local lanseaza hermes chat -q in paralel pe Modal
               → fiecare hermes face clone, branch, scrie cod, commit, push
               → orchestratorul face git fetch + merge + push final
               → Oz raporteaza rezultatul
```

**Orchestratorul e UNIC si se creeaza DINAMIC de Oz** pentru fiecare task. Nu exista orchestrator generic — Oz il genereaza la fata locului.

## Cand sa folosesti

- Cand utilizatorul cere un swarm de agenti Hermes pentru un task complex
- Cand vrei sa porti un cod mare (React → Rust, refactor, etc.) in paralel
- Orice task unde 3-5 agenti paraleli reduc timpul de la saptamani la ore

## Workflow (executat de Oz)

### Pasul 0: VERIFICA / CONFIGUREAZA Hermes

Oz ruleaza:
```bash
# 1. Verifica config Hermes
hermes config show

# 2. Daca nu e pe Modal sau lifetime e gresit, configureaza:
hermes config set terminal.backend modal
hermes config set terminal.timeout 1800
hermes config set terminal.lifetime_seconds 3600

# 3. VERIFICA GITHUB_TOKEN in env_passthrough
cat ~/.config/hermes/config.yaml | grep -A5 env_passthrough
```

CRITICAL: Daca `GITHUB_TOKEN` nu e in `env_passthrough`, agentii Hermes nu pot clonea repo-ul. Oz trebuie sa opreasca tot si sa ceara utilizatorului sa adauge GITHUB_TOKEN in config.

### Pasul 1: Push branch-ul curent pe remote

Oz ruleaza:
```bash
git push -u origin $(git branch --show-current)
```

### Pasul 2: Oz creeaza prompt-urile in .hermes-prompts/

Oz genereaza DINAMIC cate un fisier `.hermes-prompts/prompt-<agent>.txt` pentru fiecare subagent. Fiecare prompt include:
- Instructiunea de clone (cu GITHUB_TOKEN din env_passthrough)
- Task-ul specific (ce cod sa scrie)
- Branch-ul pe care sa lucreze: `hermes/<task-name>`
- Instructiunea finala: `git add . && git commit -m "..." && git push origin hermes/<task-name>`

### Pasul 3: Oz creeaza orchestrator script local

Creeaza `scripts/swarm-<task>.sh` — script bash care:
1. Lanseaza subagentii in batch-uri paralele (`launch_subagent &` + `wait`)
2. Asteapta terminarea tuturor
3. Face `git fetch origin` + `git merge` pentru fiecare branch hermes/*
4. Rezolva conflictele cu `--theirs`
5. Face push pe branch-ul rezultat (`merge/<task>`)

### Pasul 4: Oz lanseaza orchestratorul detached

Ruleaza:
```bash
chmod +x scripts/swarm-<task>.sh
pkill -f swarm-<task>.sh 2>/dev/null || true
rm -rf .hermes-logs && mkdir -p .hermes-logs
nohup bash scripts/swarm-<task>.sh > .hermes-logs/orchestrator.log 2>&1 &
disown %1
echo "Swarm lansat - verifica cu: tail -f .hermes-logs/orchestrator.log"
```

### Pasul 5: Oz monitorizeaza si raporteaza

Dupa lansare, Oz verifica periodic (prin terminal) progresul:
```bash
tail -20 .hermes-logs/orchestrator.log
git ls-remote origin | grep hermes/  # vezi branch-urile aparute
tail -5 .hermes-logs/state-mgmt.log  # log individual agent
```

### Pasul 6: Pull + verificare rezultat

```bash
git pull origin merge/<task>
ls -d octomus-ui/ octomus-core/  # sau ce s-a construit
cargo build --workspace  # verifica compileaza
```

## Structura prompt-urilor (generata de Oz)

```text
Repo: OWNER/REPO
Base branch: BASE_BRANCH
Task: TASK_NAME

~> git clone https://oauth2:${GITHUB_TOKEN}@github.com/OWNER/REPO.git /tmp/repo
~> cd /tmp/repo
~> git checkout BASE_BRANCH
~> git checkout -b hermes/TASK_NAME

---

[DESCRIEREA DETALIATA A MODULULUI DE CREAT]

---

~> cargo check  # doar daca e Rust
~> git add .
~> git commit -m "TASK_NAME: description"
~> git push origin hermes/TASK_NAME
```

## Structura orchestratorului (generat de Oz)

```bash
# scripts/swarm-<task>.sh
#!/bin/bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MERGE_BRANCH="merge/<task>"
PROMPTS_DIR="$REPO_DIR/.hermes-prompts"
LOGS_DIR="$REPO_DIR/.hermes-logs"
mkdir -p "$LOGS_DIR"
cd "$REPO_DIR"

launch_subagent() {
  local name="$1"
  local prompt_file="$2"
  local log_file="$LOGS_DIR/$name.log"
  local pid_file="$LOGS_DIR/$name.pid"
  hermes chat -q "$(cat "$prompt_file")" -t terminal,file --yolo >> "$log_file" 2>&1 &
  echo $! > "$pid_file"
  echo "[$(date '+%H:%M:%S')] $name launched (PID=$!)" >> "$LOGS_DIR/orchestrator.log"
}

wait_for_pids() {
  for name in "$@"; do
    local pid_file="$LOGS_DIR/$name.pid"
    [ ! -f "$pid_file" ] && continue
    wait "$(cat "$pid_file")" 2>/dev/null || true
    rm -f "$pid_file"
  done
}

# Batch 1: independent (generat de Oz)
launch_subagent "agent-1" "$PROMPTS_DIR/prompt-agent-1.txt"
launch_subagent "agent-2" "$PROMPTS_DIR/prompt-agent-2.txt"
wait_for_pids "agent-1" "agent-2"

# Batch 2: dupa Batch 1 (generat de Oz)
launch_subagent "agent-3" "$PROMPTS_DIR/prompt-agent-3.txt"
wait_for_pids "agent-3"

# Merge
git checkout -b "$MERGE_BRANCH" 2>/dev/null || git checkout "$MERGE_BRANCH"
git fetch origin
for branch in "${BRANCHES[@]}"; do
  git merge --no-edit "origin/$branch" 2>&1 || {
    git diff --name-only --diff-filter=U | while read f; do git checkout --theirs "$f" 2>/dev/null || true; done
    git add . && git commit -m "merge $branch" 2>/dev/null || true
  }
done
git push origin "$MERGE_BRANCH"
```

## Reguli pentru Oz

1. **Intotdeauna verifica GITHUB_TOKEN in config** inainte de a lansa orice agent Hermes. Daca nu exista, cere utilizatorului.
2. **Intotdeauna fa push la branch-ul curent** inainte de a crea prompt-uri (agentii cloneaza din remote).
3. **Prompt-urile trebuie sa includa GITHUB_TOKEN** in URL-ul de clone (`https://oauth2:${GITHUB_TOKEN}@github.com/...`).
4. **Nu genera orchestratorul ca text** — scrie-l efectiv in `scripts/` cu `create_file`.
5. **Prompt-urile se salveaza** in `.hermes-prompts/prompt-<agent>.txt`.
6. **Batch-urile** — grupeaza agentii care nu au dependinte intre ei in acelasi batch.
7. **Ori de cate ori lansezi orchestratorul**, foloseste `nohup ... & disown`.
8. **La final**, raporteaza rezumatul: ce branch-uri s-au creat, ce s-a construit, cum se verifica.

## Anti-patterns

1. **`lifetime_seconds: 300`** distruge sandbox-ul inainte sa termine. Seteaza 3600.
2. **Timeout 180s** omoara subagentii. Seteaza 1800.
3. **NU folosi `-t` cu computer_use/browser** pe Modal. Doar `-t terminal,file`.
4. **NU uita sa faci push la branch-ul de baza** inainte de prompt-uri.
5. **GITHUB_TOKEN e auto-pasat** daca e in `env_passthrough`. Nu-l pasa manual in prompt.
