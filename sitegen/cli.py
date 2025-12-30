"""Command-line interface for sitegen."""

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Iterable, Literal, Optional

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .build import (
    BuildContext,
    build_detail,
    build_home,
    build_list,
    _content_for_experience,
    load_content_items,
)
from .shared_gen import generate_init_features_js, generate_switcher_assets
from .routes_gen import build_routes_payload, write_routes_payload
from .models import (
    ContentItem,
    ExperienceSpec,
    ExperimentPlan,
    IAPlan,
    IASection,
    IATemplateSpec,
)
from .patch_legacy import patch_legacy_pages
from .util_fs import ensure_dir, write_text


def _experiment_plan_to_markdown(plan: ExperimentPlan) -> str:
    """Render an ExperimentPlan as a simple Markdown document."""
    lines: list[str] = []
    lines.append(f"# Experiment Plan: {plan.name}")
    if plan.description:
        lines.append("")
        lines.append(plan.description)
    lines.append("")

    for template in plan.templates:
        lines.append(f"## {template.key} – {template.template_name}")
        if template.summary:
            lines.append("")
            lines.append(template.summary)
        lines.append("")

        lines.append("### Metrics")
        if template.metrics:
            for metric in template.metrics:
                parts: list[str] = [f"- **{metric.name}**"]
                details: list[str] = []
                if metric.description:
                    details.append(metric.description)
                if metric.target:
                    details.append(f"Target: {metric.target}")
                if details:
                    parts[-1] += f": {' | '.join(details)}"
                lines.extend(parts)
        else:
            lines.append("- None specified.")
        lines.append("")

        lines.append("### Events")
        if template.events:
            for event in template.events:
                lines.append(f"- **{event.name}**")
                if event.when:
                    lines.append(f"  - When: {event.when}")
                if event.properties:
                    props = ", ".join(event.properties)
                    lines.append(f"  - Properties: {props}")
        else:
            lines.append("- None specified.")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def _load_experiment_plan(path: Path) -> ExperimentPlan:
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return ExperimentPlan.model_validate(data)


def _load_ia_plan(path: Path) -> IAPlan:
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return IAPlan.model_validate(data)


def _handle_export_docs(args: argparse.Namespace) -> None:
    input_path = Path(args.input)
    output_path = Path(args.output)

    plan = _load_experiment_plan(input_path)
    output = _experiment_plan_to_markdown(plan)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(output, encoding="utf-8")


def _load_experiences(path: Path) -> list[ExperienceSpec]:
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or []
    if not isinstance(data, list):
        raise SystemExit("experiences.yaml must contain a list of experiences.")
    try:
        return [ExperienceSpec.model_validate(item) for item in data]
    except ValidationError as exc:
        raise SystemExit(f"Invalid experience spec in {path}: {exc}") from exc


def _load_content_item(path: Path) -> ContentItem:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return ContentItem.model_validate(payload)


class ScaffoldExperience(BaseModel):
    """Lightweight experience spec used for scaffolding."""

    key: str
    kind: Literal["legacy", "generated"]
    output_dir: Optional[str] = Field(default=None, alias="output_dir")
    home: Optional[str] = None
    content: dict[str, str] = Field(default_factory=dict)

    model_config = ConfigDict(populate_by_name=True)


def _load_scaffold_experiences(path: Path) -> list[ScaffoldExperience]:
    payload: Any = yaml.safe_load(path.read_text(encoding="utf-8")) or []
    if not isinstance(payload, list):
        raise SystemExit("experiences.yaml must contain a list of experiences.")

    experiences: list[ScaffoldExperience] = []
    errors: list[str] = []
    for index, item in enumerate(payload, start=1):
        try:
            experiences.append(ScaffoldExperience.model_validate(item))
        except ValidationError as exc:
            errors.append(f"{path} item {index}: {exc}")

    if errors:
        for message in errors:
            print(message, file=sys.stderr)
        raise SystemExit(1)

    return experiences


