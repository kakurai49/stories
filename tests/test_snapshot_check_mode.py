import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from sitegen.io_utils import stable_json_dumps


def _write_post(path: Path, data: dict) -> None:
    path.write_text(stable_json_dumps(data), encoding="utf-8")


class SnapshotCheckModeTest(unittest.TestCase):
    def test_cli_check_detects_changes_end_to_end(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            posts_dir = tmp_path / "posts"
            posts_dir.mkdir()
            post = {
                "contentId": "sample",
                "experience": "demo",
                "pageType": "story",
                "title": "Sample",
                "summary": "Summary",
                "render": {"kind": "html", "html": "<p>Hello</p>"},
            }
            _write_post(posts_dir / "sample.json", post)

            micro_dir = tmp_path / "micro"

            subprocess.run(
                [sys.executable, "-m", "sitegen.cli_snapshot_micro", "--posts", str(posts_dir), "--out", str(micro_dir)],
                check=True,
            )

            result_ok = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "sitegen.cli_snapshot_micro",
                    "--posts",
                    str(posts_dir),
                    "--out",
                    str(micro_dir),
                    "--check",
                ],
                capture_output=True,
                text=True,
            )
            self.assertEqual(result_ok.returncode, 0, result_ok.stderr)

            entity_path = micro_dir / "entities" / f"{post['contentId']}.json"
            entity_path.write_text(entity_path.read_text(encoding="utf-8").replace("Sample", "Changed"), encoding="utf-8")

            result_diff = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "sitegen.cli_snapshot_micro",
                    "--posts",
                    str(posts_dir),
                    "--out",
                    str(micro_dir),
                    "--check",
                ],
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(result_diff.returncode, 0)
            self.assertIn(f"{micro_dir.name}/entities", result_diff.stderr)


if __name__ == "__main__":
    unittest.main()
