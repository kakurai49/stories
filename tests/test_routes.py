from pathlib import Path

from scripts.verify_site import verify_site


def test_verify_site_passes(tmp_path: Path):
    generated = tmp_path / "generated"
    routes = generated / "routes.json"
    hina = generated / "hina"
    (hina / "list").mkdir(parents=True, exist_ok=True)
    (hina / "posts" / "ep01").mkdir(parents=True, exist_ok=True)

    routes.write_text(
        '{"routes": {"hina": {"home": "hina/", "list": "hina/list/", "content": {"ep01": "hina/posts/ep01/"}}}}',
        encoding="utf-8",
    )
    for path in [
        hina / "index.html",
        hina / "list" / "index.html",
        hina / "posts" / "ep01" / "index.html",
    ]:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('<html><body data-routes-href="../routes.json"></body></html>', encoding="utf-8")

    errors = verify_site(generated)
    assert errors == []