def _handle_validate(args: argparse.Namespace) -> None:
    experiences_path = Path(args.experiences)
    content_dir = Path(args.content)

    experiences = _load_experiences(experiences_path)
    experience_index = {exp.key: exp for exp in experiences}

    errors: list[str] = []
    validated: list[ContentItem] = []

    if not content_dir.exists():
        raise SystemExit(f"Content directory not found: {content_dir}")

    for json_path in sorted(content_dir.glob("*.json")):
        try:
            item = _load_content_item(json_path)
            validated.append(item)
        except (json.JSONDecodeError, ValidationError) as exc:
            errors.append(f"{json_path}: {exc}")
            continue

        if item.experience not in experience_index:
            errors.append(
                f"{json_path}: experience '{item.experience}' not found in "
                f"{experiences_path.name}"
            )
            continue

        spec = experience_index[item.experience]
        if spec.supports.page_types and item.page_type not in spec.supports.page_types:
            errors.append(
                f"{json_path}: pageType '{item.page_type}' is not allowed "
                f"for experience '{item.experience}'"
            )

        if spec.supports.render_kinds:
            # Render contract has a discriminating field named kind.
            render_kind = getattr(item.render, "kind", "")
            if render_kind not in spec.supports.render_kinds:
                errors.append(
                    f"{json_path}: render kind '{render_kind}' not allowed; "
                    f"supported kinds: {', '.join(spec.supports.render_kinds)}"
                )

    generated_experiences = [exp for exp in experiences if exp.kind == "generated"]
    for exp in generated_experiences:
        targeted = [item for item in validated if item.experience == exp.key] or validated
        episodes = [item for item in targeted if item.page_type == "story"]
        about_cards = [item for item in targeted if item.page_type == "about"]
        characters = [item for item in targeted if item.page_type == "character"]

        if not episodes:
            errors.append(
                f"Experience '{exp.key}' is missing story content. "
                f"Add at least one pageType=story entry in {content_dir}."
            )
        if not about_cards:
            errors.append(
                f"Experience '{exp.key}' has no about_cards (pageType=about). "
                f"Add an about JSON payload under {content_dir}."
            )
        if len(characters) < 3:
            errors.append(
                f"Experience '{exp.key}' requires at least 3 characters "
                f"(pageType=character); found {len(characters)}."
            )

    if errors:
        for message in errors:
            print(message, file=sys.stderr)
        raise SystemExit(1)

    print(
        f"Validated {len(validated)} content items against "
        f"{len(experience_index)} experiences."
    )


def _write_if_missing(path: Path, content: str) -> None:
    if path.exists():
        return
    write_text(path, content)


def _home_template(experience: ScaffoldExperience) -> str:
    return f"""<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <title>{experience.key} | Home</title>
    <link rel="stylesheet" href="../assets/tokens.css">
    <link rel="stylesheet" href="../assets/components.css">
  </head>
  <body class="sg-surface">
    <header class="sg-header">
      <p class="sg-eyebrow">Experience</p>
      <h1>{experience.key} ホーム</h1>
      <p class="sg-lede">テンプレートの起点となるシンプルなページです。</p>
    </header>
    <main class="sg-main">
      <section class="sg-card">
        <h2>最新コンテンツ</h2>
        <p>TODO: コンテンツ一覧をここにレンダリングします。</p>
      </section>
    </main>
  </body>
</html>
"""


def _list_template(experience: ScaffoldExperience) -> str:
    return f"""<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <title>{experience.key} | List</title>
    <link rel="stylesheet" href="../assets/tokens.css">
    <link rel="stylesheet" href="../assets/components.css">
  </head>
  <body class="sg-surface">
    <header class="sg-header">
      <p class="sg-eyebrow">Listing</p>
      <h1>{experience.key} コンテンツ一覧</h1>
      <p class="sg-lede">カード一覧でコンテンツを紹介するページです。</p>
    </header>
    <main class="sg-main">
      <ul class="sg-list">
        <li class="sg-card">
          <h2>サンプルタイトル</h2>
          <p>ここにサマリーが入ります。</p>
        </li>
        <li class="sg-card">
          <h2>次のコンテンツ</h2>
          <p>TODO: ループでデータを差し込みます。</p>
        </li>
      </ul>
    </main>
  </body>
</html>
"""


