# markdown_to_micro_v2 input matrix report
- script: `/workspace/stories/scripts/markdown_to_micro_v2.py`
- season: `diag-season`
- variant: `hina`
- cases: 11

| case | rc | expected_blocks | blocks | entities | notes |
|---|---:|---:|---:|---:|---|
| ok_minimal | 0 | 1 | 1 | 1 | minimal valid fence |
| ok_trailing_spaces_lang | 0 | 1 | 1 | 1 | trailing spaces after language tag |
| ok_blank_lines_before_title | 0 | 1 | 1 | 1 | blank lines before title |
| fail_no_fence | 1 | 1 |  |  | no fences |
| fail_non_text_fence | 1 | 1 |  |  | non-text fence only |
| probe_uppercase_lang | 1 | 1 |  |  | is language case-sensitive? (observe) |
| probe_indented_fence | 0 | 1 | 1 | 1 | indented fence (observe) |
| probe_unclosed_fence | 1 | 1 |  |  | missing closing fence (observe) |
| probe_backticks_in_body | 0 | 1 | 1 | 1 | backticks in body (observe) |
| probe_bom | 1 | 1 |  |  | UTF-8 BOM at file start (observe) |
| probe_crlf | 0 | 1 | 1 | 1 | CRLF newlines (observe) |

## Detailed logs (truncated)

### ok_minimal
- notes: minimal valid fence
```bash
/root/.pyenv/versions/3.11.12/bin/python /workspace/stories/scripts/markdown_to_micro_v2.py --input docs/robustness/matrix/cases/ok_minimal/input.md --out docs/robustness/matrix/cases/ok_minimal/store --season diag-season --variant hina --expected-blocks 1 --force
```
**rc**
```text
0
```
**stdout**
```text
Wrote micro store to docs/robustness/matrix/cases/ok_minimal/store

```
**stderr**
```text

```

### ok_trailing_spaces_lang
- notes: trailing spaces after language tag
```bash
/root/.pyenv/versions/3.11.12/bin/python /workspace/stories/scripts/markdown_to_micro_v2.py --input docs/robustness/matrix/cases/ok_trailing_spaces_lang/input.md --out docs/robustness/matrix/cases/ok_trailing_spaces_lang/store --season diag-season --variant hina --expected-blocks 1 --force
```
**rc**
```text
0
```
**stdout**
```text
Wrote micro store to docs/robustness/matrix/cases/ok_trailing_spaces_lang/store

```
**stderr**
```text

```

### ok_blank_lines_before_title
- notes: blank lines before title
```bash
/root/.pyenv/versions/3.11.12/bin/python /workspace/stories/scripts/markdown_to_micro_v2.py --input docs/robustness/matrix/cases/ok_blank_lines_before_title/input.md --out docs/robustness/matrix/cases/ok_blank_lines_before_title/store --season diag-season --variant hina --expected-blocks 1 --force
```
**rc**
```text
0
```
**stdout**
```text
Wrote micro store to docs/robustness/matrix/cases/ok_blank_lines_before_title/store

```
**stderr**
```text

```

### fail_no_fence
- notes: no fences
```bash
/root/.pyenv/versions/3.11.12/bin/python /workspace/stories/scripts/markdown_to_micro_v2.py --input docs/robustness/matrix/cases/fail_no_fence/input.md --out docs/robustness/matrix/cases/fail_no_fence/store --season diag-season --variant hina --expected-blocks 1 --force
```
**rc**
```text
1
```
**stdout**
```text

```
**stderr**
```text
Expected 1 fenced blocks but found 0 in docs/robustness/matrix/cases/fail_no_fence/input.md

```

### fail_non_text_fence
- notes: non-text fence only
```bash
/root/.pyenv/versions/3.11.12/bin/python /workspace/stories/scripts/markdown_to_micro_v2.py --input docs/robustness/matrix/cases/fail_non_text_fence/input.md --out docs/robustness/matrix/cases/fail_non_text_fence/store --season diag-season --variant hina --expected-blocks 1 --force
```
**rc**
```text
1
```
**stdout**
```text

```
**stderr**
```text
Expected 1 fenced blocks but found 0 in docs/robustness/matrix/cases/fail_non_text_fence/input.md

```

