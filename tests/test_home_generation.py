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
from sitegen.routing import SiteRouter


def _load_experiences() -> list[ExperienceSpec]:
    data = yaml.safe_load(Path("config/experiences.yaml").read_text(encoding="utf-8"))
    return [ExperienceSpec.model_validate(item) for item in data]


def _content_for_experience(spec: ExperienceSpec, items: list) -> list:
    targeted = [item for item in items if item.experience == spec.key]
    return targeted or items


def _build_experience_bundle(tmp_path: Path, experience_key: str):
    out_root = tmp_path / "generated"
    ctx = BuildContext(src_root=Path("experience_src"), out_root=out_root)
    items = load_content_items(Path("content/posts"))
    experiences = _load_experiences()
    router = SiteRouter(ctx, experiences, items)
    exp = next(exp for exp in experiences if exp.key == experience_key)

    for page in router.pages_for_experience(experience_key):
        if page.page_type == "home":
            build_home(exp, ctx, items, router=router, page_spec=page)
        elif page.page_type == "list":
            build_list(exp, ctx, items, router=router, page_spec=page)
        elif page.content:
            build_detail(
                exp, ctx, page.content, items, router=router, page_spec=page
            )
    router.render_aliases()

    targeted = [item for item in items if item.experience == exp.key] or items
    output_dir = out_root / (exp.output_dir or exp.key)
    return ctx, router, exp, output_dir, targeted


def _build_experience_output(tmp_path: Path, experience_key: str):
    _, _, _, output_dir, targeted = _build_experience_bundle(tmp_path, experience_key)
    return output_dir, targeted


@pytest.mark.parametrize("experience_key", ["hina", "immersive", "magazine"])
def test_home_is_rendered(tmp_path: Path, experience_key: str):
    output_dir, items = _build_experience_output(tmp_path, experience_key)

    home_path = output_dir / "index.html"
    assert home_path.exists(), f"Home page for {experience_key} should be generated"

    html = home_path.read_text(encoding="utf-8")
    soup = BeautifulSoup(html, "html.parser")
    assert soup.select_one("#about"), "About section should be present"
    assert soup.select_one("#episodes"), "Episodes section should be present"
    assert soup.select_one("#characters"), "Characters section should be present"
    episode_cards = soup.select("[data-episode-id]")
    assert len(episode_cards) >= 2, "Episodes should list multiple entries"


@pytest.mark.parametrize("experience_key", ["hina", "immersive", "magazine"])
def test_pages_include_viewport_and_shared_styles(tmp_path: Path, experience_key: str):
    output_dir, items = _build_experience_output(tmp_path, experience_key)
    detail_slug = next(item.content_id for item in items if item.page_type == "story")

    targets = [
        output_dir / "index.html",
        output_dir / "list" / "index.html",
        output_dir / "posts" / detail_slug / "index.html",
    ]

    for html_path in targets:
        html = html_path.read_text(encoding="utf-8")
        soup = BeautifulSoup(html, "html.parser")

        viewport = soup.find("meta", attrs={"name": "viewport"})
        assert viewport, f"{html_path} is missing viewport meta"
        assert "width=device-width" in viewport["content"]

        stylesheets = soup.find_all("link", rel=lambda value: value and "stylesheet" in value)
        hrefs = [link.get("href", "") for link in stylesheets]
        assert any("assets/base.css" in href for href in hrefs), "Shared base.css should be linked"


def test_generated_links_are_rooted_at_out_dir(tmp_path: Path):
    ctx, router, exp, output_dir, items = _build_experience_bundle(tmp_path, "hina")

    site_root = router.absolute_href_for_path(ctx.out_root)
    assert site_root.startswith("/"), "Site root href should be absolute"

    def _assert_rooted(hrefs: list[str], where: str):
        assert hrefs, f"{where} should contain at least one href"
        for href in hrefs:
            assert href.startswith(site_root), f"{where} href is not rooted: {href}"

    home_html = (output_dir / "index.html").read_text(encoding="utf-8")
    home = BeautifulSoup(home_html, "html.parser")
    _assert_rooted([a["href"] for a in home.select(".sg-nav-links a")], "home nav")
    _assert_rooted([a["href"] for a in home.select(".sg-actions a")], "home CTA")
    _assert_rooted([a["href"] for a in home.select("#episodes a")], "home episodes")

    list_html = (output_dir / "list" / "index.html").read_text(encoding="utf-8")
    listing = BeautifulSoup(list_html, "html.parser")
    _assert_rooted([a["href"] for a in listing.select(".sg-nav-links a")], "list nav")
    _assert_rooted([a["href"] for a in listing.select("[data-episode-id] a")], "list episodes")

    detail_slug = next(item.content_id for item in items if item.page_type == "story")
    detail_html = (output_dir / "posts" / detail_slug / "index.html").read_text(encoding="utf-8")
    detail = BeautifulSoup(detail_html, "html.parser")
    _assert_rooted([a["href"] for a in detail.select(".sg-nav-links a")], "detail nav")
