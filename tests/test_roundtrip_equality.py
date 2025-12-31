import unittest

from sitegen.verify_roundtrip import legacy_to_micro, micro_to_legacy


class RoundtripEqualityTest(unittest.TestCase):
    def test_roundtrip_preserves_html_and_cta(self) -> None:
        legacy = {
            "contentId": "legacy-1",
            "experience": "exp",
            "pageType": "story",
            "title": "Title",
            "summary": "Summary",
            "profile": "Profile",
            "role": "Role",
            "ctaLabel": "Read",
            "ctaHref": "/read",
            "tags": ["tag-a", "tag-b"],
            "render": {"kind": "html", "html": "<p>Hello</p>"},
        }

        entity, blocks = legacy_to_micro(legacy)
        restored = micro_to_legacy(entity, {block["id"]: block for block in blocks})

        self.assertEqual(restored, legacy)

    def test_roundtrip_preserves_markdown_without_optional_fields(self) -> None:
        legacy = {
            "contentId": "legacy-2",
            "experience": "demo",
            "pageType": "note",
            "render": {"kind": "markdown", "markdown": "# heading"},
        }

        entity, blocks = legacy_to_micro(legacy)
        restored = micro_to_legacy(entity, {block["id"]: block for block in blocks})

        self.assertEqual(restored, legacy)


if __name__ == "__main__":
    unittest.main()
