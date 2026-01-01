from pathlib import Path

import pytest

from sitegen.io_utils import write_json
from sitegen.micro_store import MicroStore, block_id_from_block


def _write_valid_block(blocks_dir: Path, content: dict) -> str:
    block_id = block_id_from_block(content)
    write_json(blocks_dir / f"{block_id}.json", {"id": block_id, **content})
    return block_id


def test_load_requires_index(tmp_path: Path) -> None:
    micro_dir = tmp_path / "micro"
    (micro_dir / "blocks").mkdir(parents=True)
    (micro_dir / "entities").mkdir(parents=True)

    with pytest.raises(FileNotFoundError):
        MicroStore.load(micro_dir)


def test_load_validates_block_references(tmp_path: Path) -> None:
    micro_dir = tmp_path / "micro"
    blocks_dir = micro_dir / "blocks"
    entities_dir = micro_dir / "entities"
    blocks_dir.mkdir(parents=True)
    entities_dir.mkdir(parents=True)

    block_id = _write_valid_block(blocks_dir, {"type": "Paragraph", "inlines": []})
    write_json(
        entities_dir / "post1.json",
        {
            "id": "post1",
            "variant": "demo",
            "type": "story",
            "meta": {"title": "Post 1", "summary": "Summary", "tags": []},
            "body": {"blockRefs": ["missing-block"]},
            "relations": {},
        },
    )
    write_json(
        micro_dir / "index.json",
        {"entity_ids": ["post1"], "block_ids": [block_id]},
    )

    with pytest.raises(KeyError):
        MicroStore.load(micro_dir)


def test_iter_posts_filters_by_variant(tmp_path: Path) -> None:
    micro_dir = tmp_path / "micro"
    blocks_dir = micro_dir / "blocks"
    entities_dir = micro_dir / "entities"
    blocks_dir.mkdir(parents=True)
    entities_dir.mkdir(parents=True)

    shared_block = _write_valid_block(blocks_dir, {"type": "Paragraph", "inlines": []})
    write_json(
        entities_dir / "p1.json",
        {
            "id": "p1",
            "variant": "alpha",
            "type": "story",
            "meta": {"title": "Post 1", "summary": "", "tags": []},
            "body": {"blockRefs": [shared_block]},
            "relations": {},
        },
    )
    write_json(
        entities_dir / "p2.json",
        {
            "id": "p2",
            "variant": "beta",
            "type": "story",
            "meta": {"title": "Post 2", "summary": "", "tags": []},
            "body": {"blockRefs": [shared_block]},
            "relations": {},
        },
    )
    write_json(
        micro_dir / "index.json",
        {"entity_ids": ["p1", "p2"], "block_ids": [shared_block]},
    )

    store = MicroStore.load(micro_dir)
    assert [entity["id"] for entity in store.iter_posts()] == ["p1", "p2"]
    assert [entity["id"] for entity in store.iter_posts(variant="alpha")] == ["p1"]
