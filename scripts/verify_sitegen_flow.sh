#!/usr/bin/env bash
set -euo pipefail

# End-to-end verifier for:
# legacy JSON -> micro snapshot -> dist (legacy-compatible) -> Jinja-rendered HTML

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTENT_DIR="${CONTENT_DIR:-$ROOT/content/posts}"
EXPERIENCES="${EXPERIENCES:-$ROOT/config/experiences.yaml}"
SRC_ROOT="${SRC_ROOT:-$ROOT/experience_src}"
WORK_DIR="${WORK_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/sitegen-flow.XXXXXX")}"

MICRO_WORK="$WORK_DIR/work_micro"
DIST_WORK="$WORK_DIR/work_dist"
GENERATED_WORK="$WORK_DIR/work_generated"

RUN1="$WORK_DIR/run1"
RUN2="$WORK_DIR/run2"
LEGACY_BASE="$WORK_DIR/legacy_patch"
mkdir -p "$LEGACY_BASE"

log() {
  echo "[$(date +'%H:%M:%S')] $*"
}

hash_dir() {
  python - "$1" <<'PY'
import hashlib
import sys
from pathlib import Path

root = Path(sys.argv[1])
fingerprints = {}
for path in sorted(root.rglob("*")):
    if path.is_file():
        rel = path.relative_to(root)
        fingerprints[str(rel)] = hashlib.sha256(path.read_bytes()).hexdigest()
print(fingerprints)
PY
}

compare_dirs() {
  local left="$1"
  local right="$2"

  local left_hashes
  local right_hashes
  left_hashes="$(hash_dir "$left")"
  right_hashes="$(hash_dir "$right")"

  if [[ "$left_hashes" != "$right_hashes" ]]; then
    echo "Mismatch between $left and $right"
    diff <(echo "$left_hashes") <(echo "$right_hashes") || true
    return 1
  fi
}

copy_dir() {
  python - "$1" "$2" <<'PY'
import shutil
import sys
from pathlib import Path

src = Path(sys.argv[1])
dest = Path(sys.argv[2])
if dest.exists():
    shutil.rmtree(dest)
shutil.copytree(src, dest)
PY
}

run_flow_once() {
  local snapshot_out="$1"
  local dist_out="$2"
  local generated_out="$3"

  rm -rf "$MICRO_WORK" "$DIST_WORK" "$GENERATED_WORK"

  log "Generating micro snapshot"
  python -m sitegen.cli_snapshot_micro --posts "$CONTENT_DIR" --out "$MICRO_WORK"

  log "Verifying snapshot (--check)"
  python -m sitegen.cli_snapshot_micro --posts "$CONTENT_DIR" --out "$MICRO_WORK" --check

  log "Compiling micro store to dist"
  python -m sitegen.cli_build_posts --micro "$MICRO_WORK" --out "$DIST_WORK"

  log "Rendering HTML from dist posts"
  SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-0}" python -m sitegen build \
    --experiences "$EXPERIENCES" \
    --src "$SRC_ROOT" \
    --content "$DIST_WORK/posts" \
    --out "$GENERATED_WORK" \
    --shared \
    --all \
    --deterministic \
    --build-label "sitegen-flow" \
    --legacy-base "$LEGACY_BASE"

  mkdir -p "$snapshot_out" "$dist_out" "$generated_out"
  copy_dir "$MICRO_WORK" "$snapshot_out"
  copy_dir "$DIST_WORK" "$dist_out"
  copy_dir "$GENERATED_WORK" "$generated_out"
}

log "Working directory: $WORK_DIR"
run_flow_once "$RUN1/micro" "$RUN1/dist" "$RUN1/generated"
run_flow_once "$RUN2/micro" "$RUN2/dist" "$RUN2/generated"

log "Comparing run1 vs run2 outputs for determinism"
compare_dirs "$RUN1/micro" "$RUN2/micro"
compare_dirs "$RUN1/dist" "$RUN2/dist"
compare_dirs "$RUN1/generated" "$RUN2/generated"

log "All checks passed."
