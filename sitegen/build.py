"""Build utilities for generated experiences."""

from __future__ import annotations

import json
import shutil
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape
from pydantic import ValidationError

from .compile_pipeline import CompiledStore, CompiledPost, compile_store_v2
from .models import ContentItem, ExperienceSpec
from .micro_store import MicroStore
from .patch_legacy import patch_legacy_pages
from .routes_gen import write_routes_payload
from .routing import PageSpec, SiteRouter, relative_href
from .shared_gen import generate_init_features_js, generate_switcher_assets
from .util_fs import ensure_dir


@dataclass
class BuildContext:
    """Configuration for building generated experiences."""

    src_root: Path
    out_root: Path
    routes_filename: str = "routes.json"
    shared_init_features: Path | None = None
    shared_assets_dir: Path | None = None
    build_info: dict | None = None
    build_label: str | None = None
    micro_css_path: Path | None = None
    _copied_assets: set[str] = field(default_factory=set, init=False, repr=False)

    @property
    def shared_templates_dir(self) -> Path:
        """Directory containing shared templates available to all experiences."""

        return Path(__file__).parent / "templates"

    @property
    def shared_experience_assets_dir(self) -> Path:
        """Assets shared across generated experiences."""

        return self.src_root / "shared" / "assets"

    def templates_dir(self, experience: ExperienceSpec) -> Path:
        """Return the template directory for the experience."""

        return self.src_root / experience.key / "templates"

    def assets_dir(self, experience: ExperienceSpec) -> Path:
        """Return the assets directory for the experience."""

        return self.src_root / experience.key / "assets"

    def copy_assets(self, experience: ExperienceSpec) -> Path:
        """Copy static assets for an experience once and return the output dir."""

        output_dir = self.output_dir(experience)
        destination = ensure_dir(output_dir / "assets")
        cache_key = experience.key
        if cache_key in self._copied_assets:
            return destination

        _copy_assets(self.shared_experience_assets_dir, destination)
        _copy_assets(self.assets_dir(experience), destination)
        self._copied_assets.add(cache_key)
        return destination

    def output_dir(self, experience: ExperienceSpec) -> Path:
        """Ensure and return the output directory for the experience."""

        output_dir = experience.output_dir or experience.key
        if not output_dir:
            raise ValueError(f"output_dir is required for experience '{experience.key}'")
        return ensure_dir(self.out_root / output_dir)

    @property
    def routes_path(self) -> Path:
        """Return the shared routes.json path for all experiences."""

        return self.out_root / self.routes_filename

    def shared_asset_href(self, filename: str, base: Path) -> str | None:
        """Compute a relative href to a shared asset if configured."""

        if not self.shared_assets_dir:
            return None
        return relative_href(self.shared_assets_dir / filename, base)

    def jinja_env(self, experience: ExperienceSpec) -> Environment:
        """Create a Jinja environment scoped to the experience templates."""

        template_dirs = [self.templates_dir(experience), self.shared_templates_dir]
        return Environment(
            loader=FileSystemLoader(template_dirs),
            autoescape=select_autoescape(["html", "jinja"]),
            trim_blocks=True,
            lstrip_blocks=True,
            undefined=StrictUndefined,
        )


def _copy_assets(source: Path, destination: Path) -> None:
    """Copy static assets into the destination directory."""

    if not source.exists():
        return

    for asset_path in source.rglob("*"):
        if asset_path.is_dir():
            continue
        relative = asset_path.relative_to(source)
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(asset_path, target)


def load_content_items(content_dir: Path) -> list[ContentItem]:
    """Load and validate content items from a directory."""

    if not content_dir.exists():
        raise FileNotFoundError(f"Content directory not found: {content_dir}")

    json_paths = sorted(content_dir.glob("*.json"))
    if not json_paths:
        raise SystemExit(f"No content files found in {content_dir}")

    items: list[ContentItem] = []
    for json_path in json_paths:
        try:
            payload = json.loads(json_path.read_text(encoding="utf-8"))
            items.append(ContentItem.model_validate(payload))
        except (json.JSONDecodeError, ValidationError) as exc:
            raise SystemExit(f"Invalid content file {json_path}: {exc}") from exc

    return items


def load_micro_store_v2(micro_store_dir: Path) -> MicroStore:
    """Load a micro store with strict validation for the v2 flow."""

    return MicroStore.load(micro_store_dir)


