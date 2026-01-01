from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
OUT = REPO_ROOT / "docs" / "robustness" / "run_log.md"
OUT.parent.mkdir(parents=True, exist_ok=True)

MAX_CAPTURE = 8000  # keep enough context for failures


def trunc(s: str) -> str:
    s = s or ""
    if len(s) <= MAX_CAPTURE:
        return s
    return s[:MAX_CAPTURE] + "\n...<truncated>...\n"


def run(cmd: list[str]) -> tuple[int, str, str]:
    p = subprocess.run(cmd, cwd=str(REPO_ROOT), text=True, capture_output=True)
    return p.returncode, trunc(p.stdout), trunc(p.stderr)


def write_section(title: str, cmd: list[str], rc: int, out: str, err: str) -> None:
    with OUT.open("a", encoding="utf-8") as f:
        f.write(f"\n\n## {title}\n")
        f.write("\n### cmd\n```bash\n" + " ".join(cmd) + "\n```\n")
        f.write("\n### rc\n```text\n" + str(rc) + "\n```\n")
        f.write("\n### stdout\n```text\n" + out + "\n```\n")
        f.write("\n### stderr\n```text\n" + err + "\n```\n")


def main() -> int:
    OUT.write_text(
        "# markdown_to_micro_v2 robustness suite run log\n\n"
        "このログは Codex codespace 上で pytest と入力マトリクス診断を実行した結果です。\n"
        "（stdout/stderr は長すぎる場合切り詰めています）\n\n",
        encoding="utf-8",
    )

    steps: list[tuple[str, list[str]]] = [
        ("python --version", [sys.executable, "--version"]),
        ("sitegen import path check", [sys.executable, "-c", "import sitegen; print(sitegen.__file__)"]),
        ("pytest: existing + robustness", [sys.executable, "-m", "pytest", "-q",
                                          "tests/test_markdown_to_micro_v2.py",
                                          "tests/test_markdown_to_micro_v2_robustness.py"]),
        ("matrix diagnose (writes docs/robustness/matrix/*)", [sys.executable, "scripts/diagnose_markdown_to_micro_v2_matrix.py",
                                                               "--out", "docs/robustness/matrix",
                                                               "--season", "diag-season",
                                                               "--variant", "hina"]),
        ("git status (after)", ["git", "status", "-sb"]),
    ]

    overall_rc = 0
    for title, cmd in steps:
        rc, out, err = run(cmd)
        write_section(title, cmd, rc, out, err)
        if title.startswith("pytest") and rc != 0:
            overall_rc = 1
        if title.startswith("matrix") and rc != 0:
            overall_rc = 1

    # Also write quick pointers
    with OUT.open("a", encoding="utf-8") as f:
        f.write("\n\n## Outputs\n")
        f.write("- `docs/robustness/run_log.md`\n")
        f.write("- `docs/robustness/matrix/matrix_report.md`\n")
        f.write("- `docs/robustness/matrix/matrix_summary.json`\n")

    print(f"[DONE] wrote {OUT}")
    return overall_rc


if __name__ == "__main__":
    raise SystemExit(main())
