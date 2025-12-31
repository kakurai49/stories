"""Deterministic ID helpers for micro blocks."""

from __future__ import annotations

import hashlib
from typing import Any, Dict

from .io_utils import stable_json_dumps


def normalize_for_fingerprint(obj: Any, *, drop_id: bool = False) -> Any:
    """Normalize objects for hashing by sorting keys and removing nulls/ids."""
    if isinstance(obj, dict):
        items: Dict[str, Any] = {}
        for key in sorted(obj.keys()):
            if drop_id and key == "id":
                continue
            value = obj[key]
            if value is None:
                continue
            items[key] = normalize_for_fingerprint(value, drop_id=drop_id)
        return items
    if isinstance(obj, list):
        return [normalize_for_fingerprint(item, drop_id=drop_id) for item in obj]
    return obj


def block_fingerprint(block: Dict[str, Any]) -> str:
    normalized = normalize_for_fingerprint(block, drop_id=True)
    return stable_json_dumps(normalized)


def block_id_from_block(block: Dict[str, Any]) -> str:
    fingerprint = block_fingerprint(block)
    digest = hashlib.sha1(fingerprint.encode("utf-8")).hexdigest()
    return f"blk_{digest}"
