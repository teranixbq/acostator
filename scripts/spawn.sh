#!/usr/bin/env bash
# =============================================================================
# spawn.sh — Dynamic parallel agent spawner
#
# Reads TODO.*.md files from timeline/ and spawns one agent per task.
# All workspaces are created first, then all agents are started in parallel.
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

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${BLUE}[spawn]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
err()  { echo -e "${RED}[err]${NC} $*"; }

# Fetch latest development
log "Fetching origin/development..."
git -C "$REPO_ROOT" fetch origin development
ok "Fetched"

# ---------------------------------------------------------------------------
# Collect task files to spawn
# ---------------------------------------------------------------------------
declare -a TASK_FILES=()

if [[ $# -eq 0 ]]; then
  while IFS= read -r f; do
    TASK_FILES+=("$f")
  done < <(ls "$REPO_ROOT/timeline/TODO."*.md 2>/dev/null || true)
else
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

log "Found ${#TASK_FILES[@]} task(s) to spawn."
echo ""

# ---------------------------------------------------------------------------
# Phase 1: Create all worktrees + workspaces (serial — herdr needs this)
# Collect workspace IDs and agent names for phase 2
# ---------------------------------------------------------------------------
declare -a WS_IDS=()
declare -a AGENT_NAMES=()
declare -a PANE_IDS=()
declare -a LABELS=()

log "Phase 1: Creating workspaces..."
echo ""

for TASK_FILE in "${TASK_FILES[@]}"; do
  BASENAME=$(basename "$TASK_FILE" .md)
  TASK_NUM=$(echo "$BASENAME" | cut -d. -f2)
  BRANCH=$(echo "$BASENAME" | cut -d. -f3-)
  WORKTREE="$WORKTREES_BASE/$BRANCH"
  LABEL=$(echo "$BRANCH" | cut -d- -f1-3 | tr '[:lower:]' '[:upper:]' | tr '-' '_' | cut -c1-12)

  log "  [$TASK_NUM] $BRANCH → $WORKTREE"

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

  # Create workspace
  WS_RESULT=$(herdr worktree create \
    --cwd "$REPO_ROOT" \
    --branch "$BRANCH" \
    --base "$BASE_BRANCH" \
    --path "$WORKTREE" \
    --label "$LABEL" \
    --no-focus 2>&1)

  WS_ID=$(echo "$WS_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['workspace']['workspace_id'])")
  PANE_ID="$WS_ID:p1"
  AGENT_NAME=$(echo "$BRANCH" | tr '[:upper:]' '[:lower:]' | cut -c1-20)

  WS_IDS+=("$WS_ID")
  PANE_IDS+=("$PANE_ID")
  AGENT_NAMES+=("$AGENT_NAME")
  LABELS+=("$LABEL")

  # Store prompt to temp file so phase 2 can read it without re-computing
  PROMPT_FILE="/tmp/acostator-worktrees/.prompt_${BRANCH}"
  mkdir -p "/tmp/acostator-worktrees"
  printf '%s' "$PROMPT" > "$PROMPT_FILE"

  ok "  Workspace ready: $WS_ID ($LABEL)"
done

echo ""
log "Phase 2: Starting all ${#WS_IDS[@]} agent(s) in parallel..."
echo ""

# ---------------------------------------------------------------------------
# Phase 2: Start all agents in parallel (background jobs)
# Each job: start agent → send prompt → focus
# ---------------------------------------------------------------------------
_start_agent() {
  local pane_id="$1"
  local agent_name="$2"
  local label="$3"
  local prompt_file="$4"

  herdr agent start "$agent_name" --kind opencode --pane "$pane_id" --timeout 30000
  herdr agent prompt "$pane_id" "$(cat "$prompt_file")"
  sleep 1
  herdr agent focus "$pane_id"
  echo -e "${GREEN}[ok]${NC}   Started & focused: $label ($pane_id)"
  rm -f "$prompt_file"
}

export -f _start_agent
export GREEN NC

PIDS=()
for i in "${!WS_IDS[@]}"; do
  BRANCH_FILE=$(ls "$REPO_ROOT/timeline/TODO."*.md 2>/dev/null | sed -n "$((i+1))p" || true)
  BRANCH_NAME=$(basename "${TASK_FILES[$i]}" .md | cut -d. -f3-)
  PROMPT_FILE="/tmp/acostator-worktrees/.prompt_${BRANCH_NAME}"

  _start_agent "${PANE_IDS[$i]}" "${AGENT_NAMES[$i]}" "${LABELS[$i]}" "$PROMPT_FILE" &
  PIDS+=($!)
done

# Wait for all background jobs
FAILED=0
for pid in "${PIDS[@]}"; do
  if ! wait "$pid"; then
    err "Agent start job $pid failed"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
if [[ $FAILED -gt 0 ]]; then
  err "$FAILED agent(s) failed to start. Check output above."
else
  ok "All ${#WS_IDS[@]} agent(s) started."
fi

echo ""
log "Monitor agents:"
log "  herdr agent list 2>&1 | python3 -c \"import sys,json; d=json.load(sys.stdin); [print(a['pane_id'], a.get('agent_status','?'), a.get('terminal_title_stripped','')[:50]) for a in d['result']['agents']]\""
