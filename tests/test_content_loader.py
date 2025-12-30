from pathlib import Path

import pytest

from sitegen.build import load_content_items


def test_load_content_items_success():
    items = load_content_items(Path("content/posts"))

    assert items, "Content loader should return at least one item"
    first = items[0]
    assert first.content_id
    assert first.title
    assert first.render


def test_load_content_items_empty_dir(tmp_path: Path):
    empty_dir = tmp_path / "posts"
    empty_dir.mkdir()

    with pytest.raises(SystemExit):
        load_content_items(empty_dir)