### probe_uppercase_lang
- notes: is language case-sensitive? (observe)
```bash
/root/.pyenv/versions/3.11.12/bin/python /workspace/stories/scripts/markdown_to_micro_v2.py --input docs/robustness/matrix/cases/probe_uppercase_lang/input.md --out docs/robustness/matrix/cases/probe_uppercase_lang/store --season diag-season --variant hina --expected-blocks 1 --force
```
**rc**
```text
1
```
**stdout**
```text

```
**stderr**
```text
Expected 1 fenced blocks but found 0 in docs/robustness/matrix/cases/probe_uppercase_lang/input.md

```

### probe_indented_fence
- notes: indented fence (observe)
```bash
/root/.pyenv/versions/3.11.12/bin/python /workspace/stories/scripts/markdown_to_micro_v2.py --input docs/robustness/matrix/cases/probe_indented_fence/input.md --out docs/robustness/matrix/cases/probe_indented_fence/store --season diag-season --variant hina --expected-blocks 1 --force
```
**rc**
```text
0
```
**stdout**
```text
Wrote micro store to docs/robustness/matrix/cases/probe_indented_fence/store

```
**stderr**
```text

```

### probe_unclosed_fence
- notes: missing closing fence (observe)
```bash
/root/.pyenv/versions/3.11.12/bin/python /workspace/stories/scripts/markdown_to_micro_v2.py --input docs/robustness/matrix/cases/probe_unclosed_fence/input.md --out docs/robustness/matrix/cases/probe_unclosed_fence/store --season diag-season --variant hina --expected-blocks 1 --force
```
**rc**
```text
1
```
**stdout**
```text

```
**stderr**
```text
Traceback (most recent call last):
  File "/workspace/stories/scripts/markdown_to_micro_v2.py", line 237, in <module>
    main(sys.argv[1:])
  File "/workspace/stories/scripts/markdown_to_micro_v2.py", line 223, in main
    build_micro_store(
  File "/workspace/stories/scripts/markdown_to_micro_v2.py", line 146, in build_micro_store
    fences = extract_text_fences(markdown)
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/workspace/stories/scripts/markdown_to_micro_v2.py", line 78, in extract_text_fences
    raise ValueError("Unterminated ```text fenced block detected")
ValueError: Unterminated ```text fenced block detected

```

### probe_backticks_in_body
- notes: backticks in body (observe)
```bash
/root/.pyenv/versions/3.11.12/bin/python /workspace/stories/scripts/markdown_to_micro_v2.py --input docs/robustness/matrix/cases/probe_backticks_in_body/input.md --out docs/robustness/matrix/cases/probe_backticks_in_body/store --season diag-season --variant hina --expected-blocks 1 --force
```
**rc**
```text
0
```
**stdout**
```text
Wrote micro store to docs/robustness/matrix/cases/probe_backticks_in_body/store

```
**stderr**
```text

```

### probe_bom
- notes: UTF-8 BOM at file start (observe)
```bash
/root/.pyenv/versions/3.11.12/bin/python /workspace/stories/scripts/markdown_to_micro_v2.py --input docs/robustness/matrix/cases/probe_bom/input.md --out docs/robustness/matrix/cases/probe_bom/store --season diag-season --variant hina --expected-blocks 1 --force
```
**rc**
```text
1
```
**stdout**
```text

```
**stderr**
```text
Expected 1 fenced blocks but found 0 in docs/robustness/matrix/cases/probe_bom/input.md

```

### probe_crlf
- notes: CRLF newlines (observe)
```bash
/root/.pyenv/versions/3.11.12/bin/python /workspace/stories/scripts/markdown_to_micro_v2.py --input docs/robustness/matrix/cases/probe_crlf/input.md --out docs/robustness/matrix/cases/probe_crlf/store --season diag-season --variant hina --expected-blocks 1 --force
```
**rc**
```text
0
```
**stdout**
```text
Wrote micro store to docs/robustness/matrix/cases/probe_crlf/store

```
**stderr**
```text

```
