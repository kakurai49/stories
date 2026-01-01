import os
import subprocess
import sys
from pathlib import Path


def test_cli_build_site_runs_deterministically(tmp_path: Path) -> None:
    out_dir = tmp_path / "out"
    env = os.environ.copy()
    env.setdefault("SOURCE_DATE_EPOCH", "0")

    subprocess.run(
        [
            sys.executable,
            "-m",
            "sitegen.cli_build_site",
            "--micro-store",
            "content/micro",
            "--experiences",
            "config/experiences.yaml",
            "--src",
            "experience_src",
            "--out",
            str(out_dir),
            "--shared",
            "--deterministic",
            "--check",
        ],
        check=True,
        env=env,
    )

    assert (out_dir / "micro.css").exists()
    assert (out_dir / "hina" / "index.html").exists()
    assert not (out_dir / "posts").exists()
