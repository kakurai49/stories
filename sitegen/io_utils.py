"""Utility helpers for JSON IO and logging."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


def stable_json_dumps(obj: object) -> str:
    """Serialize JSON in a stable, human-readable way with a trailing newline."""
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, indent=2) + "\n"


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def write_json(path: Path, data: Any) -> None:
    """Deprecated: kept for backward compatibility. Prefer write_json_stable."""
    write_json_stable(path, data)


def write_json_stable(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(stable_json_dumps(data), encoding="utf-8")


def warn(msg: str) -> None:
    print(msg, file=sys.stderr)
