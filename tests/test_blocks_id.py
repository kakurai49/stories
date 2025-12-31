import unittest

from sitegen.micro_store import block_id_from_block, block_fingerprint


class BlockFingerprintTest(unittest.TestCase):
    def test_block_fingerprint_is_deterministic(self) -> None:
        block = {"id": "tmp", "type": "Paragraph", "inlines": [{"type": "Text", "text": "hello"}], "extra": None}
        fp1 = block_fingerprint(block)
        fp2 = block_fingerprint({"type": "Paragraph", "inlines": [{"type": "Text", "text": "hello"}], "extra": None})
        self.assertEqual(fp1, fp2)

    def test_block_id_uses_content_hash(self) -> None:
        block_a = {"type": "Paragraph", "inlines": [{"type": "Text", "text": "hello"}]}
        block_b = {"type": "Paragraph", "inlines": [{"type": "Text", "text": "hello"}], "id": "ignored"}
        self.assertEqual(block_id_from_block(block_a), block_id_from_block(block_b))


if __name__ == "__main__":
    unittest.main()
