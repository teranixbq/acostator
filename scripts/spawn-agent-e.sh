#!/usr/bin/env bash
# =============================================================================
# spawn-agent-e.sh — Spawn Group E after ALL groups are DONE
#
# Group E — 006 testing setup
#   Branch: testing-setup
#   Depends on: A + B + C + D must all be merged to development
#
# Usage:
#   bash scripts/spawn-agent-e.sh
# =============================================================================
set -euo pipefail

REPO_ROOT="/home/nodenix/Documents/acostator"
WORKTREES_BASE="/tmp/acostator-worktrees"
BASE_BRANCH="origin/development"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
log() { echo -e "${BLUE}[spawn]${NC} $*"; }
ok()  { echo -e "${GREEN}[ok]${NC} $*"; }

LABEL="BE-testing"
BRANCH="testing-setup"
TASK_FILE="timeline/TODO.006.testing-setup.md"
WORKTREE="$WORKTREES_BASE/$BRANCH"

log "Fetching origin/development..."
git -C "$REPO_ROOT" fetch origin development
ok "Fetched"

if [[ -d "$WORKTREE" ]]; then
  git -C "$REPO_ROOT" worktree remove --force "$WORKTREE" 2>/dev/null || true
fi
git -C "$REPO_ROOT" branch -D "$BRANCH" 2>/dev/null || true

git -C "$REPO_ROOT" worktree add -b "$BRANCH" "$WORKTREE" "$BASE_BRANCH"
ok "Worktree created at $WORKTREE (base: $BASE_BRANCH)"

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
6. Rename your task file: TODO. → WIP. when starting, WIP. → DONE. when done
7. Run 'npm run lint' and 'npm run typecheck' before pushing — fix all errors

All features are already implemented and merged into development:
- random queue bug fix (rows.ts)
- csv upload backend + export backend (projects.ts, export.ts)
- quadruple form (annotate.tsx, components)
- project UI + csv upload frontend (projects.tsx, modals)

Your job is to write tests for all of them.

Read AGENT.md at the repo root first for full project context.

YOUR TASK:
$TASK_CONTENT"

WS_RESULT=$(herdr workspace create --label "$LABEL" 2>&1)
WS_ID=$(echo "$WS_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['workspace_id'])")
ok "Created workspace: $WS_ID ($LABEL)"

herdr send-keys "$WS_ID:p1" "cd $WORKTREE && opencode" Enter
sleep 3
herdr agent send-text "$WS_ID:p1" "$PROMPT"
ok "Task sent to agent: $LABEL"

log ""
log "Group E agent spawned."
