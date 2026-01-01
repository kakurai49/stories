from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPO_ROOT / "scripts" / "markdown_to_micro_v2.py"

BLK_PREFIX = "blk_"


def _run_cli(*args: str) -> subprocess.CompletedProcess[str]:
    assert SCRIPT.exists(), f"missing: {SCRIPT}"
    cmd = [sys.executable, str(SCRIPT), *args]
    return subprocess.run(cmd, cwd=str(REPO_ROOT), text=True, capture_output=True)


def _read_json(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))


def _make_md_text_fences(blocks: list[str]) -> str:
    out: list[str] = []
    for b in blocks:
        out.append("```text\n" + b.rstrip("\n") + "\n```\n")
    return "\n".join(out)


def _dir_digest(root: Path) -> str:
    h = hashlib.sha256()
    files = sorted([p for p in root.rglob("*") if p.is_file()])
    for p in files:
        rel = p.relative_to(root).as_posix().encode("utf-8")
        h.update(rel)
        h.update(b"\0")
        h.update(p.read_bytes())
        h.update(b"\0")
    return h.hexdigest()


def test_help_exits_successfully() -> None:
    proc = _run_cli("--help")
    assert proc.returncode == 0, f"stdout:\n{proc.stdout}\nstderr:\n{proc.stderr}"
    # keep help informative
    assert "--input" in proc.stdout
    assert "--out" in proc.stdout
    assert "--season" in proc.stdout
    assert "--expected-blocks" in proc.stdout


def test_basic_valid_input_generates_store(tmp_path: Path) -> None:
    season = "test-season"
    blocks = [
        "Title A\nHello world.\nLine2",
        "Title B\n\nBody B line 1\nBody B line 2",
    ]
    md = _make_md_text_fences(blocks)
    inp = tmp_path / "input.md"
    inp.write_text(md, encoding="utf-8")

    out_dir = tmp_path / "store"
    proc = _run_cli(
        "--input", str(inp),
        "--out", str(out_dir),
        "--season", season,
        "--variant", "hina",
        "--expected-blocks", "2",
        "--tag", "extra1",
        "--tag", "extra2",
        "--force",
    )
    assert proc.returncode == 0, f"stdout:\n{proc.stdout}\nstderr:\n{proc.stderr}"

    assert (out_dir / "blocks").is_dir()
    assert (out_dir / "entities").is_dir()
    assert (out_dir / "index.json").is_file()

    blocks_dir = out_dir / "blocks"
    entities_dir = out_dir / "entities"

    # entities should be numbered
    assert (entities_dir / f"{season}-ep01.json").is_file()
    assert (entities_dir / f"{season}-ep02.json").is_file()

    ent1 = _read_json(entities_dir / f"{season}-ep01.json")
    assert ent1.get("id") == f"{season}-ep01"
    assert ent1.get("variant") == "hina"

    meta = ent1.get("meta") or {}
    assert meta.get("title") == "Title A"
    summary = meta.get("summary")
    assert isinstance(summary, str)
    assert 0 < len(summary) <= 140
    assert "\n" not in summary

    tags = meta.get("tags")
    assert isinstance(tags, list)
    for required in ("story", "episode", season, "extra1", "extra2"):
        assert required in tags

    relations = ent1.get("relations") or {}
    assert relations.get("season") == season
    assert relations.get("index") == 1

    body = ent1.get("body") or {}
    refs = body.get("blockRefs")
    assert isinstance(refs, list) and len(refs) == 1
    blk_id = refs[0]
    assert isinstance(blk_id, str) and blk_id.startswith(BLK_PREFIX) and len(blk_id) == 44

    blk_path = blocks_dir / f"{blk_id}.json"
    assert blk_path.is_file()

    blk = _read_json(blk_path)
    assert blk.get("id") == blk_id
    # schema flexibility: either source or html should exist
    assert ("source" in blk) or ("html" in blk)


