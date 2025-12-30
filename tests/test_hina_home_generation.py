from pathlib import Path

import pytest
import yaml
from bs4 import BeautifulSoup

from sitegen.build import BuildContext, build_detail, build_home, build_list, load_content_items
from sitegen.models import ExperienceSpec


def _load_experiences() -> list[ExperienceSpec]:
    data = yaml.safe_load(Path("config/experiences.yaml").read_text(encoding="utf-8"))
    return [ExperienceSpec.model_validate(item) for item in data]


@pytest.fixture()
def hina_spec() -> ExperienceSpec:
    return next(exp for exp in _load_experiences() if exp.key == "hina")


def test_hina_home_is_rendered(tmp_path: Path, hina_spec: ExperienceSpec):
    out_root = tmp_path / "generated"
    ctx = BuildContext(src_root=Path("experience_src"), out_root=out_root)
    items = load_content_items(Path("content/posts"))

    build_home(hina_spec, ctx, items)
    build_list(hina_spec, ctx, items)
    for item in items:
        build_detail(hina_spec, ctx, item)

    output_dir = out_root / (hina_spec.output_dir or hina_spec.key)
    home_path = output_dir / "index.html"
    assert home_path.exists(), "Home page should be generated"

    html = home_path.read_text(encoding="utf-8")
    assert "TODO:" not in html

    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select("li.sg-card")
    assert cards, "At least one content card should be rendered"

    first_slug = items[0].content_id
    link = soup.select_one(f"a[href*='{first_slug}']")
    assert link, "Detail link for the first post should be present"
