#!/bin/bash
# Post-commit hook to bump version, create tag, and release
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

# Create and push tag
git tag "v$NEW_VERSION" > /dev/null 2>&1 || true
git push origin "v$NEW_VERSION" > /dev/null 2>&1 || true

# Create GitHub release with commit message as notes
gh release create "v$NEW_VERSION" --title "Release $NEW_VERSION" --notes "$LAST_COMMIT_MSG" > /dev/null 2>&1 || true

echo "Version bumped: $CURRENT_VERSION -> $NEW_VERSION (tagged and released)"
