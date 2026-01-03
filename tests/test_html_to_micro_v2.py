from __future__ import annotations

import hashlib
from pathlib import Path

from scripts.html_to_micro_v2 import BuildOptions, build_micro_store_from_html
from sitegen.compile_pipeline import compile_store_v2
from sitegen.micro_store import MicroStore


def _hash_dir(root: Path) -> dict[str, str]:
    hashes: dict[str, str] = {}
    for path in sorted(root.rglob("*")):
        if path.is_file():
            rel = path.relative_to(root)
            hashes[str(rel)] = hashlib.sha256(path.read_bytes()).hexdigest()
    return hashes


def _run_conversion(out_dir: Path) -> MicroStore:
    build_micro_store_from_html(
        BuildOptions(
            input_path=Path("etc/index.html"),
            out_dir=out_dir,
            entity_id="etc-home",
            variant="etc",
            page_type="page",
            force=True,
        )
    )
    return MicroStore.load(out_dir)


def test_html_to_micro_v2_roundtrip(tmp_path: Path) -> None:
    out_dir = tmp_path / "micro"
    store = _run_conversion(out_dir)

    assert store.index["entity_ids"] == ["etc-home"]
    assert store.index["block_ids"], "block ids should be recorded in index"

    compiled = compile_store_v2(store)
    assert "etc-home" in compiled.posts
    assert compiled.posts["etc-home"].html.startswith("<"), "compiled HTML should be emitted"
    assert compiled.css_text.strip(), "micro.css should be produced"


def test_html_to_micro_v2_is_deterministic(tmp_path: Path) -> None:
    out1 = tmp_path / "run1"
    out2 = tmp_path / "run2"

    store1 = _run_conversion(out1)
    store2 = _run_conversion(out2)

    hashes1 = _hash_dir(out1)
    hashes2 = _hash_dir(out2)

    assert hashes1 == hashes2, "micro store outputs should be identical across runs"

    html1 = compile_store_v2(store1).posts["etc-home"].html
    html2 = compile_store_v2(store2).posts["etc-home"].html
    assert html1 == html2, "compiled HTML should be deterministic"
