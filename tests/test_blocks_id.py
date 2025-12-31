from sitegen.micro_store import block_id_from_block, block_fingerprint


def test_block_fingerprint_is_deterministic():
    block = {"id": "tmp", "type": "Paragraph", "inlines": [{"type": "Text", "text": "hello"}], "extra": None}
    fp1 = block_fingerprint(block)
    fp2 = block_fingerprint({"type": "Paragraph", "inlines": [{"type": "Text", "text": "hello"}], "extra": None})
    assert fp1 == fp2


def test_block_id_uses_content_hash():
    block_a = {"type": "Paragraph", "inlines": [{"type": "Text", "text": "hello"}]}
    block_b = {"type": "Paragraph", "inlines": [{"type": "Text", "text": "hello"}], "id": "ignored"}
    assert block_id_from_block(block_a) == block_id_from_block(block_b)