def _compiled_post_to_content_item(post: CompiledPost) -> ContentItem:
    meta = post.meta
    cta = meta.get("cta", {})
    payload = {
        "contentId": post.id,
        "experience": post.variant,
        "pageType": post.page_type,
        "title": meta.get("title") or "",
        "summary": meta.get("summary"),
        "role": meta.get("role"),
        "profile": meta.get("profile"),
        "ctaLabel": cta.get("label"),
        "ctaHref": cta.get("href"),
        "render": {"kind": "html", "html": post.html},
        "bodyHtml": post.html,
        "tags": meta.get("tags", []),
    }
    if "dataHref" in meta:
        payload["dataHref"] = meta["dataHref"]
    return ContentItem.model_validate(payload)


def _compiled_store_to_items(compiled: CompiledStore) -> list[ContentItem]:
    return [_compiled_post_to_content_item(post) for post in compiled.posts.values()]


def _content_for_experience(
    experience: ExperienceSpec, items: list[ContentItem]
) -> list[ContentItem]:
    """Return content targeted to the experience, or all items if none match."""

    targeted = [item for item in items if item.experience == experience.key]
    return targeted or items


def _group_content(
    experience: ExperienceSpec, items: list[ContentItem]
) -> dict[str, list[ContentItem]]:
    """Collect items by logical buckets for rendering."""

    targeted = _content_for_experience(experience, items)
    groups = {
        "episodes": [],
        "about_cards": [],
        "characters": [],
        "site_meta": [],
    }

    for item in targeted:
        if item.page_type == "story":
            groups["episodes"].append(item)
        elif item.page_type == "about":
            groups["about_cards"].append(item)
        elif item.page_type == "character":
            groups["characters"].append(item)
        elif item.page_type == "siteMeta":
            groups["site_meta"].append(item)

    return groups


def _page_type_counts(items: list[ContentItem]) -> dict[str, int]:
    return dict(Counter(item.page_type for item in items))


