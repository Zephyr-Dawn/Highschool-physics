#!/usr/bin/env bash
# Configures main branch protection for the existing GitHub repository.
# Requires an authenticated GitHub CLI with admin permission.
# Public visibility is explicitly authorized by the user; private data is still forbidden.
set -euo pipefail

REPO="${REPO:-Zephyr-Dawn/Highschool-physics}"

if ! command -v gh >/dev/null 2>&1; then
  echo "BLOCKED: gh is not installed. Install GitHub CLI and authenticate first." >&2
  exit 2
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "BLOCKED: GitHub CLI is not authenticated. Use 'gh auth login' interactively." >&2
  exit 2
fi

PRIVATE="$(gh repo view "$REPO" --json isPrivate --jq '.isPrivate')"
if [ "$PRIVATE" != "true" ]; then
  echo "NOTE: $REPO is public; public visibility is authorized, but private/teacher/student data remains forbidden." >&2
fi

gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "repos/$REPO/branches/main/protection" \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["verify"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true
}
JSON

echo "Branch protection configured for $REPO main (verify required)."
