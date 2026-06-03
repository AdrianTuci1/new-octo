#!/bin/bash
# scripts/tmux-merge.sh
# Ruleaza DUPA ce toti cei 5 agenti Hermes au terminat
# Face merge din toate branch-urile hermes/ in migration/rust-native-ui
set -euo pipefail

REPO_DIR="/Users/adriantucicovenco/Proiecte/launcher-rs-react"
MERGE_BRANCH="migration/rust-native-ui"
LOGS_DIR="$REPO_DIR/.hermes-logs"

cd "$REPO_DIR"

echo "=== Merging swarm branches at $(date) ===" | tee -a "$LOGS_DIR/merge.log"

# Asigura-te ca avem ultimele commit-uri
echo "--- Fetching remote branches ---"
git fetch origin 2>&1 | tee -a "$LOGS_DIR/merge.log"

# Creeaza branch-ul de merge
echo "--- Creating merge branch: $MERGE_BRANCH ---"
git checkout -b "$MERGE_BRANCH" origin/codex/launcher-context-refactor 2>/dev/null || git checkout "$MERGE_BRANCH" 2>/dev/null || true

BRANCHES=(
  "hermes/ui-state-mgmt"
  "hermes/ui-terminal"
  "hermes/ui-chat-composer"
  "hermes/ui-settings-editor"
  "hermes/ui-app-shell"
)

for branch in "${BRANCHES[@]}"; do
  echo ""
  echo "--- Merging $branch ---"
  if git merge --no-edit "origin/$branch" 2>&1; then
    echo "OK: $branch merged cleanly" | tee -a "$LOGS_DIR/merge.log"
  else
    echo "CONFLICT in $branch - resolving with --theirs..." | tee -a "$LOGS_DIR/merge.log"
    git diff --name-only --diff-filter=U 2>/dev/null | while read f; do
      echo "  Resolving: $f" | tee -a "$LOGS_DIR/merge.log"
      git checkout --theirs "$f" 2>/dev/null || true
    done
    git add .
    git commit -m "merge: resolve conflicts from $branch" 2>/dev/null || echo "  Nothing to commit after conflict resolution"
  fi
done

echo ""
echo "=== Pushing $MERGE_BRANCH ==="
git push origin "$MERGE_BRANCH" 2>&1 | tee -a "$LOGS_DIR/merge.log"

echo ""
echo "=== DONE at $(date) ==="
echo "Merge branch: $MERGE_BRANCH"
echo "Pentru a verifica:"
echo "  cd $REPO_DIR"
echo "  git checkout $MERGE_BRANCH"
echo "  ls -la octomus-ui/"
echo "  cargo build --workspace"