def _load_manifest_meta(experience: ExperienceSpec, ctx: BuildContext) -> dict:
    """Load manifest.json if present to enrich site metadata."""

    manifest_path = ctx.src_root / experience.key / "manifest.json"
    if not manifest_path.exists():
        return {}
    try:
        return json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def build_view_model_for_experience(
    experience: ExperienceSpec,
    ctx: BuildContext,
    items: list[ContentItem],
    *,
    base: Path,
    current_item: ContentItem | None = None,
    template_key: str = "home",
    router: SiteRouter | None = None,
    page_spec: PageSpec | None = None,
) -> dict:
    """Assemble a normalized view model for templates.

    Ensures all expected keys exist to satisfy StrictUndefined.
    """

    if router is None:
        raise ValueError("router is required to build the view model")

    output_dir = ctx.output_dir(experience)
    manifest_meta = _load_manifest_meta(experience, ctx)
    routes_href = relative_href(ctx.routes_path, base)

    home_href = router.href_for_page(router.home(experience.key), base)
    list_href = router.href_for_page(router.list_page(experience.key), base)

    groups = _group_content(experience, items)

    episodes: list[dict] = []
    for index, item in enumerate(groups["episodes"], start=1):
        detail_page = router.content_page(experience.key, item.content_id)
        episodes.append(
            {
                "id": item.content_id,
                "order": index,
                "title": item.title,
                "summary": item.summary or item.excerpt or "",
                "href": router.href_for_page(detail_page, base),
                "tags": item.tags,
                "data_href": item.data_href,
            }
        )

    about_cards: list[dict] = []
    for item in groups["about_cards"]:
        about_cards.append(
            {
                "id": item.content_id,
                "title": item.title,
                "summary": item.summary or item.excerpt or "",
                "profile": item.profile or "",
                "role": item.role or "",
                "tags": item.tags,
            }
        )

    characters: list[dict] = []
    for item in groups["characters"]:
        characters.append(
            {
                "id": item.content_id,
                "name": item.title,
                "role": item.role or "",
                "summary": item.summary or item.excerpt or "",
                "profile": item.profile or "",
                "tags": item.tags,
            }
        )

    site_meta_entry = groups["site_meta"][0] if groups["site_meta"] else None

    def _resolved_cta_href(raw_href: str | None) -> str:
        if not raw_href:
            return list_href
        path = Path(raw_href)
        if path.is_absolute() or "://" in raw_href:
            return raw_href
        if raw_href in router.content_ids(experience.key):
            return router.href_for_page(
                router.content_page(experience.key, raw_href), base
            )
        if raw_href.rstrip("/") == "list":
            return list_href
        href = relative_href(output_dir / raw_href, base)
        if raw_href.endswith("/") and not href.endswith("/"):
            href += "/"
        return href

    site_title = experience.name or manifest_meta.get("label") or experience.key
    site_description = manifest_meta.get("description") or experience.description or ""
    if site_meta_entry:
        site_title = site_meta_entry.title or site_title
        site_description = (
            site_meta_entry.summary or site_meta_entry.excerpt or site_description
        )
    og_title = manifest_meta.get("ogTitle") or site_title
    og_description = manifest_meta.get("ogDescription") or site_description
    hero_description = (
        (site_meta_entry.profile or site_meta_entry.summary or "")
        if site_meta_entry
        else (site_description or "")
    )
    hero_cta = {
        "href": _resolved_cta_href(getattr(site_meta_entry, "cta_href", None)),
        "label": getattr(site_meta_entry, "cta_label", "") or "一覧を見る",
    }

    nav_links = [
        {"href": home_href, "label": "ホーム"},
        {"href": list_href, "label": "一覧"},
        {"href": f"{home_href}#about", "label": "紹介"},
        {"href": f"{home_href}#episodes", "label": "12話"},
        {"href": f"{home_href}#characters", "label": "キャラクター"},
    ]

    return {
        "site": {
            "title": site_title,
            "description": site_description,
            "og": {"title": og_title, "description": og_description},
            "hero": {
                "eyebrow": site_meta_entry.role if site_meta_entry else "",
                "lede": hero_description,
                "cta": hero_cta,
            },
            "meta": {
                "id": site_meta_entry.content_id if site_meta_entry else "",
                "tags": site_meta_entry.tags if site_meta_entry else [],
            },
        },
        "episodes": episodes,
        "about_cards": about_cards,
        "about_sections": about_cards,
        "characters": characters,
        "nav": {
            "links": nav_links,
            "actions": [hero_cta],
        },
        "switcher": {
            "experience": experience.key,
            "template": template_key,
            "routes_href": routes_href,
            "content_id": current_item.content_id if current_item else "",
            "data_href": current_item.data_href if current_item else "",
        },
        "content_counts": {
            "total": sum(len(group) for group in groups.values()),
            "page_types": Counter(
                item.page_type for bucket in groups.values() for item in bucket
            ),
        },
    }


def build_view_model_for_experience_v2(
    experience: ExperienceSpec,
    ctx: BuildContext,
    compiled_store: CompiledStore,
    *,
    base: Path,
    compiled_items: list[ContentItem] | None = None,
    current_item: ContentItem | None = None,
    template_key: str = "home",
    router: SiteRouter | None = None,
    page_spec: PageSpec | None = None,
) -> dict:
    """Wrapper around build_view_model_for_experience for the v2 micro flow."""

    items = compiled_items or _compiled_store_to_items(compiled_store)
    return build_view_model_for_experience(
        experience,
        ctx,
        items,
        base=base,
        current_item=current_item,
        template_key=template_key,
        router=router,
        page_spec=page_spec,
    )


def build_home(
    experience: ExperienceSpec,
    ctx: BuildContext,
    items: list[ContentItem],
    *,
    router: SiteRouter,
    page_spec: PageSpec | None = None,
) -> List[Path]:
    """Render the home template for a generated experience.

    Returns a list of written paths to make it easy to tally outputs.
    """

    if experience.kind != "generated":
        return []

    template_name = (page_spec.template if page_spec else "home.jinja")
    template_path = ctx.templates_dir(experience) / template_name
    if not template_path.exists():
        raise FileNotFoundError(
            f"Home template not found for experience '{experience.key}': {template_path}"
        )

    env = ctx.jinja_env(experience)
    template = env.get_template(template_name)

    output_dir = ctx.output_dir(experience)
    ctx.copy_assets(experience)
    output_file = page_spec.out_file if page_spec else output_dir / "index.html"
    asset_prefix = relative_href(output_dir, output_file.parent)

    view_model = build_view_model_for_experience(
        experience,
        ctx,
        items,
        base=output_file.parent,
        template_key="home",
        router=router,
        page_spec=page_spec,
    )

    rendered = template.render(
        experience=experience,
        routes_href=view_model["switcher"]["routes_href"],
        asset_prefix=asset_prefix,
        switcher_css_href=ctx.shared_asset_href("switcher.css", output_file.parent),
        switcher_js_href=ctx.shared_asset_href("switcher.js", output_file.parent),
        template_key="home",
        view_model=view_model,
    )
    if ctx.build_label:
        rendered += f"\n<!-- sitegen build: {ctx.build_label} -->\n"
    output_file.write_text(rendered, encoding="utf-8")

    return [output_file]


