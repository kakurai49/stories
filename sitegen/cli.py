"""Command-line interface for sitegen."""

import argparse
import json
import sys
from pathlib import Path
from typing import Iterable, Optional

import yaml
from pydantic import ValidationError

from .models import (
    ContentItem,
    ExperienceSpec,
    ExperimentPlan,
    IAPlan,
    IASection,
    IATemplateSpec,
)


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

    if errors:
        for message in errors:
            print(message, file=sys.stderr)
        raise SystemExit(1)

    print(
        f"Validated {len(validated)} content items against "
        f"{len(experience_index)} experiences."
    )


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

    return parser


def main(argv: Optional[Iterable[str]] = None) -> None:
    parser = build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)
    if hasattr(args, "func"):
        args.func(args)
    else:
        parser.print_help()


__all__ = ["build_parser", "main"]
