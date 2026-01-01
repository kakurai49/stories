import json
import re
import shlex
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple


def run_command(command, cwd: Optional[Path] = None, limit_lines: Optional[int] = None) -> Dict[str, object]:
    shell = isinstance(command, str)
    display = command if shell else " ".join(shlex.quote(str(part)) for part in command)
    try:
        completed = subprocess.run(
            command,
            shell=shell,
            cwd=str(cwd) if cwd else None,
            capture_output=True,
            text=True,
        )
    except Exception as exc:  # pragma: no cover
        return {
            "command": display,
            "exit_code": None,
            "stdout": "",
            "stderr": f"{type(exc).__name__}: {exc}",
        }

    stdout, stdout_note = truncate_lines(completed.stdout or "", limit_lines)
    stderr, stderr_note = truncate_lines(completed.stderr or "", limit_lines)
    result: Dict[str, object] = {
        "command": display,
        "exit_code": completed.returncode,
        "stdout": stdout,
        "stderr": stderr,
    }
    if stdout_note:
        result["stdout_note"] = stdout_note
    if stderr_note:
        result["stderr_note"] = stderr_note
    return result


def truncate_lines(text: str, limit: Optional[int]) -> Tuple[str, Optional[str]]:
    if limit is None:
        return text, None
    lines = text.splitlines()
    if len(lines) <= limit:
        return text, None
    truncated = "\n".join(lines[:limit])
    note = f"truncated to first {limit} lines (of {len(lines)})"
    return truncated, note


def parse_text_fences(content: str) -> Tuple[int, List[str]]:
    lines = content.splitlines()
    i = 0
    fences: List[List[str]] = []
    while i < len(lines):
        line = lines[i]
        if line.startswith("```text"):
            i += 1
            block: List[str] = []
            while i < len(lines) and not lines[i].startswith("```"):
                block.append(lines[i])
                i += 1
            fences.append(block)
        else:
            i += 1

    titles: List[str] = []
    for block in fences:
        title = next((ln.strip() for ln in block if ln.strip()), "")
        if title:
            titles.append(title)
    return len(fences), titles


def read_json(path: Path) -> Tuple[Optional[object], Optional[str]]:
    try:
        return json.loads(path.read_text()), None
    except Exception as exc:  # pragma: no cover
        return None, f"{type(exc).__name__}: {exc}"


def describe_output_dir(path: Path, top_n: int = 50) -> Dict[str, object]:
    if not path.exists():
        return {"exists": False}

    files = sorted([p for p in path.rglob("*") if p.is_file()], key=lambda p: str(p))
    total_size = 0
    entries: List[str] = []
    for file_path in files:
        try:
            size = file_path.stat().st_size
        except OSError:
            size = 0
        total_size += size
        entries.append(str(file_path))

    top_files = entries[:top_n]
    summary: Dict[str, object] = {
        "exists": True,
        "total_files": len(files),
        "total_size": total_size,
        "top_files": top_files,
    }
    if len(entries) > top_n:
        summary["note"] = f"showing first {top_n} files of {len(entries)}"
    return summary


def collect_baseline() -> Dict[str, object]:
    commands = [
        ("git rev-parse --show-toplevel", ["git", "rev-parse", "--show-toplevel"], None),
        ("git branch --show-current", ["git", "branch", "--show-current"], None),
        ("git rev-parse --short HEAD", ["git", "rev-parse", "--short", "HEAD"], None),
        ("git status -sb", ["git", "status", "-sb"], None),
        ("cat .gitignore", ["cat", ".gitignore"], None),
        ("git config --get core.excludesfile", ["git", "config", "--get", "core.excludesfile"], None),
        ("cat .git/info/exclude", ["cat", ".git/info/exclude"], None),
        ("git status --ignored", ["git", "status", "--ignored"], 200),
    ]
    results = []
    for _, cmd, limit in commands:
        results.append(run_command(cmd, limit_lines=limit))
    return {"commands": results}


