#!/usr/bin/env python3
"""Bootstrap a local Python virtual environment for this repository.

This script mirrors the lightweight setup used in Codespaces by creating a
`.venv` at the repository root, upgrading pip, and installing the standard
requirements listed in `requirements.txt`.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
VENV_DIR = REPO_ROOT / ".venv"
REQUIREMENTS_FILE = REPO_ROOT / "requirements.txt"


def run(cmd: list[str]) -> None:
    print(f"[bootstrap] Running: {' '.join(cmd)}")
    subprocess.run(cmd, check=True)


def venv_python() -> Path:
    if os.name == "nt":
        return VENV_DIR / "Scripts" / "python.exe"
    return VENV_DIR / "bin" / "python"


def ensure_venv() -> None:
    if VENV_DIR.exists():
        print(f"[bootstrap] Reusing existing virtual environment at {VENV_DIR}")
    else:
        print(f"[bootstrap] Creating virtual environment at {VENV_DIR}")
        run([sys.executable, "-m", "venv", str(VENV_DIR)])


def install_dependencies() -> None:
    python = venv_python()
    run([str(python), "-m", "pip", "install", "--upgrade", "pip"])
    run([str(python), "-m", "pip", "install", "-r", str(REQUIREMENTS_FILE)])


def main() -> None:
    if not REQUIREMENTS_FILE.exists():
        raise FileNotFoundError(f"requirements file not found: {REQUIREMENTS_FILE}")

    ensure_venv()
    install_dependencies()

    python = venv_python()
    print("\n[bootstrap] Done.")
    print("[bootstrap] Activate the virtual environment with:")
    if os.name == "nt":
        print("  .venv\\Scripts\\activate")
    else:
        print("  source .venv/bin/activate")
    print(f"[bootstrap] Using interpreter: {python}")


if __name__ == "__main__":
    main()
