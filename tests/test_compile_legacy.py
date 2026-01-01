from pathlib import Path

from sitegen.compile_pipeline import build_posts
from sitegen.io_utils import read_json, write_json
from sitegen.micro_store import block_id_from_block


def test_build_posts_outputs_html(tmp_path: Path):
    micro_dir = tmp_path / "micro"
    blocks_dir = micro_dir / "blocks"
    entities_dir = micro_dir / "entities"
    blocks_dir.mkdir(parents=True)
    entities_dir.mkdir(parents=True)

    block_content = {"type": "RawHtml", "html": "<p>Hello</p>"}
    block_id = block_id_from_block(block_content)
    block = {"id": block_id, **block_content}
    write_json(blocks_dir / f"{block_id}.json", block)

    entity = {
        "id": "post1",
        "variant": "demo",
        "type": "Story",
        "meta": {"title": "Post 1", "summary": "Summary", "tags": []},
        "body": {"blockRefs": [block_id]},
        "relations": {},
    }
    write_json(entities_dir / "post1.json", entity)
    write_json(
        micro_dir / "index.json",
        {"entity_ids": ["post1"], "block_ids": [block_id]},
    )

    dist_dir = tmp_path / "dist"
    build_posts(micro_dir, dist_dir)

    result = read_json(dist_dir / "posts" / "post1.json")
    assert result["render"]["kind"] == "html"
    assert "<p>Hello</p>" in result["render"]["html"]
