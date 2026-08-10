#!/usr/bin/env bash
# =============================================================================
# spawn.sh — Dynamic agent spawner
#
# Reads TODO.*.md files from timeline/ and spawns one agent per task.
#
# Usage:
#   bash scripts/spawn.sh              # spawn all TODO.* tasks
#   bash scripts/spawn.sh 007          # spawn task 007 only
#   bash scripts/spawn.sh 007 008      # spawn tasks 007 and 008
# =============================================================================
set -euo pipefail

REPO_ROOT="/home/nodenix/Documents/acostator"
WORKTREES_BASE="/tmp/acostator-worktrees"
BASE_BRANCH="origin/development"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${BLUE}[spawn]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }

# Fetch latest development
log "Fetching origin/development..."
git -C "$REPO_ROOT" fetch origin development
ok "Fetched"

# Collect task files to spawn
declare -a TASK_FILES=()

if [[ $# -eq 0 ]]; then
  # No args — spawn all TODO.* files
  while IFS= read -r f; do
    TASK_FILES+=("$f")
  done < <(ls "$REPO_ROOT/timeline/TODO."*.md 2>/dev/null || true)
else
  # Specific task numbers provided
  for num in "$@"; do
    match=$(ls "$REPO_ROOT/timeline/TODO.${num}."*.md 2>/dev/null | head -1 || true)
    if [[ -z "$match" ]]; then
      warn "No TODO file found for task $num — skipping"
    else
      TASK_FILES+=("$match")
    fi
  done
fi

if [[ ${#TASK_FILES[@]} -eq 0 ]]; then
  warn "No TODO task files found. Nothing to spawn."
  exit 0
fi

log "Spawning ${#TASK_FILES[@]} agent(s)..."
echo ""

for TASK_FILE in "${TASK_FILES[@]}"; do
  # Extract task info from filename: TODO.NNN.some-branch-name.md
  BASENAME=$(basename "$TASK_FILE" .md)           # e.g. TODO.007.modal-annotation-order-fix
  TASK_NUM=$(echo "$BASENAME" | cut -d. -f2)      # e.g. 007
  BRANCH=$(echo "$BASENAME" | cut -d. -f3-)       # e.g. modal-annotation-order-fix
  WORKTREE="$WORKTREES_BASE/$BRANCH"
  LABEL=$(echo "$BRANCH" | cut -d- -f1-3 | tr '[:lower:]' '[:upper:]' | tr '-' '_' | cut -c1-12)

  log "Task $TASK_NUM → branch: $BRANCH (label: $LABEL)"

  # Clean up existing worktree/branch if any
  git -C "$REPO_ROOT" worktree remove --force "$WORKTREE" 2>/dev/null || true
  git -C "$REPO_ROOT" branch -D "$BRANCH" 2>/dev/null || true

  TASK_CONTENT=$(cat "$TASK_FILE")
  PROMPT="You are a coding agent working on the Acostator project (ACOS annotation tool).

Working directory: $WORKTREE
Your branch: $BRANCH (already created, already checked out)
Base branch: development

CRITICAL RULES:
1. You are already on branch '$BRANCH' — do NOT checkout or switch branches
2. Branch was created from 'development' — your base is correct
3. When done: run 'git push -u origin $BRANCH' to push your branch
4. Do NOT merge into development yourself — manager reviews and merges
5. Do NOT touch timeline/delegation.md — manager manages that file
6. Rename your task file: TODO. -> WIP. when starting, WIP. -> DONE. when done
7. Run 'npm run lint' and 'npm run typecheck' before pushing — fix all errors
8. /tmp/acostator-worktrees/ and /tmp/opencode/ are pre-approved — no need to ask permission

Read AGENT.md at the repo root first for full project context.

YOUR TASK:
$TASK_CONTENT"

  # Create workspace via herdr worktree
  WS_RESULT=$(herdr worktree create \
    --cwd "$REPO_ROOT" \
    --branch "$BRANCH" \
    --base "$BASE_BRANCH" \
    --path "$WORKTREE" \
    --label "$LABEL" \
    --no-focus 2>&1)

  WS_ID=$(echo "$WS_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['workspace']['workspace_id'])")
  ok "  Created workspace: $WS_ID ($LABEL) at $WORKTREE"

  sleep 3

  # Start opencode agent
  agent_name=$(echo "$BRANCH" | tr '[:upper:]' '[:lower:]' | cut -c1-20)
  herdr agent start "$agent_name" --kind opencode --pane "$WS_ID:p1" --timeout 30000
  ok "  OpenCode started: $agent_name"

  # Send prompt then focus to trigger start
  herdr agent prompt "$WS_ID:p1" "$PROMPT"
  sleep 2
  herdr agent focus "$WS_ID:p1"
  ok "  Task sent and focused: $LABEL ($WS_ID)"

  echo ""
done

log "Done. Monitor agents:"
log "  herdr agent list 2>&1 | python3 -c \"import sys,json; d=json.load(sys.stdin); [print(a['pane_id'], a.get('agent_status','?'), a.get('terminal_title_stripped','')[:50]) for a in d['result']['agents']]\""
