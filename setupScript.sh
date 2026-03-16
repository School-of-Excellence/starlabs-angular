#!/bin/bash

set -e

echo "🔥 Triggering Firebase setup workflow..."

gh workflow run setup-firebase.yml

echo "✓ Workflow triggered"
echo "⏳ Waiting for workflow to start..."

sleep 5

RUN_ID=$(gh run list --workflow=setup-firebase.yml --limit 1 --json databaseId --jq '.[0].databaseId')

echo "📡 Watching workflow..."

gh run watch $RUN_ID

STATUS=$(gh run view $RUN_ID --json conclusion --jq '.conclusion')

if [ "$STATUS" = "success" ]; then
    echo "✅ Workflow completed successfully"
    exit 0
else
    echo "❌ Workflow failed"
    exit 1
fi