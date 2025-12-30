"""Verify generated experiences include full-spec home/list sections."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Iterable

import yaml
from bs4 import BeautifulSoup


def _load_generated_experiences(config_path: Path) -> list[str]:
    data = yaml.safe_load(config_path.read_text(encoding="utf-8")) or []
    keys: list[str] = []
    for item in data:
        if item.get("kind") == "generated" and item.get("key"):
            keys.append(str(item["key"]))
    return keys


def _require_sections(soup: BeautifulSoup, ids: Iterable[str], *, errors: list[str], exp: str) -> None:
    for section_id in ids:
        if not soup.select_one(f"#{section_id}"):
            errors.append(f"[{exp}] missing section #{section_id}")


def _check_counts(soup: BeautifulSoup, *, exp: str, errors: list[str]) -> None:
    episodes = soup.select("[data-episode-id]")
    characters = soup.select("[data-character-id]")
    if len(episodes) < 2:
        errors.append(f"[{exp}] expected multiple episodes, found {len(episodes)}")
    if len(characters) < 3:
        errors.append(f"[{exp}] expected >=3 characters, found {len(characters)}")


def verify(root: Path, *, experiences: list[str]) -> list[str]:
    errors: list[str] = []
    for key in experiences:
        home_path = root / key / "index.html"
        list_path = root / key / "list" / "index.html"

        if not home_path.exists():
            errors.append(f"[{key}] home not found: {home_path}")
            continue

        soup = BeautifulSoup(home_path.read_text(encoding="utf-8"), "html.parser")
        _require_sections(soup, ["about", "episodes", "characters"], errors=errors, exp=key)
        _check_counts(soup, exp=key, errors=errors)

        if list_path.exists():
            list_soup = BeautifulSoup(list_path.read_text(encoding="utf-8"), "html.parser")
            episode_cards = list_soup.select("[data-episode-id]")
            if not episode_cards:
                errors.append(f"[{key}] list page missing episode cards: {list_path}")
        else:
            errors.append(f"[{key}] list not found: {list_path}")

    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify generated experiences for full-spec home/list output.")
    parser.add_argument("--root", default="generated", help="Root directory containing generated output.")
    parser.add_argument("--experiences", default="config/experiences.yaml", help="Path to experiences.yaml.")
    args = parser.parse_args(argv)

    root = Path(args.root)
    experience_keys = _load_generated_experiences(Path(args.experiences))
    errors = verify(root, experiences=experience_keys)
    if errors:
        for message in errors:
            print(message, file=sys.stderr)
        return 1

    print(f"Verified full-spec generation for {len(experience_keys)} experiences in {root}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
