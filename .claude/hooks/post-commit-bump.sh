#!/bin/bash
# Post-commit hook to automatically bump version after commits
# Skips if commit message contains [skip-version]

set -e

# Only run after successful git commit
LAST_COMMIT_MSG=$(git log -1 --pretty=%B 2>/dev/null) || exit 0

# Skip if [skip-version] in commit message
if [[ "$LAST_COMMIT_MSG" =~ \[skip-version\] ]]; then
  exit 0
fi

# Skip if this is a merge commit
if git rev-parse -q --verify MERGE_HEAD > /dev/null 2>&1; then
  exit 0
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version" 2>/dev/null) || exit 0

# Bump patch version
npm version patch --no-git-tag-version > /dev/null 2>&1 || exit 0
NEW_VERSION=$(node -p "require('./package.json').version")

# Commit the version bump
git add package.json package-lock.json 2>/dev/null
git commit -m "chore: bump version to $NEW_VERSION [skip-version]" > /dev/null 2>&1

echo "Version bumped: $CURRENT_VERSION -> $NEW_VERSION"
