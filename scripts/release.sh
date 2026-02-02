#!/bin/bash
#
# PC2 Release Script
# Automates version bumping, tagging, and GitHub release creation
#
# Usage:
#   npm run release -- patch    # Bug fixes: 2.6.0 → 2.6.1
#   npm run release -- minor    # New features: 2.6.0 → 2.7.0
#   npm run release -- major    # Breaking changes: 2.6.0 → 3.0.0
#   npm run release -- 2.7.0    # Explicit version
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the script's directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
    echo -e "${RED}Error: You have uncommitted changes. Please commit or stash them first.${NC}"
    git status --short
    exit 1
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${BLUE}Current version: ${CURRENT_VERSION}${NC}"

# Parse argument
VERSION_TYPE="${1:-patch}"

# Calculate new version
if [[ "$VERSION_TYPE" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    # Explicit version provided
    NEW_VERSION="$VERSION_TYPE"
else
    # Use npm version to calculate (without actually changing anything yet)
    case "$VERSION_TYPE" in
        major|minor|patch)
            # Parse current version
            IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
            case "$VERSION_TYPE" in
                major) NEW_VERSION="$((MAJOR + 1)).0.0" ;;
                minor) NEW_VERSION="${MAJOR}.$((MINOR + 1)).0" ;;
                patch) NEW_VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))" ;;
            esac
            ;;
        *)
            echo -e "${RED}Error: Invalid version type '${VERSION_TYPE}'${NC}"
            echo "Usage: npm run release -- [patch|minor|major|X.Y.Z]"
            exit 1
            ;;
    esac
fi

echo -e "${GREEN}New version: ${NEW_VERSION}${NC}"
echo ""

# Confirm with user
read -p "Create release v${NEW_VERSION}? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo -e "${YELLOW}Step 1/5: Bumping version in package.json files...${NC}"

# Update root package.json
npm version "$NEW_VERSION" --no-git-tag-version

# Update pc2-node package.json
cd pc2-node
npm version "$NEW_VERSION" --no-git-tag-version
cd ..

echo -e "${GREEN}✓ Version bumped to ${NEW_VERSION}${NC}"

echo ""
echo -e "${YELLOW}Step 2/5: Committing version bump...${NC}"

git add package.json package-lock.json pc2-node/package.json pc2-node/package-lock.json
git commit -m "chore: bump version to v${NEW_VERSION}"

echo -e "${GREEN}✓ Committed${NC}"

echo ""
echo -e "${YELLOW}Step 3/5: Creating git tag...${NC}"

git tag -a "v${NEW_VERSION}" -m "v${NEW_VERSION}"

echo -e "${GREEN}✓ Tag created: v${NEW_VERSION}${NC}"

echo ""
echo -e "${YELLOW}Step 4/5: Pushing to origin...${NC}"

git push origin main
git push origin "v${NEW_VERSION}"

echo -e "${GREEN}✓ Pushed to origin${NC}"

echo ""
echo -e "${YELLOW}Step 5/5: Creating GitHub release...${NC}"

# Create release notes template
RELEASE_NOTES="## What's New

- 

## Bug Fixes

- 

## For Node Operators

Your PC2 node will automatically detect this update.
Click \"Install Update\" in Settings → System."

# Try to create GitHub release
if command -v gh &> /dev/null; then
    gh release create "v${NEW_VERSION}" \
        --title "v${NEW_VERSION}" \
        --notes "$RELEASE_NOTES" \
        --draft
    
    echo -e "${GREEN}✓ Draft release created on GitHub${NC}"
    echo -e "${BLUE}Edit the release notes at: https://github.com/Elacity/pc2.net/releases/tag/v${NEW_VERSION}${NC}"
else
    # Fallback to API
    echo -e "${YELLOW}gh CLI not available, trying API...${NC}"
    
    gh api repos/Elacity/pc2.net/releases \
        -f tag_name="v${NEW_VERSION}" \
        -f name="v${NEW_VERSION}" \
        -f body="$RELEASE_NOTES" \
        -f draft=true \
        > /dev/null 2>&1 && {
        echo -e "${GREEN}✓ Draft release created on GitHub${NC}"
    } || {
        echo -e "${YELLOW}⚠ Could not create GitHub release automatically.${NC}"
        echo -e "Please create it manually at: https://github.com/Elacity/pc2.net/releases/new?tag=v${NEW_VERSION}"
    }
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Release v${NEW_VERSION} prepared successfully!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "Next steps:"
echo -e "  1. Edit the release notes on GitHub"
echo -e "  2. Publish the release (remove draft status)"
echo -e "  3. VPS nodes will auto-detect within 3 hours"
echo ""