def _detail_template(experience: ScaffoldExperience) -> str:
    return f"""<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <title>{experience.key} | Detail</title>
    <link rel="stylesheet" href="../assets/tokens.css">
    <link rel="stylesheet" href="../assets/components.css">
  </head>
  <body class="sg-surface">
    <article class="sg-article">
      <header class="sg-header">
        <p class="sg-eyebrow">Detail</p>
        <h1>タイトルをここに</h1>
        <p class="sg-lede">本文の概要をここに記載します。</p>
      </header>
      <section class="sg-main">
        <p>TODO: 本文をレンダリングしてください。</p>
      </section>
      <footer class="sg-meta">
        <p>作者名や日付などのメタ情報を表示します。</p>
      </footer>
    </article>
  </body>
</html>
"""


def _tokens_css() -> str:
    return """:root {
  --sg-surface: #0d1117;
  --sg-panel: #161b22;
  --sg-border: #30363d;
  --sg-text: #e6edf3;
  --sg-muted: #9ea7b3;
  --sg-accent: #80b3ff;
  --sg-radius: 12px;
  --sg-gap: 16px;
  --sg-font: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
}
"""


def _components_css() -> str:
    return """* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 32px;
  background: var(--sg-surface);
  color: var(--sg-text);
  font-family: var(--sg-font);
}

a {
  color: var(--sg-accent);
}

.sg-surface {
  background: var(--sg-surface);
}

.sg-header {
  max-width: 760px;
  margin: 0 auto var(--sg-gap) auto;
  padding-bottom: var(--sg-gap);
  border-bottom: 1px solid var(--sg-border);
}

.sg-eyebrow {
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--sg-muted);
  font-weight: 600;
}

.sg-lede {
  color: var(--sg-muted);
}

.sg-main {
  max-width: 960px;
  margin: 0 auto;
  display: grid;
  gap: var(--sg-gap);
}

.sg-card {
  list-style: none;
  padding: 20px;
  border: 1px solid var(--sg-border);
  border-radius: var(--sg-radius);
  background: var(--sg-panel);
}

.sg-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--sg-gap);
}

.sg-article {
  max-width: 760px;
  margin: 0 auto;
  padding: 24px;
  border-radius: var(--sg-radius);
  border: 1px solid var(--sg-border);
  background: var(--sg-panel);
}

.sg-meta {
  margin-top: var(--sg-gap);
  color: var(--sg-muted);
  font-size: 14px;
}
"""


def _readme_content(experience: ScaffoldExperience) -> str:
    return f"""# {experience.key} scaffolding

このディレクトリは `sitegen scaffold` で生成された雛形です。

- `templates/home.jinja`: ホームページ用テンプレート
- `templates/list.jinja`: 一覧ページのテンプレート
- `templates/detail.jinja`: 詳細ページのテンプレート
- `assets/tokens.css`: ベースとなるカラートークン
- `assets/components.css`: 簡易なコンポーネントスタイル

必要に応じてテンプレートやアセットを編集し、`{experience.output_dir or experience.key}` 配下への出力を整えてください。
"""


def _scaffold_experience(experience: ScaffoldExperience, src_root: Path, out_root: Path) -> None:
    source_root = ensure_dir(src_root / experience.key)
    templates_dir = ensure_dir(source_root / "templates")
    assets_dir = ensure_dir(source_root / "assets")

    _write_if_missing(templates_dir / "home.jinja", _home_template(experience))
    _write_if_missing(templates_dir / "list.jinja", _list_template(experience))
    _write_if_missing(templates_dir / "detail.jinja", _detail_template(experience))
    _write_if_missing(assets_dir / "tokens.css", _tokens_css())
    _write_if_missing(assets_dir / "components.css", _components_css())
    _write_if_missing(source_root / "README.md", _readme_content(experience))

    output_dir = experience.output_dir or experience.key
    if not output_dir:
        raise SystemExit(f"{experience.key}: output_dir is required for generated experiences.")
    ensure_dir(out_root / output_dir)


def _handle_scaffold(args: argparse.Namespace) -> None:
    experiences_path = Path(args.experiences)
    src_root = Path(args.src)
    out_root = Path(args.out_root)

    experiences = _load_scaffold_experiences(experiences_path)
    generated = [exp for exp in experiences if exp.kind == "generated"]
    if not generated:
        print("No generated experiences found; nothing to scaffold.")
        return

    for exp in generated:
        _scaffold_experience(exp, src_root, out_root)

    print(
        f"Scaffolded {len(generated)} generated experience(s) "
        f"into {src_root} with outputs in {out_root}."
    )


