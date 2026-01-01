from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_DEFAULT = REPO_ROOT / "scripts" / "markdown_to_micro_v2.py"

MAX_CAPTURE = 4000  # truncate stdout/stderr for commit-friendly logs


@dataclass(frozen=True)
class Case:
    name: str
    markdown: str
    expected_blocks: int
    notes: str


def trunc(s: str) -> str:
    s = s or ""
    if len(s) <= MAX_CAPTURE:
        return s
    return s[:MAX_CAPTURE] + "\n...<truncated>...\n"


def run_case(script: Path, season: str, variant: str, work_dir: Path, case: Case) -> dict[str, Any]:
    case_dir = work_dir / case.name
    case_dir.mkdir(parents=True, exist_ok=True)

    inp = case_dir / "input.md"
    inp.write_text(case.markdown, encoding="utf-8")

    out_dir = case_dir / "store"
    cmd = [
        sys.executable, str(script),
        "--input", str(inp),
        "--out", str(out_dir),
        "--season", season,
        "--variant", variant,
        "--expected-blocks", str(case.expected_blocks),
        "--force",
    ]
    proc = subprocess.run(cmd, cwd=str(REPO_ROOT), text=True, capture_output=True)

    res: dict[str, Any] = {
        "name": case.name,
        "notes": case.notes,
        "expected_blocks": case.expected_blocks,
        "cmd": cmd,
        "returncode": proc.returncode,
        "stdout": trunc(proc.stdout),
        "stderr": trunc(proc.stderr),
    }

    if proc.returncode == 0:
        blocks_dir = out_dir / "blocks"
        entities_dir = out_dir / "entities"
        res["counts"] = {
            "blocks": len(list(blocks_dir.glob("*.json"))) if blocks_dir.exists() else 0,
            "entities": len(list(entities_dir.glob("*.json"))) if entities_dir.exists() else 0,
        }
        idx = out_dir / "index.json"
        if idx.exists():
            try:
                j = json.loads(idx.read_text(encoding="utf-8"))
                res["index_keys"] = sorted(j.keys()) if isinstance(j, dict) else []
            except Exception as e:
                res["index_parse_error"] = repr(e)

    return res


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="docs/robustness/matrix", help="Output directory (tracked).")
    ap.add_argument("--season", default="diag-season")
    ap.add_argument("--variant", default="hina")
    ap.add_argument("--script", default=str(SCRIPT_DEFAULT))
    args = ap.parse_args()

    script = Path(args.script)
    if not script.exists():
        print(f"[FATAL] missing script: {script}", file=sys.stderr)
        return 2

    out_root = Path(args.out)
    out_root.mkdir(parents=True, exist_ok=True)
    work_dir = out_root / "cases"
    work_dir.mkdir(parents=True, exist_ok=True)

    def fence_text(content: str) -> str:
        return "```text\n" + content.rstrip("\n") + "\n```\n"

    cases: list[Case] = [
        Case("ok_minimal", fence_text("Title\nBody"), 1, "minimal valid fence"),
        Case("ok_trailing_spaces_lang", "```text   \nTitle\nBody\n```\n", 1, "trailing spaces after language tag"),
        Case("ok_blank_lines_before_title", "```text\n\n\nTitle\nBody\n```\n", 1, "blank lines before title"),
        Case("fail_no_fence", "plain markdown only\n", 1, "no fences"),
        Case("fail_non_text_fence", "```python\nprint(1)\n```\n", 1, "non-text fence only"),
        Case("probe_uppercase_lang", "```TEXT\nTitle\nBody\n```\n", 1, "is language case-sensitive? (observe)"),
        Case("probe_indented_fence", "    ```text\nTitle\nBody\n    ```\n", 1, "indented fence (observe)"),
        Case("probe_unclosed_fence", "```text\nTitle\nBody\n", 1, "missing closing fence (observe)"),
        Case("probe_backticks_in_body", fence_text("Title\nBody\n```\nlooks like fence inside\n"), 1, "backticks in body (observe)"),
        Case("probe_bom", "\ufeff" + fence_text("Title\nBody"), 1, "UTF-8 BOM at file start (observe)"),
        Case("probe_crlf", "```text\r\nTitle\r\nBody\r\n```\r\n", 1, "CRLF newlines (observe)"),
    ]

    results: list[dict[str, Any]] = []
    for c in cases:
        results.append(run_case(script, args.season, args.variant, work_dir, c))

    # Write machine-readable summary (truncated outputs)
    (out_root / "matrix_summary.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )

    # Write markdown report
    lines: list[str] = []
    lines.append("# markdown_to_micro_v2 input matrix report\n")
    lines.append(f"- script: `{script}`\n")
    lines.append(f"- season: `{args.season}`\n")
    lines.append(f"- variant: `{args.variant}`\n")
    lines.append(f"- cases: {len(cases)}\n\n")
    lines.append("| case | rc | expected_blocks | blocks | entities | notes |\n")
    lines.append("|---|---:|---:|---:|---:|---|\n")

    for r in results:
        counts = r.get("counts") or {}
        lines.append(
            f"| {r['name']} | {r['returncode']} | {r['expected_blocks']} | "
            f"{counts.get('blocks','')} | {counts.get('entities','')} | {r['notes']} |\n"
        )

    lines.append("\n## Detailed logs (truncated)\n")
    for r in results:
        lines.append(f"\n### {r['name']}\n")
        lines.append(f"- notes: {r['notes']}\n")
        lines.append("```bash\n" + " ".join(map(str, r["cmd"])) + "\n```\n")
        lines.append("**rc**\n```text\n" + str(r["returncode"]) + "\n```\n")
        lines.append("**stdout**\n```text\n" + (r.get("stdout") or "") + "\n```\n")
        lines.append("**stderr**\n```text\n" + (r.get("stderr") or "") + "\n```\n")

    (out_root / "matrix_report.md").write_text("".join(lines), encoding="utf-8")

    print(f"[OK] wrote {out_root/'matrix_report.md'}")
    print(f"[OK] wrote {out_root/'matrix_summary.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
