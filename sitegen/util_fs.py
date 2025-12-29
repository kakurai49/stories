"""Filesystem utilities for sitegen."""

from pathlib import Path
from typing import Union

PathLike = Union[str, Path]


def ensure_dir(path: PathLike) -> Path:
    """Ensure that a directory exists and return the Path object."""

    directory = Path(path)
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def write_text(path: PathLike, content: str, *, encoding: str = "utf-8") -> Path:
    """Write text content to a file, creating parent directories as needed."""

    file_path = Path(path)
    if file_path.parent != Path(""):
        file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(content, encoding=encoding)
    return file_path


__all__ = ["ensure_dir", "write_text"]
