"""Micro world storage helpers."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List

from .io_utils import read_json
from .micro_ids import block_fingerprint, block_id_from_block


@dataclass
class MicroStore:
    """In-memory micro world store with validation helpers."""

    root: Path
    blocks_by_id: Dict[str, Dict[str, Any]]
    entities_by_id: Dict[str, Dict[str, Any]]
    index: dict

    @classmethod
    def load(cls, micro_dir: Path) -> "MicroStore":
        """Load and validate a micro store directory.

        Required layout:
        - index.json: lists entity_ids and block_ids
        - entities/: one JSON file per entity_id
        - blocks/: one JSON file per block_id
        """

        if not micro_dir.exists():
            raise FileNotFoundError(f"Micro store not found: {micro_dir}")

        index_path = micro_dir / "index.json"
        entities_dir = micro_dir / "entities"
        blocks_dir = micro_dir / "blocks"
        for required in (index_path, entities_dir, blocks_dir):
            if not required.exists():
                raise FileNotFoundError(f"Micro store is missing {required}")

        index = read_json(index_path)
        entity_ids = index.get("entity_ids")
        block_ids = index.get("block_ids")
        if not isinstance(entity_ids, list) or not isinstance(block_ids, list):
            raise ValueError("index.json must contain entity_ids and block_ids arrays")

        blocks_by_id: Dict[str, Dict[str, Any]] = {}
        for block_id in block_ids:
            path = blocks_dir / f"{block_id}.json"
            if not path.exists():
                raise FileNotFoundError(f"Block listed in index missing: {path}")
            block = read_json(path)
            if block.get("id") != block_id:
                raise ValueError(f"Block id mismatch for {path}: expected {block_id}")
            expected_id = block_id_from_block(block)
            if expected_id != block_id:
                raise ValueError(f"Block fingerprint mismatch for {block_id}: expected {expected_id}")
            blocks_by_id[block_id] = block

        entities_by_id: Dict[str, Dict[str, Any]] = {}
        for entity_id in entity_ids:
            path = entities_dir / f"{entity_id}.json"
            if not path.exists():
                raise FileNotFoundError(f"Entity listed in index missing: {path}")
            entity = read_json(path)
            if entity.get("id") != entity_id:
                raise ValueError(f"Entity id mismatch for {path}: expected {entity_id}")
            required_fields = ("variant", "type", "meta", "body", "relations")
            for field in required_fields:
                if field not in entity:
                    raise ValueError(f"Entity {entity_id} missing required field '{field}'")
            block_refs = entity.get("body", {}).get("blockRefs", [])
            if not isinstance(block_refs, list):
                raise ValueError(f"Entity {entity_id} body.blockRefs must be a list")
            for ref in block_refs:
                if ref not in blocks_by_id:
                    raise KeyError(f"Entity {entity_id} references missing block {ref}")
            entities_by_id[entity_id] = entity

        # Ensure on-disk files do not introduce extra blocks/entities unexpectedly.
        extra_blocks = {path.stem for path in blocks_dir.glob("*.json")} - set(block_ids)
        if extra_blocks:
            raise ValueError(f"Blocks present but absent from index: {sorted(extra_blocks)}")
        extra_entities = {path.stem for path in entities_dir.glob("*.json")} - set(entity_ids)
        if extra_entities:
            raise ValueError(f"Entities present but absent from index: {sorted(extra_entities)}")

        return cls(root=micro_dir, blocks_by_id=blocks_by_id, entities_by_id=entities_by_id, index=index)

    def resolve_block(self, block_id: str) -> Dict[str, Any]:
        return self.blocks_by_id[block_id]

    def resolve_blocks(self, block_ids: Iterable[str]) -> list[Dict[str, Any]]:
        return [self.resolve_block(block_id) for block_id in block_ids]

    @property
    def entities(self) -> list[Dict[str, Any]]:
        """Backward compatible access to all entities."""

        return list(self.entities_by_id.values())

    def iter_entities(self, *, variant: str | None = None) -> Iterator[Dict[str, Any]]:
        ids = self.index.get("entity_ids", [])
        for entity_id in ids:
            entity = self.entities_by_id[entity_id]
            if variant and entity.get("variant") != variant:
                continue
            yield entity

    def iter_posts(self, *, variant: str | None = None) -> list[Dict[str, Any]]:
        return list(self.iter_entities(variant=variant))

    def get_post_entities(self, *, variant: str | None = None) -> list[Dict[str, Any]]:
        """Return all entities filtered by variant for view-model construction."""

        return self.iter_posts(variant=variant)


def load_micro_store(micro_dir: Path) -> MicroStore:
    """Deprecated v1 loader retained for backward compatibility."""

    return MicroStore.load(micro_dir)
