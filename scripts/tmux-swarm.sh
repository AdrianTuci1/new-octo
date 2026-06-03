#!/bin/bash
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
PROMPTS="$REPO/.hermes-prompts"
LOGS="$REPO/.hermes-logs"
mkdir -p "$LOGS"

export GITHUB_TOKEN="${GITHUB_TOKEN:-$(gh auth token)}"

SESSION="swarm-v2"
tmux kill-session -t "$SESSION" 2>/dev/null || true

# Create a temp script for each agent with the token pre-substituted
make_script() {
  local name="$1" prompt_file="$2" log_file="$3"
  local out="/tmp/hermes-${name}.sh"
  cat > "$out" << 'EOF'
#!/bin/bash
hermes chat -q "$(cat "PROMPT_PLACEHOLDER")" -t terminal 2>&1 | tee "LOG_PLACEHOLDER"
EOF
  sed -i '' "s|PROMPT_PLACEHOLDER|${prompt_file}|" "$out"
  sed -i '' "s|LOG_PLACEHOLDER|${log_file}|" "$out"
  chmod +x "$out"
}

make_script "1-types-stores"   "$PROMPTS/prompt-1-types-stores.txt"   "$LOGS/1-types-stores.log"
make_script "2-chat-core"      "$PROMPTS/prompt-2-chat-core.txt"      "$LOGS/2-chat-core.log"
make_script "3-chat-message"   "$PROMPTS/prompt-3-chat-message.txt"   "$LOGS/3-chat-message.log"
make_script "4-composer"       "$PROMPTS/prompt-4-composer.txt"       "$LOGS/4-composer.log"
make_script "5-tray-launcher"  "$PROMPTS/prompt-5-tray-launcher.txt"  "$LOGS/5-tray-launcher.log"
make_script "6-settings-core"  "$PROMPTS/prompt-6-settings-core.txt"  "$LOGS/6-settings-core.log"
make_script "7-sections-chrome" "$PROMPTS/prompt-7-settings-sections.txt" "$LOGS/7-sections-chrome.log"
make_script "8-app-shell"      "$PROMPTS/prompt-8-app-shell.txt"      "$LOGS/8-app-shell.log"

# Create detached tmux session with large window to fit 8 panes
tmux new-session -d -x 240 -y 72 -s "$SESSION" "cd '$REPO' && GITHUB_TOKEN='$GITHUB_TOKEN' /tmp/hermes-1-types-stores.sh"

# Build a 4x2 grid: columns = 4, rows = 2
# Col 1: agents 1, 3
# Col 2: agents 2, 4
# Col 3: agents 5, 6
# Col 4: agents 7, 8

# Row 1: split into 4 columns
tmux split-window -h -t "$SESSION:0"  "cd '$REPO' && GITHUB_TOKEN='$GITHUB_TOKEN' /tmp/hermes-2-chat-core.sh"
tmux split-window -h -t "$SESSION:0"  "cd '$REPO' && GITHUB_TOKEN='$GITHUB_TOKEN' /tmp/hermes-5-tray-launcher.sh"
tmux split-window -h -t "$SESSION:0"  "cd '$REPO' && GITHUB_TOKEN='$GITHUB_TOKEN' /tmp/hermes-7-sections-chrome.sh"

# Row 2: split each column vertically
tmux split-window -v -t "$SESSION:0.0" "cd '$REPO' && GITHUB_TOKEN='$GITHUB_TOKEN' /tmp/hermes-3-chat-message.sh"
tmux split-window -v -t "$SESSION:0.1" "cd '$REPO' && GITHUB_TOKEN='$GITHUB_TOKEN' /tmp/hermes-4-composer.sh"
tmux split-window -v -t "$SESSION:0.2" "cd '$REPO' && GITHUB_TOKEN='$GITHUB_TOKEN' /tmp/hermes-6-settings-core.sh"
tmux split-window -v -t "$SESSION:0.3" "cd '$REPO' && GITHUB_TOKEN='$GITHUB_TOKEN' /tmp/hermes-8-app-shell.sh"

tmux select-layout -t "$SESSION:0" tiled

echo "OK - 8 agents in 4x2 grid. Attach: tmux attach -t $SESSION"
