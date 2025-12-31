"""Utility helpers for JSON IO and logging."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


def stable_json_dumps(obj: object) -> str:
    """Serialize JSON in a stable way for hashing."""
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, sort_keys=True, indent=2)
    path.write_text(text + "\n", encoding="utf-8")


def warn(msg: str) -> None:
    print(msg, file=sys.stderr)
