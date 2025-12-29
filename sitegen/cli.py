"""Command-line interface for sitegen."""

import argparse
from pathlib import Path
from typing import Iterable, Optional

import yaml

from .models import ExperimentPlan


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
    return ExperimentPlan.parse_obj(data)


def _handle_export_docs(args: argparse.Namespace) -> None:
    input_path = Path(args.input)
    output_path = Path(args.output)

    plan = _load_experiment_plan(input_path)
    output = _experiment_plan_to_markdown(plan)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(output, encoding="utf-8")


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

    return parser


def main(argv: Optional[Iterable[str]] = None) -> None:
    parser = build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)
    if hasattr(args, "func"):
        args.func(args)
    else:
        parser.print_help()


__all__ = ["build_parser", "main"]
