#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD="${PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:-1}"

log() {
  echo "[post-create] $*"
}

detect_package_manager() {
  if [[ -f "pnpm-lock.yaml" ]]; then
    echo "pnpm"
  elif [[ -f "yarn.lock" ]]; then
    echo "yarn"
  else
    echo "npm"
  fi
}

install_dependencies() {
  local pm="$1"
  case "$pm" in
    pnpm)
      log "Detected pnpm; enabling corepack and installing dependencies."
      corepack enable
      pnpm install --frozen-lockfile
      ;;
    yarn)
      log "Detected yarn; enabling corepack and installing dependencies."
      corepack enable
      yarn install --frozen-lockfile
      ;;
    npm)
      log "Detected npm; installing dependencies."
      if [[ -f "package-lock.json" ]]; then
        npm ci
      else
        npm install
      fi
      ;;
    *)
      log "Unknown package manager: $pm"
      return 1
      ;;
  esac
}

ensure_playwright_browsers() {
  if node -e "const { chromium } = require('playwright'); const fs = require('fs'); const path = chromium.executablePath(); if (!path || !fs.existsSync(path)) process.exit(1);" >/dev/null 2>&1; then
    log "Playwright browsers already available; skipping install."
  else
    log "Playwright browsers missing; installing (this may take a while)..."
    npx playwright install --with-deps
  fi
}

setup_qa_pocket() {
  if [[ -x ".qa/setup.sh" && ! -f ".qa/playwright.config.ts" ]]; then
    log "Running base QA pocket setup script."
    bash .qa/setup.sh
  else
    log "QA pocket setup skipped (already present or missing script)."
  fi

  if [[ -x ".qa/setup-flow-coverage.sh" ]]; then
    log "Running QA flow coverage addon setup."
    bash .qa/setup-flow-coverage.sh
  else
    log "QA flow coverage addon not found; skipping."
  fi
}

main() {
  local pm
  pm=$(detect_package_manager)
  install_dependencies "$pm"
  ensure_playwright_browsers
  setup_qa_pocket

  log "Setup complete. Next suggested command: bash .qa/run-flow-coverage.sh"
}

main "$@"
