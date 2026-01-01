# v2 flow pre-fix probes

## Commands
- `python -m sitegen --help`
- `python scripts/markdown_to_micro_v2.py --help`
- `python -c "import sys; print(sys.path[0]); print(sys.path[:5])"`

## Output snapshots

### python -m sitegen --help
```
usage: sitegen [-h] [--version]
               {plan,ia,validate,scaffold,gen-manifests,build} ...

Static site generation utilities

positional arguments:
  {plan,ia,validate,scaffold,gen-manifests,build}
    plan                Experiment plan utilities
    ia                  Information architecture utilities
    validate            Validate experiences.yaml and content posts.
    scaffold            Create scaffolding for generated experiences.
    gen-manifests       Generate manifest.json files for generated
                        experiences.
    build               Build generated experiences.

options:
  -h, --help            show this help message and exit
  --version             Show the sitegen version and exit.
```

### python scripts/markdown_to_micro_v2.py --help
```
Traceback (most recent call last):
  File "/workspace/stories/scripts/markdown_to_micro_v2.py", line 19, in <module>
    from sitegen.io_utils import write_json_stable
ModuleNotFoundError: No module named 'sitegen'
```

### python -c "import sys; print(sys.path[0]); print(sys.path[:5])"
```

['', '/root/.pyenv/versions/3.11.12/lib/python311.zip', '/root/.pyenv/versions/3.11.12/lib/python3.11', '/root/.pyenv/versions/3.11.12/lib/python3.11/lib-dynload', '/root/.pyenv/versions/3.11.12/lib/python3.11/site-packages']
```