def collect_markdown_checks() -> Dict[str, object]:
    default_paths = [Path("nagi-s2/nagi-s2.md"), Path("nagi-s3/nagi-s3.md")]
    found: List[Path] = []
    for candidate in default_paths:
        if candidate.exists():
            found.append(candidate)

    search_command = "git ls-files | grep -E \"nagi-s[23].*\\.md$\""
    search_result = run_command(search_command)
    if search_result.get("stdout"):
        for line in search_result["stdout"].splitlines():
            path = Path(line.strip())
            if path.exists() and path not in found:
                found.append(path)

    analyses = []
    for path in found:
        try:
            content = path.read_text()
        except Exception as exc:  # pragma: no cover
            analyses.append({"path": str(path), "error": f"{type(exc).__name__}: {exc}"})
            continue
        count, titles = parse_text_fences(content)
        analyses.append(
            {
                "path": str(path),
                "fence_count": count,
                "example_titles": titles[:2],
                "delta_from_expected": count - 13,
            }
        )

    return {
        "search_command": search_result,
        "files": analyses,
    }


def collect_script_and_spec_checks() -> Dict[str, object]:
    markdown_script = Path("scripts/markdown_to_micro_v2.py")
    help_result = run_command(["python", "scripts/markdown_to_micro_v2.py", "--help"])

    spec_path = Path("docs/micro_flow_spec_v2.md")
    schema_lines: List[Tuple[int, str]] = []
    if spec_path.exists():
        try:
            lines = spec_path.read_text().splitlines()
            keywords = ["schema", "Schema", "SCHEMA", "スキーマ", "キー", "key", "fields", "フィールド"]
            for idx, line in enumerate(lines, start=1):
                if any(keyword in line for keyword in keywords):
                    schema_lines.append((idx, line))
                if len(schema_lines) >= 40:
                    break
        except Exception as exc:  # pragma: no cover
            schema_lines = [(-1, f"{type(exc).__name__}: {exc}")]
    return {
        "script_exists": markdown_script.exists(),
        "help_result": help_result,
        "spec_path_exists": spec_path.exists(),
        "spec_schema_lines": schema_lines,
    }


def collect_micro_store_info() -> Dict[str, object]:
    root = Path("content/micro")
    index_info: Dict[str, object] = {"path": str(root / "index.json")}
    if (root / "index.json").exists():
        data, error = read_json(root / "index.json")
        if error:
            index_info["error"] = error
        else:
            index_info["keys"] = sorted(data.keys()) if isinstance(data, dict) else f"unexpected type: {type(data).__name__}"
    else:
        index_info["error"] = "missing"

    def summarize_json_dir(path: Path) -> List[Dict[str, object]]:
        if not path.exists():
            return [{"path": str(path), "error": "missing"}]
        summaries: List[Dict[str, object]] = []
        files = sorted(path.rglob("*.json"), key=lambda p: str(p))
        for file_path in files[:5]:
            entry: Dict[str, object] = {"path": str(file_path)}
            data, error = read_json(file_path)
            if error:
                entry["error"] = error
            elif isinstance(data, dict):
                entry["keys"] = sorted(data.keys())
                entry["has_meta"] = "meta" in data
                entry["has_relations"] = "relations" in data
                entry["has_body"] = "body" in data
            else:
                entry["error"] = f"unexpected type: {type(data).__name__}"
            summaries.append(entry)
        return summaries

    entities_info = summarize_json_dir(root / "entities")
    blocks_info = summarize_json_dir(root / "blocks")
    return {"index": index_info, "entities": entities_info, "blocks": blocks_info}


