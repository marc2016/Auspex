#!/bin/bash

# Exit on error
set -e

echo "⚡ Auspex Release & Publish Manager ⚡"
echo "========================================"

CURRENT_VER=$(node -p "require('./package.json').version")
echo "📌 Aktuelle Version: v$CURRENT_VER"

# Determine target version
TARGET_VER=$1

if [ -z "$TARGET_VER" ]; then
  echo ""
  echo "Wähle den Versions-Typ oder gib eine konkrete Version ein:"
  echo "  1) patch (Bugfixes/Kleine Fixes, z.B. v0.2.1)"
  echo "  2) minor (Neue Features/Module, z.B. v0.3.0)"
  echo "  3) major (Breaking Changes/Big Release, z.B. v1.0.0)"
  read -p "Auswahl [1-3 oder z.B. 0.3.0]: " CHOICE

  case $CHOICE in
    1|patch)
      TARGET_VER=$(node -e "const [m,j,p] = '$CURRENT_VER'.split('.').map(Number); console.log(\`\${m}.\${j}.\${p+1}\`)")
      ;;
    2|minor)
      TARGET_VER=$(node -e "const [m,j,p] = '$CURRENT_VER'.split('.').map(Number); console.log(\`\${m}.\${j+1}.0\`)")
      ;;
    3|major)
      TARGET_VER=$(node -e "const [m,j,p] = '$CURRENT_VER'.split('.').map(Number); console.log(\`\${m+1}.0.0\`)")
      ;;
    *)
      TARGET_VER=$CHOICE
      ;;
  esac
fi

# Clean leading 'v' if present
TARGET_VER=${TARGET_VER#v}

echo ""
echo "🚀 Bereite Release v$TARGET_VER vor..."

# Step 1: Run Unit Tests
echo ""
echo "🧪 1/3 Führe Unit-Tests aus (Vitest)..."
npm test

# Step 2: Build Extension & Webview
echo ""
echo "📦 2/3 Baue Extension & Webview Produktionsbundle..."
npm run build

# Step 3: Bump Version in package.json
echo ""
echo "✍️ 3/3 Aktualisiere package.json Version auf v$TARGET_VER..."
npm version $TARGET_VER --no-git-tag-version > /dev/null

# Step 4: Git Commit & Tag
echo ""
read -p "Möchtest du die Änderungen committen und den Tag v$TARGET_VER erstellen? (y/N): " CONFIRM_GIT

if [[ "$CONFIRM_GIT" =~ ^[Yy]$ ]]; then
  read -p "Commit-Nachricht [Release v$TARGET_VER]: " COMMIT_MSG
  if [ -z "$COMMIT_MSG" ]; then
    COMMIT_MSG="Release v$TARGET_VER"
  fi

  git add package.json package-lock.json CHANGELOG.md
  git commit -m "$COMMIT_MSG"
  git tag -a "v$TARGET_VER" -m "$COMMIT_MSG"
  echo "✅ Git Commit & Tag v$TARGET_VER erstellt."

  read -p "Möchtest du Commit & Tag v$TARGET_VER nach GitHub pushen? (y/N): " CONFIRM_PUSH
  if [[ "$CONFIRM_PUSH" =~ ^[Yy]$ ]]; then
    git push origin main
    git push origin "v$TARGET_VER"
    echo "🎉 Release v$TARGET_VER erfolgreich nach GitHub gepusht!"
    echo "💡 Die GitHub Action baut jetzt automatisch das VSIX-Paket und erstellt den GitHub Release."
  fi
fi

echo ""
echo "✨ Release v$TARGET_VER abgeschlossen!"
