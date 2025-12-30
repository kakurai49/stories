"""Verify generated site structure and routes."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Iterable


def _load_routes(routes_path: Path) -> dict:
    if not routes_path.exists():
        raise FileNotFoundError(f"routes.json not found at {routes_path}")
    return json.loads(routes_path.read_text(encoding="utf-8"))


def _resolve_target(base_dir: Path, href: str) -> Path:
    target = base_dir / href
    if href.endswith("/"):
        target = target / "index.html"
    return target


def _iter_route_values(payload: dict) -> Iterable[str]:
    routes = payload.get("routes", {})
    for exp in routes.values():
        for key, value in exp.items():
            if isinstance(value, dict):
                yield from value.values()
            elif isinstance(value, str):
                yield value


def verify_site(root: Path) -> list[str]:
    errors: list[str] = []
    routes_path = root / "routes.json"
    try:
        payload = _load_routes(routes_path)
    except Exception as exc:  # pragma: no cover - surfaced as error message
        return [str(exc)]

    base_dir = routes_path.parent

    for href in _iter_route_values(payload):
        if href.startswith("/"):
            errors.append(f"Absolute href is not allowed: {href}")

        target = _resolve_target(base_dir, href)
        if not target.exists():
            errors.append(f"Route target missing: {href} -> {target}")

    representative = [
        root / "hina" / "index.html",
        root / "hina" / "list" / "index.html",
        root / "hina" / "posts" / "ep01" / "index.html",
    ]
    for page in representative:
        if not page.exists():
            errors.append(f"Representative page missing: {page}")
            continue
        content = page.read_text(encoding="utf-8")
        if "data-routes-href" not in content:
            errors.append(f"data-routes-href not found in {page}")

    required_paths = [
        root / "hina" / "index.html",
        root / "hina" / "list" / "index.html",
        root / "hina" / "posts" / "ep01" / "index.html",
    ]
    for target in required_paths:
        if not target.exists():
            errors.append(f"Expected file missing: {target}")

    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify generated site consistency.")
    parser.add_argument("--root", required=True, help="Generated output root (e.g., generated)")
    args = parser.parse_args(argv)

    root = Path(args.root)
    errors = verify_site(root)
    if errors:
        for message in errors:
            print(message, file=sys.stderr)
        return 1

    print(f"Verified site structure at {root}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
