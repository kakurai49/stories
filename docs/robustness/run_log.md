# markdown_to_micro_v2 robustness suite run log

このログは Codex codespace 上で pytest と入力マトリクス診断を実行した結果です。
（stdout/stderr は長すぎる場合切り詰めています）



## python --version

### cmd
```bash
/root/.pyenv/versions/3.11.12/bin/python --version
```

### rc
```text
0
```

### stdout
```text
Python 3.11.12

```

### stderr
```text

```


## sitegen import path check

### cmd
```bash
/root/.pyenv/versions/3.11.12/bin/python -c import sitegen; print(sitegen.__file__)
```

### rc
```text
0
```

### stdout
```text
/workspace/stories/sitegen/__init__.py

```

### stderr
```text

```


## pytest: existing + robustness

### cmd
```bash
/root/.pyenv/versions/3.11.12/bin/python -m pytest -q tests/test_markdown_to_micro_v2.py tests/test_markdown_to_micro_v2_robustness.py
```

### rc
```text
0
```

### stdout
```text
............                                                             [100%]
12 passed in 1.30s

```

### stderr
```text

```


## matrix diagnose (writes docs/robustness/matrix/*)

### cmd
```bash
/root/.pyenv/versions/3.11.12/bin/python scripts/diagnose_markdown_to_micro_v2_matrix.py --out docs/robustness/matrix --season diag-season --variant hina
```

### rc
```text
0
```

### stdout
```text
[OK] wrote docs/robustness/matrix/matrix_report.md
[OK] wrote docs/robustness/matrix/matrix_summary.json

```

### stderr
```text

```


## git status (after)

### cmd
```bash
git status -sb
```

### rc
```text
0
```

### stdout
```text
## work
?? docs/robustness/
?? scripts/diagnose_markdown_to_micro_v2_matrix.py
?? scripts/run_markdown_to_micro_v2_robustness_suite.py
?? tests/test_markdown_to_micro_v2_robustness.py

```

### stderr
```text

```


## Outputs
- `docs/robustness/run_log.md`
- `docs/robustness/matrix/matrix_report.md`
- `docs/robustness/matrix/matrix_summary.json`
