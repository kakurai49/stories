from pathlib import Path

from sitegen.migrate_legacy import legacy_to_micro


def test_cta_becomes_link_block(tmp_path: Path):
    legacy = {
        "contentId": "cta-test",
        "experience": "demo",
        "pageType": "story",
        "title": "Sample",
        "summary": "Summary",
        "render": {"kind": "html", "html": "<p>body</p>"},
        "ctaLabel": "Read more",
        "ctaHref": "/read",
    }

    entity, blocks = legacy_to_micro(legacy)

    assert entity["body"]["blockRefs"][-1] in {block["id"] for block in blocks}
    link_blocks = [b for b in blocks if b["type"] == "Link"]
    assert len(link_blocks) == 1
    assert link_blocks[0]["label"] == "Read more"
    assert link_blocks[0]["href"] == "/read"
