from pathlib import Path
import subprocess
import sys

import pytest

from scripts.markdown_to_micro_v2 import build_micro_store
from sitegen.micro_store import MicroStore


def _sample_markdown() -> str:
    return """intro

```text
Title One

First body line.
Second line with trailing spaces.   
```

```text
Title Two

Another body.
```
"""


def test_build_micro_store_writes_expected_layout(tmp_path: Path) -> None:
    input_md = tmp_path / "input.md"
    input_md.write_text(_sample_markdown(), encoding="utf-8")

    out_dir = tmp_path / "out"
    build_micro_store(
        input_path=input_md,
        out_dir=out_dir,
        season="nagi-sX",
        variant="hina",
        expected_blocks=2,
        extra_tags=["extra"],
        force=False,
    )

    store = MicroStore.load(out_dir)
    assert store.index["entity_ids"] == ["nagi-sX-ep01", "nagi-sX-ep02"]
    assert len(store.index["block_ids"]) == 2

    ep1 = store.entities_by_id["nagi-sX-ep01"]
    assert ep1["meta"]["title"] == "Title One"
    assert ep1["meta"]["summary"].startswith("First body line.")
    assert ep1["meta"]["tags"] == ["story", "episode", "nagi-sX", "extra"]
    assert ep1["relations"] == {"season": "nagi-sX", "index": 1}
    assert ep1["body"]["blockRefs"] == store.index["block_ids"][:1]

    block1 = store.resolve_block(store.index["block_ids"][0])
    assert block1["type"] == "Markdown"
    assert block1["source"] == "First body line.\nSecond line with trailing spaces."


def test_expected_blocks_mismatch_raises(tmp_path: Path) -> None:
    input_md = tmp_path / "input.md"
    input_md.write_text(_sample_markdown(), encoding="utf-8")

    out_dir = tmp_path / "out"
    with pytest.raises(SystemExit):
        build_micro_store(
            input_path=input_md,
            out_dir=out_dir,
            season="nagi-sX",
            variant="hina",
            expected_blocks=3,
            extra_tags=[],
            force=False,
        )


def test_cli_help_is_informative(tmp_path: Path) -> None:
    script_path = Path(__file__).resolve().parents[1] / "scripts" / "markdown_to_micro_v2.py"
    result = subprocess.run(
        [sys.executable, str(script_path), "--help"],
        capture_output=True,
        text=True,
        cwd=tmp_path,
        check=False,
    )

    assert result.returncode == 0
    assert "Convert markdown fences to micro store" in result.stdout


def test_cli_help_command_succeeds() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        [sys.executable, "scripts/markdown_to_micro_v2.py", "--help"],
        capture_output=True,
        text=True,
        cwd=repo_root,
        check=False,
    )

    assert result.returncode == 0, result.stderr
