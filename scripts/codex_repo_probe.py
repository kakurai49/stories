"""Collect repository state for Codex visibility.

This script uses only the Python standard library. Running

    python scripts/codex_repo_probe.py

will regenerate ``docs/codex_repo_state.md`` (and optionally a JSON companion)
with deterministic, timestamp-free content summarizing git status, ignore
rules, artifact inventory, and build clues.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
from typing import Dict, Iterable, List, Optional, Tuple


def run_command(args: List[str], cwd: Optional[Path] = None) -> Dict[str, object]:
    """Run a command with subprocess.run and capture output without raising.

    Returns a dictionary containing the command, exit code, stdout, and stderr.
    """

    proc = subprocess.run(
        args,
        cwd=str(cwd) if cwd else None,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    return {
        "cmd": " ".join(args),
        "returncode": proc.returncode,
        "stdout": proc.stdout,
        "stderr": proc.stderr,
    }


def format_command_block(title: str, result: Dict[str, object]) -> str:
    """Format a command result as a Markdown subsection with a code block."""

    stdout = str(result.get("stdout") or "")
    stderr = str(result.get("stderr") or "")
    combined_output: str
    if stdout.strip() and stderr.strip():
        combined_output = f"{stdout.rstrip()}\n[stderr]\n{stderr.rstrip()}"
    elif stdout.strip():
        combined_output = stdout.rstrip()
    elif stderr.strip():
        combined_output = f"[stderr]\n{stderr.rstrip()}"
    else:
        combined_output = "(no output)"

    lines = [
        f"### {title}",
        "",
        f"- Command: `{result['cmd']}`",
        f"- Exit code: {result['returncode']}",
        "",
        "```",
        combined_output,
        "```",
        "",
    ]
    return "\n".join(lines)


def read_gitignore(repo_root: Path) -> str:
    path = repo_root / ".gitignore"
    if not path.exists():
        return "(no .gitignore found)"
    return path.read_text()


def summarize_artifacts(repo_root: Path) -> Dict[str, object]:
    """Inspect artifacts/ directory without reading file contents."""

    artifacts_dir = repo_root / "artifacts"
    summary: Dict[str, object] = {
        "exists": artifacts_dir.exists(),
        "errors": [],
        "file_count": 0,
        "total_size": 0,
        "top_entries": [],
    }

    if not artifacts_dir.exists():
        return summary

    entries: List[Tuple[str, Optional[int]]] = []
    for path in sorted(artifacts_dir.rglob("*")):
        if not path.is_file():
            continue
        rel_path = path.relative_to(repo_root).as_posix()
        try:
            size = path.stat().st_size
        except OSError as exc:  # pragma: no cover - defensive guard
            size = None
            summary["errors"].append(f"{rel_path}: {exc}")
        entries.append((rel_path, size))

    summary["file_count"] = len(entries)
    total_size = sum(size for _, size in entries if size is not None)
    summary["total_size"] = total_size
    summary["top_entries"] = entries[:200]
    return summary


def format_artifacts_block(summary: Dict[str, object]) -> str:
    lines = ["### artifacts/ inventory", "", "- Command: python os.walk summary", ""]
    if not summary["exists"]:
        lines.append("```")
        lines.append("artifacts/ does not exist")
        lines.append("```")
        lines.append("")
        return "\n".join(lines)

    lines.append("```")
    lines.append(f"Total files: {summary['file_count']}")
    lines.append(f"Total size (bytes): {summary['total_size']}")
    lines.append("Top entries (path, size in bytes):")
    for rel_path, size in summary["top_entries"]:
        size_display = "<unknown>" if size is None else str(size)
        lines.append(f"- {rel_path} :: {size_display}")
    if summary.get("errors"):
        lines.append("")
        lines.append("Errors:")
        for err in summary["errors"]:
            lines.append(f"- {err}")
    lines.append("```")
    lines.append("")
    return "\n".join(lines)


def list_content_micro(repo_root: Path) -> str:
    target = repo_root / "content" / "micro"
    if not target.exists():
        return "(content/micro does not exist)"
    entries = sorted(p.name for p in target.iterdir())
    return "\n".join(entries)


def try_ripgrep(repo_root: Path, keyword: str) -> Optional[List[str]]:
    """Try ripgrep for a keyword; return None if unavailable or failed."""

    command = ["rg", "--files-with-matches", keyword, str(repo_root)]
    result = run_command(command)
    if result["returncode"] != 0:
        return None
    stdout = str(result.get("stdout") or "")
    paths = [line.strip() for line in stdout.splitlines() if line.strip()]
    return sorted(paths)


def python_keyword_search(repo_root: Path, keyword: str) -> List[str]:
    """Fallback text search using the standard library only."""

    skip_dirs = {".git", "node_modules", "artifacts", "dist", "generated_v2"}
    matches: set[str] = set()
    keyword_lower = keyword.lower()

    for path in sorted(repo_root.rglob("*")):
        if path.is_dir():
            if path.name in skip_dirs:
                # Skip nested directories wholesale
                continue
            # Skip directories but keep walking; filtering handled by rglob order
            continue
        if not path.is_file():
            continue
        if any(part in skip_dirs for part in path.parts):
            continue
        try:
            text = path.read_text(errors="ignore")
        except OSError:
            continue
        if keyword_lower in text.lower():
            matches.add(path.relative_to(repo_root).as_posix())
    return sorted(matches)


def collect_keyword_hits(repo_root: Path, keywords: Iterable[str]) -> Dict[str, List[str]]:
    hits: Dict[str, List[str]] = {}
    for keyword in keywords:
        paths = try_ripgrep(repo_root, keyword)
        if paths is None:
            paths = python_keyword_search(repo_root, keyword)
        hits[keyword] = paths
    return hits


def format_keyword_block(hits: Dict[str, List[str]]) -> str:
    lines = ["### Repository keyword search", "", "- Command: rg (fallback to python walk)", "", "```"]
    for keyword in sorted(hits.keys()):
        lines.append(f"{keyword}:")
        paths = hits[keyword]
        if not paths:
            lines.append("  (no matches)")
            continue
        for path in paths:
            lines.append(f"  - {path}")
    lines.append("```")
    lines.append("")
    return "\n".join(lines)


def write_markdown_report(repo_root: Path, data: Dict[str, object]) -> None:
    docs_dir = repo_root / "docs"
    docs_dir.mkdir(parents=True, exist_ok=True)
    report_path = docs_dir / "codex_repo_state.md"

    sections: List[str] = ["# Codex Repository State", ""]

    # A) Git/Repo基本情報
    sections.append("## A) Git/Repo基本情報")
    sections.append(format_command_block("Repo root", data["git_root"]))
    sections.append(format_command_block("Branch", data["git_branch"]))
    sections.append(format_command_block("HEAD SHA", data["git_head"]))
    sections.append(format_command_block("git status -sb", data["git_status"]))
    sections.append(format_command_block("git remote -v", data["git_remote"]))

    # B) .gitignore と ignore判定根拠
    sections.append("## B) .gitignore と ignore判定根拠")
    sections.append(format_command_block(".gitignore", data["gitignore_cat"]))
    sections.append(format_command_block("git check-ignore -v targets", data["git_check_ignore"]))

    # C) artifacts の中身概要
    sections.append("## C) artifacts の中身概要")
    sections.append(format_artifacts_block(data["artifacts_summary"]))

    # D) ビルド経路の手掛かり
    sections.append("## D) ビルド経路の手掛かり")
    sections.append(format_command_block("python -m sitegen --help", data["sitegen_help"]))
    sections.append(format_command_block("content/micro listing", data["content_micro_ls"]))
    sections.append(format_keyword_block(data["keyword_hits"]))

    report_path.write_text("\n".join(sections))


def write_json_report(repo_root: Path, data: Dict[str, object]) -> None:
    docs_dir = repo_root / "docs"
    docs_dir.mkdir(parents=True, exist_ok=True)
    json_path = docs_dir / "codex_repo_state.json"

    json_data = {
        "git": {
            "root": data["git_root"],
            "branch": data["git_branch"],
            "head": data["git_head"],
            "status": data["git_status"],
            "remote": data["git_remote"],
        },
        "gitignore": data["gitignore_cat"],
        "check_ignore": data["git_check_ignore"],
        "artifacts": data["artifacts_summary"],
        "sitegen_help": data["sitegen_help"],
        "content_micro": data["content_micro_ls"],
        "keyword_hits": data["keyword_hits"],
    }

    # Prepare command blocks for JSON (stdout/stderr only, deterministic)
    def extract_output(block: Dict[str, object]) -> Dict[str, object]:
        return {
            "cmd": block.get("cmd"),
            "returncode": block.get("returncode"),
            "stdout": block.get("stdout"),
            "stderr": block.get("stderr"),
        }

    json_data["git"] = {k: extract_output(v) for k, v in data["git"].items()}
    json_data["gitignore"] = extract_output(data["gitignore_cat"])
    json_data["check_ignore"] = extract_output(data["git_check_ignore"])
    json_data["sitegen_help"] = extract_output(data["sitegen_help"])
    json_data["content_micro"] = extract_output(data["content_micro_ls"])

    json_path.write_text(json.dumps(json_data, indent=2, ensure_ascii=False))


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]

    git_root = run_command(["git", "rev-parse", "--show-toplevel"], cwd=repo_root)
    git_branch = run_command(["git", "branch", "--show-current"], cwd=repo_root)
    git_head = run_command(["git", "rev-parse", "--short", "HEAD"], cwd=repo_root)
    git_status = run_command(["git", "status", "-sb"], cwd=repo_root)
    git_remote = run_command(["git", "remote", "-v"], cwd=repo_root)

    gitignore_cat = run_command(["cat", ".gitignore"], cwd=repo_root)
    check_targets = [
        "artifacts/",
        "artifacts_bundle.zip",
        "generated_v2/",
        "dist/",
        "content/micro/",
        "nagi-s2/generated_v2/",
        "nagi-s3/generated_v2/",
    ]
    git_check_ignore = run_command(["git", "check-ignore", "-v", *check_targets], cwd=repo_root)

    artifacts_summary = summarize_artifacts(repo_root)

    sitegen_help = run_command(["python", "-m", "sitegen", "--help"], cwd=repo_root)
    content_micro_ls = run_command(["ls", "-1", "content/micro"], cwd=repo_root)

    keywords = ["artifacts", "--out", "generated_v2", "micro-store", "cli_build_site", "content/micro"]
    keyword_hits = collect_keyword_hits(repo_root, keywords)

    data: Dict[str, object] = {
        "git_root": git_root,
        "git_branch": git_branch,
        "git_head": git_head,
        "git_status": git_status,
        "git_remote": git_remote,
        "git": {
            "git_root": git_root,
            "git_branch": git_branch,
            "git_head": git_head,
            "git_status": git_status,
            "git_remote": git_remote,
        },
        "gitignore_cat": gitignore_cat,
        "git_check_ignore": git_check_ignore,
        "artifacts_summary": artifacts_summary,
        "sitegen_help": sitegen_help,
        "content_micro_ls": content_micro_ls,
        "keyword_hits": keyword_hits,
    }

    write_markdown_report(repo_root, data)

    try:
        write_json_report(repo_root, data)
    except Exception:
        # JSON output is optional; ignore failures while keeping the Markdown report.
        pass

    print(f"Wrote report to {repo_root / 'docs' / 'codex_repo_state.md'}")


if __name__ == "__main__":
    main()
