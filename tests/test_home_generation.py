from pathlib import Path

import pytest
import yaml
from bs4 import BeautifulSoup

from sitegen.build import (
    BuildContext,
    build_detail,
    build_home,
    build_list,
    load_content_items,
)
from sitegen.models import ExperienceSpec


def _load_experiences() -> list[ExperienceSpec]:
    data = yaml.safe_load(Path("config/experiences.yaml").read_text(encoding="utf-8"))
    return [ExperienceSpec.model_validate(item) for item in data]


def _content_for_experience(spec: ExperienceSpec, items: list) -> list:
    targeted = [item for item in items if item.experience == spec.key]
    return targeted or items


@pytest.mark.parametrize("experience_key", ["hina", "immersive", "magazine"])
def test_home_is_rendered(tmp_path: Path, experience_key: str):
    out_root = tmp_path / "generated"
    ctx = BuildContext(src_root=Path("experience_src"), out_root=out_root)
    items = load_content_items(Path("content/posts"))

    exp = next(exp for exp in _load_experiences() if exp.key == experience_key)

    build_home(exp, ctx, items)
    build_list(exp, ctx, items)

    for item in _content_for_experience(exp, items):
        build_detail(exp, ctx, item)

    output_dir = out_root / (exp.output_dir or exp.key)
    home_path = output_dir / "index.html"
    assert home_path.exists(), f"Home page for {experience_key} should be generated"

    html = home_path.read_text(encoding="utf-8")
    assert "TODO:" not in html
    assert "EP01" in html

    soup = BeautifulSoup(html, "html.parser")
    links = soup.select("a[href]")
    hrefs = [link["href"] for link in links]
    assert any("posts/ep01/" in href for href in hrefs), "Detail link should be present"
