#!/bin/bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROMPTS_DIR="$REPO_DIR/.hermes-prompts"
LOGS_DIR="$REPO_DIR/.hermes-logs"
mkdir -p "$LOGS_DIR"

declare -A AGENTS
AGENTS=(
  ["1-types-stores"]="$PROMPTS_DIR/prompt-1-types-stores.txt"
  ["2-chat-core"]="$PROMPTS_DIR/prompt-2-chat-core.txt"
  ["3-chat-message"]="$PROMPTS_DIR/prompt-3-chat-message.txt"
  ["4-composer"]="$PROMPTS_DIR/prompt-4-composer.txt"
  ["5-tray-launcher"]="$PROMPTS_DIR/prompt-5-tray-launcher.txt"
  ["6-settings-core"]="$PROMPTS_DIR/prompt-6-settings-core.txt"
  ["7-sections-chrome"]="$PROMPTS_DIR/prompt-7-settings-sections.txt"
  ["8-app-shell"]="$PROMPTS_DIR/prompt-8-app-shell.txt"
)

launch_agent() {
  local name="$1"
  local prompt_file="$2"
  local log_file="$LOGS_DIR/$name.log"
  hermes chat -q "$(cat "$prompt_file")" -t terminal >> "$log_file" 2>&1 &
  local pid=$!
  echo "[$(date '+%H:%M:%S')] $name launched (PID=$pid)" | tee -a "$LOGS_DIR/orchestrator.log"
  echo $pid > "$LOGS_DIR/$name.pid"
}

# Launch all 8 in parallel
echo "[$(date '+%H:%M:%S')] Starting 8-agent swarm..." | tee "$LOGS_DIR/orchestrator.log"
echo "" | tee -a "$LOGS_DIR/orchestrator.log"

for name in "${!AGENTS[@]}"; do
  launch_agent "$name" "${AGENTS[$name]}"
done

echo "" | tee -a "$LOGS_DIR/orchestrator.log"
echo "[$(date '+%H:%M:%S')] All 8 agents launched. Waiting..." | tee -a "$LOGS_DIR/orchestrator.log"

# Wait for all
wait

echo "[$(date '+%H:%M:%S')] All agents finished." | tee -a "$LOGS_DIR/orchestrator.log"

# Check which branches were created
echo "" | tee -a "$LOGS_DIR/orchestrator.log"
echo "=== Branches created ===" | tee -a "$LOGS_DIR/orchestrator.log"
cd "$REPO_DIR"
git fetch origin 2>/dev/null
git branch -r | grep 'hermes/' | tee -a "$LOGS_DIR/orchestrator.log"
