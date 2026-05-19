#!/bin/bash

set -e

# Fix for Git Bash on Windows path conversion
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
    export MSYS_NO_PATHCONV=1
    export MSYS2_ARG_CONV_EXCL="*"
fi

echo "🔥 Triggering Firebase setup workflow..."

gh workflow run setupFirebase.yml

echo "✓ Workflow triggered"
echo "⏳ Waiting for workflow to start..."

sleep 5

RUN_ID=$(gh run list --workflow=setupFirebase.yml --limit 1 --json databaseId --jq '.[0].databaseId')

echo "📡 Watching workflow..."

gh run watch $RUN_ID --exit-status

echo "✅ Workflow completed successfully"

echo "📥 Downloading environment files..."
gh run download $RUN_ID -n environment-files

echo "📁 Moving files to src/environments/..."
mkdir -p src/environments
mv environment.ts src/environments/ 2>/dev/null || true
mv environment.development.ts src/environments/ 2>/dev/null || true

echo "✓ Files downloaded to src/environments/"

echo "🗑️ Deleting artifact..."
ARTIFACT_ID=$(gh api "/repos/{owner}/{repo}/actions/runs/$RUN_ID/artifacts" --jq '.artifacts[] | select(.name=="environment-files") | .id')
gh api --method DELETE "/repos/{owner}/{repo}/actions/artifacts/$ARTIFACT_ID"

echo ""
echo "📦 Installing dependencies..."
npm i --legacy-peer-deps

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Run your app: ng s"