"""Command-line interface for sitegen."""

import argparse


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
    return parser


def main() -> None:
    parser = build_parser()
    parser.parse_args()


__all__ = ["build_parser", "main"]
