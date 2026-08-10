#!/usr/bin/env bash
# =============================================================================
# kill-agents.sh — Stop all agent workspaces and clean up worktrees
#
# Keeps w6 (acostator manager session) intact.
#
# Usage:
#   bash scripts/kill-agents.sh
# =============================================================================
set -euo pipefail

REPO_ROOT="/home/nodenix/Documents/acostator"
WORKTREES_BASE="/tmp/acostator-worktrees"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${BLUE}[kill]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }

# 1. Close all non-manager workspaces (skip w6 = acostator manager)
log "Closing agent workspaces..."
herdr workspace list 2>&1 | python3 -c "
import sys,json
d=json.load(sys.stdin)
for w in d['result']['workspaces']:
    if w['workspace_id'] != 'w6':
        print(w['workspace_id'])
" | while read ws_id; do
  herdr workspace close "$ws_id" 2>&1 >/dev/null && ok "  closed: $ws_id"
done

# 2. Remove all worktrees under /tmp/acostator-worktrees/
log "Removing git worktrees..."
git -C "$REPO_ROOT" worktree list --porcelain \
  | grep "^worktree /tmp/" \
  | awk '{print $2}' \
  | while read wt; do
    git -C "$REPO_ROOT" worktree remove --force "$wt" 2>/dev/null \
      && ok "  removed: $wt" \
      || warn "  could not remove: $wt"
  done

# 3. Delete local agent branches
log "Deleting local agent branches..."
for br in random-queue-bug csv-upload-export-backend quadruple-form project-ui-csv-frontend testing-setup; do
  git -C "$REPO_ROOT" branch -D "$br" 2>/dev/null \
    && ok "  deleted: $br" \
    || warn "  not found: $br (ok)"
done

echo ""
log "Done. Remaining workspaces:"
herdr workspace list 2>&1 | python3 -c "
import sys,json
d=json.load(sys.stdin)
for w in d['result']['workspaces']:
    print(f\"  {w['workspace_id']:6} {w['label']:25} {w.get('agent_status','?')}\")
"
