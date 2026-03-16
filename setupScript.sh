#!/bin/bash

set -e

echo "🔥 Triggering Firebase setup workflow..."

gh workflow run setupFirebase.yml

echo "✓ Workflow triggered"
echo "⏳ Waiting for workflow to start..."

sleep 5

RUN_ID=$(gh run list --workflow=setupFirebase.yml --limit 1 --json databaseId --jq '.[0].databaseId')

echo "📡 Watching workflow..."

gh run watch $RUN_ID

STATUS=$(gh run view $RUN_ID --json conclusion --jq '.conclusion')

if [ "$STATUS" = "success" ]; then
    echo "✅ Workflow completed successfully"
    
    echo "📥 Downloading environment files..."
    gh run download $RUN_ID -n environment-files -D src/environments
    
    echo "✓ Environment files downloaded to src/environments/"
    
    echo "🗑️  Deleting artifact from GitHub..."
    ARTIFACT_ID=$(gh api "/repos/{owner}/{repo}/actions/runs/$RUN_ID/artifacts" --jq '.artifacts[] | select(.name=="environment-files") | .id')
    
    if [ -n "$ARTIFACT_ID" ]; then
        gh api --method DELETE "/repos/{owner}/{repo}/actions/artifacts/$ARTIFACT_ID" && echo "✓ Artifact deleted" || echo "⚠️  Could not delete artifact"
    else
        echo "⚠️  Artifact not found"
    fi
    
    exit 0
else
    echo "❌ Workflow failed"
    exit 1
fi