def _handle_gen_manifests(args: argparse.Namespace) -> None:
    experiences_path = Path(args.experiences)
    src_root = Path(args.src)

    experiences = _load_experiences(experiences_path)
    generated = [exp for exp in experiences if exp.kind == "generated"]
    if not generated:
        print("No generated experiences found; nothing to write.")
        return

    for exp in generated:
        manifest = {
            "id": exp.key,
            "label": exp.name,
            "supports": exp.supports.model_dump(
                by_alias=True, exclude_none=True
            ),
            "routes": {
                "home": exp.route_patterns.home,
                "list": exp.route_patterns.list,
                "detail": exp.route_patterns.detail,
            },
        }
        manifest_path = ensure_dir(src_root / exp.key) / "manifest.json"
        write_text(
            manifest_path,
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        )

    print(f"Wrote {len(generated)} manifest(s) to {src_root}.")


def _handle_build(args: argparse.Namespace) -> None:
    experiences_path = Path(args.experiences)
    src_root = Path(args.src)
    out_root = Path(args.out)
    content_dir = Path(args.content)
    shared_requested = args.shared or args.all
    shared_init_features = (
        generate_init_features_js(out_root) if shared_requested else None
    )
    shared_assets_dir = ensure_dir(out_root / "shared") if args.all else None
    ctx = BuildContext(
        src_root=src_root,
        out_root=out_root,
        routes_filename=args.routes_filename,
        shared_init_features=shared_init_features,
        shared_assets_dir=shared_assets_dir,
    )

    items = load_content_items(content_dir)
    experiences = _load_experiences(experiences_path)
    generated = [exp for exp in experiences if exp.kind == "generated"]
    if not generated:
        print("No generated experiences found; nothing to build.")
        return

    written: list[Path] = []
    for exp in generated:
        written.extend(build_home(exp, ctx, items))
        written.extend(build_list(exp, ctx, items))
        for item in _content_for_experience(exp, items):
            written.extend(build_detail(exp, ctx, item, items))

    if args.all:
        routes_payload = build_routes_payload(experiences, items, out_root=out_root, routes_filename=args.routes_filename)
        route_targets = [ctx.routes_path]
        written.extend(write_routes_payload(routes_payload, route_targets))
        written.extend(generate_switcher_assets([Path("."), out_root]))
        written.extend(
            patch_legacy_pages(
                Path("."),
                routes_href=str(Path(out_root.name) / args.routes_filename),
                css_href=str(Path(out_root.name) / "shared" / "switcher.css"),
                js_href=str(Path(out_root.name) / "shared" / "switcher.js"),
            )
        )

    print(f"Built {len(written)} file(s) for {len(generated)} experience(s) into {out_root}.")


def _render_section(section: IASection, level: int) -> list[str]:
    heading_prefix = "#" * min(level, 6)
    lines: list[str] = ["", f"{heading_prefix} {section.title}"]
    if section.summary:
        lines.append("")
        lines.append(section.summary)
    for child in section.children:
        lines.extend(_render_section(child, level + 1))
    return lines


def _template_lines(template: IATemplateSpec) -> list[str]:
    lines: list[str] = ["構造差の核", "", f"# {template.name} ({template.key})"]
    if template.description:
        lines.append("")
        lines.append(template.description)
    if template.sections:
        for item in template.sections:
            lines.extend(_render_section(item, level=2))
    return lines


def _ia_template_to_markdown(template: IATemplateSpec) -> str:
    lines = _template_lines(template)
    return "\n".join(lines).rstrip() + "\n"


