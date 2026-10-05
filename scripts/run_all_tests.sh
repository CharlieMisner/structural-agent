#!/usr/bin/env bash
set -euo pipefail

# Ensure Cargo/Rust binaries and uv are available on PATH
export PATH="$HOME/.cargo/bin:$PATH"

# Repository root directory (one level up from scripts/)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "======================================================"
echo " Running All Structural Agent Test Suites"
echo "======================================================"
echo ""

# Track failures
FAILED=0

# 1. Rust Backend Tests & Coverage
echo "------------------------------------------------------"
echo " [1/4] Running Rust Backend Tests (client/)"
echo "------------------------------------------------------"
if (cd "$REPO_ROOT/client" && cargo llvm-cov --summary-only); then
  echo "✅ Rust backend tests and coverage passed."
else
  echo "❌ Rust backend tests failed."
  FAILED=1
fi
echo ""

# 2. TypeScript Client Tests & Coverage
echo "------------------------------------------------------"
echo " [2/4] Running TypeScript Client Tests (client/)"
echo "------------------------------------------------------"
if (cd "$REPO_ROOT/client" && npm run test:coverage); then
  echo "✅ TypeScript client tests and coverage passed."
else
  echo "❌ TypeScript client tests failed."
  FAILED=1
fi
echo ""

# 3. Python Server Tests & Coverage
echo "------------------------------------------------------"
echo " [3/4] Running Python Server Tests (server/)"
echo "------------------------------------------------------"
if (cd "$REPO_ROOT/server" && uv run pytest --cov=src --cov-report=term-missing); then
  echo "✅ Python server tests and coverage passed."
else
  echo "❌ Python server tests failed."
  FAILED=1
fi
echo ""

# 4. Python Sidecar Tests & Coverage
echo "------------------------------------------------------"
echo " [4/4] Running Python Sidecar Tests (sidecar/)"
echo "------------------------------------------------------"
if (cd "$REPO_ROOT/sidecar" && uv run pytest --cov=src --cov-report=term-missing); then
  echo "✅ Python sidecar tests and coverage passed."
else
  echo "❌ Python sidecar tests failed."
  FAILED=1
fi
echo ""

# Summary
echo "======================================================"
if [ $FAILED -eq 0 ]; then
  echo " 🎉 ALL TEST SUITES PASSED (Coverage >= 85%)"
  echo "======================================================"
  exit 0
else
  echo " 🚨 SOME TEST SUITES FAILED"
  echo "======================================================"
  exit 1
fi
