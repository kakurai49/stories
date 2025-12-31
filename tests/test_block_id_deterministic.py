import unittest

from sitegen.micro_store import block_id_from_block


class BlockIdDeterminismTest(unittest.TestCase):
    def test_block_id_is_stable_even_with_extra_fields(self) -> None:
        base = {"type": "RawHtml", "html": "<p>hello</p>", "ignored": None}
        same_content = {"html": "<p>hello</p>", "type": "RawHtml", "ignored": None, "id": "tmp"}

        self.assertEqual(block_id_from_block(base), block_id_from_block(same_content))


if __name__ == "__main__":
    unittest.main()
