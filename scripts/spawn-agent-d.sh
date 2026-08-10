#!/usr/bin/env bash
# =============================================================================
# spawn-agent-d.sh — Spawn Group D after Group B is DONE
#
# Group D — 003 project UI + csv upload frontend + export buttons
#   Branch: project-ui-csv-frontend
#   Depends on: Group B (csv-upload-export-backend) must be merged to development
#
# Usage:
#   bash scripts/spawn-agent-d.sh
# =============================================================================
set -euo pipefail

REPO_ROOT="/home/nodenix/Documents/acostator"
WORKTREES_BASE="/tmp/acostator-worktrees"
BASE_BRANCH="origin/development"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[spawn]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC} $*"; }

LABEL="FE-project-ui"
BRANCH="project-ui-csv-frontend"
TASK_FILE="timeline/TODO.003.project-ui-csv-frontend-export-buttons.md"
WORKTREE="$WORKTREES_BASE/$BRANCH"

# Fetch latest development (should have Group B merged)
log "Fetching origin/development..."
git -C "$REPO_ROOT" fetch origin development
ok "Fetched"

# Remove existing worktree/branch if any
git -C "$REPO_ROOT" worktree remove --force "$WORKTREE" 2>/dev/null || true
git -C "$REPO_ROOT" branch -D "$BRANCH" 2>/dev/null || true

TASK_CONTENT=$(cat "$REPO_ROOT/$TASK_FILE")
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

The CSV upload backend endpoints (/upload/init, /upload/complete) and export
endpoints (/export?format=json|csv) are already implemented and merged into
development. Your branch includes them. Read apps/worker/src/routes/projects.ts
and apps/worker/src/routes/export.ts before starting.

Read AGENT.md at the repo root first for full project context.

YOUR TASK:
$TASK_CONTENT"

# Use herdr worktree create — same pattern as spawn-agents.sh
WS_RESULT=$(herdr worktree create \
  --cwd "$REPO_ROOT" \
  --branch "$BRANCH" \
  --base "$BASE_BRANCH" \
  --path "$WORKTREE" \
  --label "$LABEL" \
  --no-focus 2>&1)

WS_ID=$(echo "$WS_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['workspace']['workspace_id'])")
ok "Created workspace: $WS_ID ($LABEL) at $WORKTREE"

# Wait for pane shell to be ready
sleep 3

# Start opencode agent
agent_name=$(echo "$LABEL" | tr '[:upper:]' '[:lower:]' | tr '/' '-')
herdr agent start "$agent_name" --kind opencode --pane "$WS_ID:p1" --timeout 30000
ok "OpenCode started: $agent_name"

# Send the task prompt
herdr agent prompt "$WS_ID:p1" "$PROMPT"
ok "Task sent to agent: $LABEL"

log ""
log "Group D agent spawned. When done, run: bash scripts/spawn-agent-e.sh"