def build_list(
    experience: ExperienceSpec,
    ctx: BuildContext,
    items: list[ContentItem],
    *,
    router: SiteRouter,
    page_spec: PageSpec | None = None,
) -> List[Path]:
    """Render the list template for a generated experience."""

    if experience.kind != "generated":
        return []

    template_name = page_spec.template if page_spec else "list.jinja"
    template_path = ctx.templates_dir(experience) / template_name
    if not template_path.exists():
        raise FileNotFoundError(
            f"List template not found for experience '{experience.key}': {template_path}"
        )

    output_dir = ctx.output_dir(experience)
    list_dir = ensure_dir(output_dir / "list")
    output_file = page_spec.out_file if page_spec else list_dir / "index.html"

    env = ctx.jinja_env(experience)
    template = env.get_template(template_name)

    ctx.copy_assets(experience)
    asset_prefix = relative_href(output_dir, output_file.parent)

    view_model = build_view_model_for_experience(
        experience,
        ctx,
        items,
        base=output_file.parent,
        template_key="list",
        router=router,
        page_spec=page_spec,
    )

    rendered = template.render(
        experience=experience,
        routes_href=view_model["switcher"]["routes_href"],
        asset_prefix=asset_prefix,
        switcher_css_href=ctx.shared_asset_href("switcher.css", output_file.parent),
        switcher_js_href=ctx.shared_asset_href("switcher.js", output_file.parent),
        template_key="list",
        view_model=view_model,
    )
    if ctx.build_label:
        rendered += f"\n<!-- sitegen build: {ctx.build_label} -->\n"
    output_file.write_text(rendered, encoding="utf-8")

    return [output_file]


def build_detail(
    experience: ExperienceSpec,
    ctx: BuildContext,
    item: ContentItem,
    items: Optional[list[ContentItem]] = None,
    *,
    router: SiteRouter,
    page_spec: PageSpec | None = None,
    micro_css_path: Path | None = None,
) -> List[Path]:
    """Render the detail template for a single content item."""

    if experience.kind != "generated":
        return []

    if items is None:
        items = [item]

    targeted = [content for content in items if content.experience == experience.key]
    if targeted and item.experience != experience.key:
        return []

    template_name = page_spec.template if page_spec else router.detail_template_for(experience, item.page_type)
    template_path = ctx.templates_dir(experience) / template_name
    if not template_path.exists():
        raise FileNotFoundError(
            f"Detail template not found for experience '{experience.key}': {template_path}"
        )

    output_dir = ctx.output_dir(experience)
    detail_dir = ensure_dir(output_dir / "posts" / item.content_id)
    output_file = page_spec.out_file if page_spec else detail_dir / "index.html"
    routes_href = relative_href(ctx.routes_path, output_file.parent)
    ctx.copy_assets(experience)
    asset_prefix = relative_href(output_dir, output_file.parent)
    micro_css_href = (
        relative_href(micro_css_path, output_file.parent) if micro_css_path else None
    )
    features_init_href = (
        relative_href(ctx.shared_init_features, output_file.parent)
        if ctx.shared_init_features
        else None
    )

    view_model = build_view_model_for_experience(
        experience,
        ctx,
        items,
        base=output_file.parent,
        current_item=item,
        template_key="detail",
        router=router,
        page_spec=page_spec,
    )

    env = ctx.jinja_env(experience)
    template = env.get_template(template_name)
    rendered = template.render(
        experience=experience,
        content=item,
        routes_href=routes_href,
        asset_prefix=asset_prefix,
        features_init_href=features_init_href,
        switcher_css_href=ctx.shared_asset_href("switcher.css", output_file.parent),
        switcher_js_href=ctx.shared_asset_href("switcher.js", output_file.parent),
        template_key="detail",
        nav_links=view_model["nav"]["links"],
        view_model=view_model,
        micro_css_href=micro_css_href,
    )
    if ctx.build_label:
        rendered += f"\n<!-- sitegen build: {ctx.build_label} -->\n"
    output_file.write_text(rendered, encoding="utf-8")

    return [output_file]


