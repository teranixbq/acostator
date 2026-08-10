#!/usr/bin/env bash
# =============================================================================
# spawn-agents.sh — Spawn batch 1 agents (A, B, C) in parallel
#
# Batch 1 (no dependencies, run in parallel):
#   Agent A — 001 random-queue-bug     → branch: random-queue-bug
#   Agent B — 002 csv-upload + export  → branch: csv-upload-export-backend
#   Agent C — 004 quadruple-form       → branch: quadruple-form
#
# After batch 1 is done, run manually:
#   bash scripts/spawn-agent-d.sh   (Group D — depends on B)
#   bash scripts/spawn-agent-e.sh   (Group E — depends on A+B+C+D)
#
# Usage:
#   bash scripts/spawn-agents.sh
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

# Agent definitions: "label|branch|task_file"
declare -a AGENTS=(
  "queue-bug|random-queue-bug|timeline/TODO.001.random-queue-bug.md"
  "csv-export-backend|csv-upload-export-backend|timeline/TODO.002.csv-upload-and-export-backend.md"
  "quad-form|quadruple-form|timeline/TODO.004.quadruple-form.md"
)

for agent in "${AGENTS[@]}"; do
  IFS='|' read -r label branch task_file <<< "$agent"
  worktree="$WORKTREES_BASE/$branch"

  log "Setting up agent: $label (branch: $branch)"

  # Remove existing worktree if any
  if [[ -d "$worktree" ]]; then
    git -C "$REPO_ROOT" worktree remove --force "$worktree" 2>/dev/null || true
    warn "  Removed existing worktree: $worktree"
  fi

  # Delete local branch if exists
  git -C "$REPO_ROOT" branch -D "$branch" 2>/dev/null || true

  # Create worktree with new branch from development
  git -C "$REPO_ROOT" worktree add -b "$branch" "$worktree" "$BASE_BRANCH"
  ok "  Worktree created at $worktree (base: $BASE_BRANCH)"

  # Build the task prompt
  TASK_CONTENT=$(cat "$REPO_ROOT/$task_file")
  PROMPT="You are a coding agent working on the Acostator project (ACOS annotation tool).

Working directory: $worktree
Your branch: $branch (already created, already checked out)
Base branch: development

CRITICAL RULES:
1. You are already on branch '$branch' — do NOT checkout or switch branches
2. Branch was created from 'development' — your base is correct
3. When done: run 'git push -u origin $branch' to push your branch
4. Do NOT merge into development yourself — manager reviews and merges
5. Do NOT touch timeline/delegation.md — manager manages that file
6. Rename your task file: TODO. → WIP. when starting, WIP. → DONE. when done
7. Run 'npm run lint' and 'npm run typecheck' before pushing — fix all errors

Read AGENT.md at the repo root first for full project context.

YOUR TASK:
$TASK_CONTENT"

  # Create new herdr workspace
  WS_RESULT=$(herdr workspace create --label "$label" 2>&1)
  WS_ID=$(echo "$WS_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['workspace_id'])")
  ok "  Created workspace: $WS_ID ($label)"

  # Launch opencode in the worktree
  herdr send-keys "$WS_ID:p1" "cd $worktree && opencode" Enter
  sleep 3

  # Send the task prompt
  herdr agent send-text "$WS_ID:p1" "$PROMPT"
  ok "  Task sent to agent: $label"

  echo ""
done

echo ""
log "Batch 1 spawned: 3 agents running in parallel"
log "Monitor: herdr agent list 2>&1 | python3 -c \"import sys,json; d=json.load(sys.stdin); [print(a['pane_id'], a.get('agent_status','?'), a.get('terminal_title_stripped','')[:50]) for a in d['result']['agents']]\""
log ""
log "When all 3 are done, run: bash scripts/spawn-agent-d.sh"