def collect_sitegen_checks() -> Dict[str, object]:
    help_commands = [
        ["python", "-m", "sitegen", "--help"],
        ["python", "-m", "sitegen", "build", "--help"],
        ["python", "-m", "sitegen.cli_build_site", "--help"],
    ]
    help_results = [run_command(cmd) for cmd in help_commands]

    probe_dir = Path("artifacts/_probe_build_out")
    trackable_dir = Path("_probe_build_out_trackable")
    for path in [probe_dir, trackable_dir]:
        if path.exists():
            import shutil

            shutil.rmtree(path, ignore_errors=True)

    build_command = [
        "python",
        "-m",
        "sitegen.cli_build_site",
        "--micro-store",
        "content/micro",
        "--experiences",
        "config/experiences.yaml",
        "--src",
        "experience_src",
        "--out",
        str(probe_dir),
        "--shared",
        "--deterministic",
        "--check",
    ]
    probe_build_result = run_command(build_command)
    probe_dir_summary = describe_output_dir(probe_dir)
    probe_check_ignore = run_command(["git", "check-ignore", "-v", str(probe_dir)])

    trackable_command = build_command.copy()
    trackable_command[-4] = str(trackable_dir)
    trackable_build_result = run_command(trackable_command)
    trackable_check_ignore = run_command(["git", "check-ignore", "-v", str(trackable_dir)])
    trackable_status = run_command(["git", "status", "-sb"])

    if trackable_dir.exists():
        import shutil

        shutil.rmtree(trackable_dir, ignore_errors=True)

    return {
        "help_results": help_results,
        "probe_build": probe_build_result,
        "probe_dir_summary": probe_dir_summary,
        "probe_check_ignore": probe_check_ignore,
        "trackable_build": trackable_build_result,
        "trackable_check_ignore": trackable_check_ignore,
        "trackable_status": trackable_status,
    }


def collect_tests() -> Dict[str, object]:
    commands = [
        ["python", "-m", "pytest", "-q", "tests/test_micro_build_site_v2.py"],
        ["python", "-m", "pytest", "-q", "tests/test_micro_flow_e2e.py"],
        ["python", "-m", "pytest", "-q", "tests/test_snapshot_check_mode.py"],
        ["python", "-m", "pytest", "-q"],
    ]
    results = [run_command(cmd) for cmd in commands]

    verify_script = Path("scripts/verify_sitegen_flow.sh")
    verify_result = None
    if verify_script.exists():
        verify_result = run_command(["bash", str(verify_script)])

    failure_summary: List[Dict[str, object]] = []
    for res in results:
        if res.get("exit_code") not in (0, None):
            failure_summary.extend(extract_failure_lines(res))
    if verify_result and verify_result.get("exit_code") not in (0, None):
        failure_summary.extend(extract_failure_lines(verify_result))

    artifacts = summarize_test_artifacts()
    return {
        "pytest_results": results,
        "verify_result": verify_result,
        "failures": failure_summary,
        "artifacts": artifacts,
    }


def extract_failure_lines(result: Dict[str, object]) -> List[Dict[str, str]]:
    combined = f"{result.get('stdout', '')}\n{result.get('stderr', '')}"
    lines = combined.splitlines()
    picked: List[str] = []
    for line in lines:
        if line.startswith("FAILED") or line.startswith("E   ") or "FAILED" in line or "ERROR" in line:
            picked.append(line)
        if len(picked) >= 20:
            break
    return [{"command": result.get("command", ""), "line": text} for text in picked]


def summarize_test_artifacts() -> Dict[str, object]:
    def count_files(path: Path) -> int:
        return sum(1 for _ in path.rglob("*")) if path.exists() else 0

    return {
        "playwright_report_files": count_files(Path("playwright-report")),
        "test_results_files": count_files(Path("test-results")),
    }


def render_command_result(result: Dict[str, object]) -> str:
    parts = [f"- `{result.get('command', '')}` (exit code: {result.get('exit_code')})"]
    if result.get("stdout"):
        parts.append("  - stdout:\n``````\n" + result["stdout"] + "\n``````")
    if result.get("stderr"):
        parts.append("  - stderr:\n``````\n" + result["stderr"] + "\n``````")
    if result.get("stdout_note"):
        parts.append(f"  - note: {result['stdout_note']}")
    if result.get("stderr_note"):
        parts.append(f"  - note: {result['stderr_note']}")
    return "\n".join(parts)