def build_site_from_micro_v2(
    *,
    micro_store_dir: Path,
    experiences: list[ExperienceSpec],
    ctx: BuildContext,
    compiled_store: CompiledStore | None = None,
    generate_shared: bool = False,
    generate_all: bool = False,
    legacy_base: Path | None = None,
) -> list[Path]:
    """Build generated experiences directly from a micro store (v2 flow)."""

    ensure_dir(ctx.out_root)
    store = load_micro_store_v2(micro_store_dir)
    compiled = compiled_store or compile_store_v2(store)
    items = _compiled_store_to_items(compiled)

    if generate_shared or generate_all:
        ctx.shared_init_features = generate_init_features_js(ctx.out_root)
    if generate_all:
        ctx.shared_assets_dir = ensure_dir(ctx.out_root / "shared")

    if compiled.css_text:
        ctx.micro_css_path = ctx.out_root / "micro.css"
        ctx.micro_css_path.write_text(compiled.css_text, encoding="utf-8")
        written_assets: list[Path] = [ctx.micro_css_path]
    else:
        written_assets = []

    router = SiteRouter(ctx, experiences, items)
    generated = [exp for exp in experiences if exp.kind == "generated"]
    if not generated:
        return []

    if ctx.build_label:
        ctx.build_label = f"{ctx.build_label} items={len(items)}"

    ctx.build_info = {
        "out": ".",
        "content": {"total": len(items), "pageTypes": _page_type_counts(items)},
        "experiences": [],
        "routesFilename": ctx.routes_filename,
        "microStore": str(micro_store_dir),
    }

    written: list[Path] = list(written_assets)
    for exp in generated:
        targeted = _content_for_experience(exp, items)
        ctx.build_info["experiences"].append(
            {
                "key": exp.key,
                "outputDir": str(ctx.output_dir(exp).relative_to(ctx.out_root)),
                "content": {
                    "total": len(targeted),
                    "pageTypes": _page_type_counts(targeted),
                },
            }
        )
        for page in router.pages_for_experience(exp.key):
            if page.page_type == "home":
                written.extend(build_home(exp, ctx, items, router=router, page_spec=page))
            elif page.page_type == "list":
                written.extend(build_list(exp, ctx, items, router=router, page_spec=page))
            elif page.content:
                written.extend(
                    build_detail(
                        exp,
                        ctx,
                        page.content,
                        items,
                        router=router,
                        page_spec=page,
                        micro_css_path=ctx.micro_css_path,
                    )
                )

    written.extend(router.render_aliases())

    if generate_all:
        routes_payload = router.routes_payload()
        route_targets = [ctx.routes_path]
        written.extend(write_routes_payload(routes_payload, route_targets))
        written.extend(generate_switcher_assets([Path("."), ctx.out_root]))
        written.extend(
            patch_legacy_pages(
                Path(legacy_base or "."),
                routes_href=str(Path(ctx.out_root.name) / ctx.routes_filename),
                css_href=str(Path(ctx.out_root.name) / "shared" / "switcher.css"),
                js_href=str(Path(ctx.out_root.name) / "shared" / "switcher.js"),
            )
        )

    build_info_path = ctx.out_root / "_buildinfo.json"
    ctx.build_info["writtenFiles"] = [
        str(path.relative_to(ctx.out_root))
        if path.is_relative_to(ctx.out_root)
        else str(path)
        for path in sorted(set(written))
    ]
    build_info_path.write_text(
        json.dumps(ctx.build_info, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    written.append(build_info_path)
    return written


__all__ = [
    "BuildContext",
    "build_view_model_for_experience",
    "build_view_model_for_experience_v2",
    "build_site_from_micro_v2",
    "load_micro_store_v2",
    "build_detail",
    "build_home",
    "build_list",
    "load_content_items",
]
