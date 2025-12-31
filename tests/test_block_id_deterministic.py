from sitegen.micro_store import block_id_from_block


def test_block_id_is_stable_even_with_extra_fields():
    base = {"type": "RawHtml", "html": "<p>hello</p>", "ignored": None}
    same_content = {"html": "<p>hello</p>", "type": "RawHtml", "ignored": None, "id": "tmp"}

    assert block_id_from_block(base) == block_id_from_block(same_content)