def render_markdown(data: Dict[str, object]) -> str:
    lines: List[str] = []
    lines.append("# Sitegen v2 diagnosis report")

    lines.append("\n## A) Baseline")
    for result in data["baseline"]["commands"]:
        lines.append(render_command_result(result))

    lines.append("\n## B) 入力Markdownの実在とフェンス数")
    search_command = data["markdown"]["search_command"]
    lines.append(render_command_result(search_command))
    for entry in data["markdown"]["files"]:
        lines.append(f"- {entry['path']}")
        if "error" in entry:
            lines.append(f"  - error: {entry['error']}")
            continue
        lines.append(f"  - ```text フェンス数: {entry['fence_count']} (expected 13, delta {entry['delta_from_expected']})")
        if entry.get("example_titles"):
            lines.append("  - 先頭タイトル例:")
            for title in entry["example_titles"]:
                lines.append(f"    - {title}")

    lines.append("\n## C) 既存スクリプト/仕様の確認")
    script_spec = data["script_spec"]
    lines.append(f"- scripts/markdown_to_micro_v2.py exists: {script_spec['script_exists']}")
    lines.append(render_command_result(script_spec["help_result"]))
    lines.append(f"- docs/micro_flow_spec_v2.md exists: {script_spec['spec_path_exists']}")
    if script_spec["spec_schema_lines"]:
        lines.append("- スキーマ説明っぽい行 (最大40行):")
        for idx, line in script_spec["spec_schema_lines"]:
            lines.append(f"  - L{idx}: {line}")

    lines.append("\n## D) micro store の実態")
    micro = data["micro_store"]
    lines.append(f"- index.json: {micro['index']}")
    lines.append("- entities (最大5件):")
    for entry in micro["entities"]:
        lines.append(f"  - {json.dumps(entry, ensure_ascii=False)}")
    lines.append("- blocks (最大5件):")
    for entry in micro["blocks"]:
        lines.append(f"  - {json.dumps(entry, ensure_ascii=False)}")

    lines.append("\n## E) sitegen build スモークテスト")
    for help_result in data["sitegen"]["help_results"]:
        lines.append(render_command_result(help_result))
    lines.append("- READMEの v2 コマンド実行:")
    lines.append(render_command_result(data["sitegen"]["probe_build"]))
    lines.append(f"- 出力先 artifacts/_probe_build_out: {json.dumps(data['sitegen']['probe_dir_summary'], ensure_ascii=False)}")
    lines.append(render_command_result(data["sitegen"]["probe_check_ignore"]))

    lines.append("\n## F) 出力先の対照実験 (trackable)")
    lines.append(render_command_result(data["sitegen"]["trackable_build"]))
    lines.append(render_command_result(data["sitegen"]["trackable_check_ignore"]))
    lines.append(render_command_result(data["sitegen"]["trackable_status"]))

    lines.append("\n## G) テスト実行")
    for result in data["tests"]["pytest_results"]:
        lines.append(render_command_result(result))
    if data["tests"]["verify_result"]:
        lines.append(render_command_result(data["tests"]["verify_result"]))
    if data["tests"]["failures"]:
        lines.append("- 失敗テスト要約:")
        for failure in data["tests"]["failures"]:
            lines.append(f"  - {failure['command']}: {failure['line']}")
    lines.append(f"- 生成物カウント: {json.dumps(data['tests']['artifacts'], ensure_ascii=False)}")

    return "\n".join(lines) + "\n"


def main() -> int:
    baseline = collect_baseline()
    markdown_checks = collect_markdown_checks()
    script_spec = collect_script_and_spec_checks()
    micro_store = collect_micro_store_info()
    sitegen = collect_sitegen_checks()
    tests = collect_tests()

    md = render_markdown(
        {
            "baseline": baseline,
            "markdown": markdown_checks,
            "script_spec": script_spec,
            "micro_store": micro_store,
            "sitegen": sitegen,
            "tests": tests,
        }
    )

    docs_dir = Path("docs")
    docs_dir.mkdir(parents=True, exist_ok=True)
    output_path = docs_dir / "codex_sitegen_diagnosis_v2.md"
    output_path.write_text(md)
    sys.stdout.write(f"wrote {output_path}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
