from pathlib import Path

import pytest
from jinja2 import UndefinedError

from sitegen.build import BuildContext
from sitegen.models import ExperienceSpec, RoutePatterns, Supports


def _fake_experience(tmp_path: Path) -> ExperienceSpec:
    return ExperienceSpec(
        key="tmp",
        name="Tmp",
        kind="generated",
        output_dir="tmp",
        supports=Supports(),
        route_patterns=RoutePatterns(
            home="/tmp/",
            list="/tmp/list/",
            detail="/tmp/posts/{slug}/",
        ),
    )


def test_jinja_strictundefined(tmp_path: Path):
    templates_dir = tmp_path / "src" / "tmp" / "templates"
    templates_dir.mkdir(parents=True)
    (templates_dir / "strict.jinja").write_text("{{ missing_value }}", encoding="utf-8")

    ctx = BuildContext(src_root=tmp_path / "src", out_root=tmp_path / "out")
    exp = _fake_experience(tmp_path)
    env = ctx.jinja_env(exp)
    template = env.get_template("strict.jinja")

    with pytest.raises(UndefinedError):
        template.render()
