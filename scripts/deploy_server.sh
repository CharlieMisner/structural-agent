#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="$REPO_ROOT/server"

echo "======================================================"
echo " 🚀 Deploying Statikor Server to Fly.io"
echo "======================================================"
echo ""

# 1. Check for fly / flyctl CLI
FLY_CMD=""
if command -v fly &> /dev/null; then
  FLY_CMD="fly"
elif command -v flyctl &> /dev/null; then
  FLY_CMD="flyctl"
else
  echo "❌ Error: Fly CLI is not installed."
  echo "👉 Install with: brew install flyctl  (or curl -L https://fly.io/install.sh | sh)"
  exit 1
fi

echo "🔎 Using Fly CLI: $("$FLY_CMD" version)"

# 2. Check Fly.io Authentication
echo "------------------------------------------------------"
echo " 🔑 [1/3] Checking Fly.io Authentication..."
echo "------------------------------------------------------"
if ! CURRENT_USER=$("$FLY_CMD" auth whoami 2>&1); then
  echo "❌ Error: Not logged into Fly.io."
  echo "👉 Please log in by running: $FLY_CMD auth login"
  exit 1
fi
echo "✅ Authenticated as: ${CURRENT_USER}"
echo ""

# 3. Run Server Unit Tests and Coverage
echo "------------------------------------------------------"
echo " 🧪 [2/3] Running Server Unit Tests & Coverage..."
echo "------------------------------------------------------"
cd "$SERVER_DIR"
if uv run pytest --cov=src --cov-report=term-missing; then
  echo "✅ Server unit tests and coverage passed!"
else
  echo "❌ Server tests failed! Aborting deployment."
  exit 1
fi
echo ""

# 4. Deploy to Fly.io
echo "------------------------------------------------------"
echo " 🚢 [3/3] Deploying Server to Fly.io..."
echo "------------------------------------------------------"
"$FLY_CMD" deploy

echo ""
echo "======================================================"
echo " 🎉 Statikor Server Successfully Deployed to Fly.io!"
echo " 🌐 App URL: https://api.statikor.com (or https://$("$FLY_CMD" status --json | grep -o '"Hostname":"[^"]*"' | head -n 1 | cut -d'"' -f4))"
echo " 🩺 Health:  $("$FLY_CMD" status)"
echo "======================================================"

