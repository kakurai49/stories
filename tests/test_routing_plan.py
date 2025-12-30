from pathlib import Path

import pytest
import yaml

from sitegen.build import BuildContext, load_content_items
from sitegen.models import ExperienceSpec
from sitegen.routing import SiteRouter
from sitegen.util_fs import ensure_dir


def _load_experiences() -> list[ExperienceSpec]:
    data = yaml.safe_load(Path("config/experiences.yaml").read_text(encoding="utf-8"))
    return [ExperienceSpec.model_validate(item) for item in data]


@pytest.fixture()
def router(tmp_path: Path) -> SiteRouter:
    ctx = BuildContext(src_root=Path("experience_src"), out_root=tmp_path / "generated")
    items = load_content_items(Path("content/posts"))
    experiences = _load_experiences()
    return SiteRouter(ctx, experiences, items)


def test_router_includes_all_hina_content(router: SiteRouter):
    hina_pages = {
        page.content.content_id
        for page in router.pages_for_experience("hina")
        if page.content
    }
    expected = {
        item.content_id for item in load_content_items(Path("content/posts"))
    }
    assert expected.issubset(hina_pages)


def test_router_renders_unicode_alias_redirect(router: SiteRouter, tmp_path: Path):
    hina_about = router.content_page("hina", "about-世界観")
    assert hina_about is not None

    ensure_dir(hina_about.out_file.parent)
    hina_about.out_file.write_text("<html></html>", encoding="utf-8")
    written = router.render_aliases()
    alias_file = tmp_path / "generated" / "hina" / "posts" / "about-世界観.html"
    assert alias_file in written

    html = alias_file.read_text(encoding="utf-8")
    assert 'http-equiv="refresh"' in html
    assert "about-世界観/" in html
