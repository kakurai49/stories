import hashlib
import os
import shutil
import subprocess
import sys
from pathlib import Path


def _hash_dir(root: Path) -> dict[str, str]:
    hashes: dict[str, str] = {}
    for path in sorted(root.rglob("*")):
        if path.is_file():
            rel = path.relative_to(root)
            hashes[str(rel)] = hashlib.sha256(path.read_bytes()).hexdigest()
    return hashes


def _run_flow(work_dir: Path) -> tuple[Path, Path, Path]:
    """Run legacy -> micro snapshot -> dist -> generated pipeline."""

    micro_dir = work_dir / "micro"
    dist_dir = work_dir / "dist"
    generated_dir = work_dir / "generated"
    legacy_base = work_dir / "legacy_patch"
    legacy_base.mkdir(exist_ok=True)

    for path in (micro_dir, dist_dir, generated_dir):
        if path.exists():
            shutil.rmtree(path)

    env = os.environ.copy()
    env.setdefault("SOURCE_DATE_EPOCH", "0")

    subprocess.run(
        [
            sys.executable,
            "-m",
            "sitegen.cli_snapshot_micro",
            "--posts",
            "content/posts",
            "--out",
            str(micro_dir),
        ],
        check=True,
        env=env,
    )
    subprocess.run(
        [
            sys.executable,
            "-m",
            "sitegen.cli_snapshot_micro",
            "--posts",
            "content/posts",
            "--out",
            str(micro_dir),
            "--check",
        ],
        check=True,
        env=env,
    )
    subprocess.run(
        [
            sys.executable,
            "-m",
            "sitegen.cli_build_posts",
            "--micro",
            str(micro_dir),
            "--out",
            str(dist_dir),
        ],
        check=True,
        env=env,
    )
    subprocess.run(
        [
            sys.executable,
            "-m",
            "sitegen",
            "build",
            "--experiences",
            "config/experiences.yaml",
            "--src",
            "experience_src",
            "--content",
            str(dist_dir / "posts"),
            "--out",
            str(generated_dir),
            "--shared",
            "--all",
            "--deterministic",
            "--build-label",
            "test-flow",
            "--legacy-base",
            str(legacy_base),
        ],
        check=True,
        env=env,
    )

    return micro_dir, dist_dir, generated_dir


def _copy_output(src: Path, dest: Path) -> None:
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(src, dest)


def _assert_same_dir(left: Path, right: Path) -> None:
    assert _hash_dir(left) == _hash_dir(right), f"{left} and {right} differ"


def test_micro_flow_is_reproducible(tmp_path: Path) -> None:
    """Full end-to-end micro flow should be reproducible between runs."""

    work_dir = tmp_path / "work"
    run1_dir = tmp_path / "run1"
    run2_dir = tmp_path / "run2"
    work_dir.mkdir()

    micro1, dist1, generated1 = _run_flow(work_dir)
    _copy_output(micro1, run1_dir / "micro")
    _copy_output(dist1, run1_dir / "dist")
    _copy_output(generated1, run1_dir / "generated")

    micro2, dist2, generated2 = _run_flow(work_dir)
    _copy_output(micro2, run2_dir / "micro")
    _copy_output(dist2, run2_dir / "dist")
    _copy_output(generated2, run2_dir / "generated")

    _assert_same_dir(run1_dir / "micro", run2_dir / "micro")
    _assert_same_dir(run1_dir / "dist", run2_dir / "dist")
    _assert_same_dir(run1_dir / "generated", run2_dir / "generated")