def test_title_extraction_skips_leading_blank_lines(tmp_path: Path) -> None:
    season = "test-season"
    md = "```text\n\n\n  \t\nReal Title\nBody\n```\n"
    inp = tmp_path / "input.md"
    inp.write_text(md, encoding="utf-8")

    out_dir = tmp_path / "store"
    proc = _run_cli(
        "--input", str(inp),
        "--out", str(out_dir),
        "--season", season,
        "--variant", "hina",
        "--expected-blocks", "1",
        "--force",
    )
    assert proc.returncode == 0, f"stdout:\n{proc.stdout}\nstderr:\n{proc.stderr}"
    ent = _read_json(out_dir / "entities" / f"{season}-ep01.json")
    assert (ent.get("meta") or {}).get("title") == "Real Title"


def test_expected_blocks_mismatch_is_error(tmp_path: Path) -> None:
    season = "test-season"
    md = _make_md_text_fences(["Title\nBody"])
    inp = tmp_path / "input.md"
    inp.write_text(md, encoding="utf-8")

    out_dir = tmp_path / "store"
    proc = _run_cli(
        "--input", str(inp),
        "--out", str(out_dir),
        "--season", season,
        "--variant", "hina",
        "--expected-blocks", "2",  # mismatch
        "--force",
    )
    assert proc.returncode != 0
    msg = (proc.stdout + "\n" + proc.stderr).lower()
    assert msg.strip() != ""


def test_no_text_fences_is_error(tmp_path: Path) -> None:
    season = "test-season"
    inp = tmp_path / "input.md"
    inp.write_text("no fences here\n", encoding="utf-8")
    out_dir = tmp_path / "store"

    proc = _run_cli(
        "--input", str(inp),
        "--out", str(out_dir),
        "--season", season,
        "--variant", "hina",
        "--expected-blocks", "1",
        "--force",
    )
    assert proc.returncode != 0
    msg = (proc.stdout + "\n" + proc.stderr).lower()
    assert msg.strip() != ""


def test_refuses_overwrite_without_force(tmp_path: Path) -> None:
    season = "test-season"
    md = _make_md_text_fences(["Title\nBody"])
    inp = tmp_path / "input.md"
    inp.write_text(md, encoding="utf-8")
    out_dir = tmp_path / "store"

    proc1 = _run_cli(
        "--input", str(inp),
        "--out", str(out_dir),
        "--season", season,
        "--variant", "hina",
        "--expected-blocks", "1",
        "--force",
    )
    assert proc1.returncode == 0

    proc2 = _run_cli(
        "--input", str(inp),
        "--out", str(out_dir),
        "--season", season,
        "--variant", "hina",
        "--expected-blocks", "1",
        # no --force
    )
    assert proc2.returncode != 0
    msg = (proc2.stdout + "\n" + proc2.stderr).lower()
    assert msg.strip() != ""


def test_deterministic_output_for_same_input(tmp_path: Path) -> None:
    season = "test-season"
    blocks = ["Title A\nBody A", "Title B\nBody B"]
    md = _make_md_text_fences(blocks)
    inp = tmp_path / "input.md"
    inp.write_text(md, encoding="utf-8")

    out1 = tmp_path / "out1"
    out2 = tmp_path / "out2"

    p1 = _run_cli(
        "--input", str(inp),
        "--out", str(out1),
        "--season", season,
        "--variant", "hina",
        "--expected-blocks", "2",
        "--force",
    )
    assert p1.returncode == 0, f"{p1.stdout}\n{p1.stderr}"

    p2 = _run_cli(
        "--input", str(inp),
        "--out", str(out2),
        "--season", season,
        "--variant", "hina",
        "--expected-blocks", "2",
        "--force",
    )
    assert p2.returncode == 0, f"{p2.stdout}\n{p2.stderr}"

    assert _dir_digest(out1) == _dir_digest(out2)


def test_crlf_input_does_not_crash(tmp_path: Path) -> None:
    season = "test-season"
    md = "```text\r\nTitle\r\nBody line 1\r\nBody line 2\r\n```\r\n"
    inp = tmp_path / "input.md"
    inp.write_bytes(md.encode("utf-8"))

    out_dir = tmp_path / "store"
    proc = _run_cli(
        "--input", str(inp),
        "--out", str(out_dir),
        "--season", season,
        "--variant", "hina",
        "--expected-blocks", "1",
        "--force",
    )
    assert proc.returncode == 0, f"stdout:\n{proc.stdout}\nstderr:\n{proc.stderr}"