def _handle_ia_export_docs(args: argparse.Namespace) -> None:
    input_path = Path(args.input)
    output_dir = Path(args.output_dir)
    plan = _load_ia_plan(input_path)

    output_dir.mkdir(parents=True, exist_ok=True)
    for template in plan.templates:
        markdown = _ia_template_to_markdown(template)
        (output_dir / f"{template.key}.md").write_text(markdown, encoding="utf-8")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="sitegen",
        description="Static site generation utilities",
    )
    parser.add_argument(
        "--version",
        action="version",
        version="sitegen 0.1.0",
        help="Show the sitegen version and exit.",
    )

    subparsers = parser.add_subparsers(dest="command")

    plan_parser = subparsers.add_parser(
        "plan", help="Experiment plan utilities", description="Experiment plan tools."
    )
    plan_subparsers = plan_parser.add_subparsers(dest="plan_command")

    export_parser = plan_subparsers.add_parser(
        "export-docs",
        help="Export experiment plan documentation from YAML.",
        description="Validate experiment YAML and export a Markdown summary.",
    )
    export_parser.add_argument(
        "--in",
        dest="input",
        required=True,
        help="Path to the experiment plan YAML file.",
    )
    export_parser.add_argument(
        "--out",
        dest="output",
        required=True,
        help="Path to write the generated Markdown.",
    )
    export_parser.set_defaults(func=_handle_export_docs)

    ia_parser = subparsers.add_parser(
        "ia",
        help="Information architecture utilities",
        description="Information architecture helpers.",
    )
    ia_subparsers = ia_parser.add_subparsers(dest="ia_command")
    ia_export_parser = ia_subparsers.add_parser(
        "export-docs",
        help="Export IA documentation from YAML.",
        description="Validate IA YAML and export Markdown outlines.",
    )
    ia_export_parser.add_argument(
        "--in",
        dest="input",
        required=True,
        help="Path to the IA YAML file.",
    )
    ia_export_parser.add_argument(
        "--out-dir",
        dest="output_dir",
        required=True,
        help="Directory to write generated Markdown docs.",
    )
    ia_export_parser.set_defaults(func=_handle_ia_export_docs)

    validate_parser = subparsers.add_parser(
        "validate",
        help="Validate experiences.yaml and content posts.",
        description=(
            "Validate experience specifications and ensure content items match them."
        ),
    )
    validate_parser.add_argument(
        "--experiences",
        required=True,
        help="Path to experiences.yaml",
    )
    validate_parser.add_argument(
        "--content",
        required=True,
        help="Directory containing content JSON files (e.g., content/posts).",
    )
    validate_parser.set_defaults(func=_handle_validate)

    scaffold_parser = subparsers.add_parser(
        "scaffold",
        help="Create scaffolding for generated experiences.",
        description="Generate template and asset placeholders for experiences.",
    )
    scaffold_parser.add_argument(
        "--experiences",
        required=True,
        help="Path to experiences.yaml",
    )
    scaffold_parser.add_argument(
        "--src",
        required=True,
        help="Base directory where experience source templates will be created.",
    )
    scaffold_parser.add_argument(
        "--out-root",
        dest="out_root",
        required=True,
        help="Root directory for generated output folders.",
    )
    scaffold_parser.set_defaults(func=_handle_scaffold)

    manifest_parser = subparsers.add_parser(
        "gen-manifests",
        help="Generate manifest.json files for generated experiences.",
        description="Write manifest.json into experience source directories.",
    )
    manifest_parser.add_argument(
        "--experiences",
        required=True,
        help="Path to experiences.yaml",
    )
    manifest_parser.add_argument(
        "--src",
        required=True,
        help="Base directory containing experience source folders.",
    )
    manifest_parser.set_defaults(func=_handle_gen_manifests)

    build_parser = subparsers.add_parser(
        "build",
        help="Build generated experiences.",
        description="Render generated experience templates into output directories.",
    )
    build_parser.add_argument(
        "--experiences",
        default="config/experiences.yaml",
        help="Path to experiences.yaml.",
    )
    build_parser.add_argument(
        "--src",
        default="experience_src",
        help="Base directory containing experience source templates.",
    )
    build_parser.add_argument(
        "--out",
        default="generated",
        help="Directory to write rendered output.",
    )
    build_parser.add_argument(
        "--content",
        default="content/posts",
        help="Directory containing content JSON files.",
    )
    build_parser.add_argument(
        "--routes-filename",
        dest="routes_filename",
        default="routes.json",
        help="Filename for routes JSON used to compute data-routes-href.",
    )
    build_parser.add_argument(
        "--shared",
        action="store_true",
        help="Generate shared assets (e.g., feature bootstrap scripts).",
    )
    build_parser.add_argument(
        "--all",
        action="store_true",
        help="Build generated experiences and refresh routes, switchers, and legacy pages.",
    )
    build_parser.set_defaults(func=_handle_build)

    return parser


def main(argv: Optional[Iterable[str]] = None) -> None:
    parser = build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)
    if hasattr(args, "func"):
        args.func(args)
    else:
        parser.print_help()


__all__ = ["build_parser", "main"]
