from pathlib import Path

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
