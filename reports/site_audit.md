# Site Audit Report

## Overview
- Scope: Validate generated output under `generated/` for routing consistency, switcher readiness, branding per experience, and content assignment for hina/immersive/magazine plus legacy entry points (`index.html`, `story1.html`).
- Tooling: `scripts/audit_generated_site.py` (parser: beautifulsoup4). Sitegen entry point is `sitegen/cli.py` with experiences defined in `config/experiences.yaml`; templates live in `experience_src/<key>/templates/*.jinja`; content JSON lives in `content/posts/*.json`.
- Deployment note: No GitHub Pages workflow/config found; README documents `--out generated`. Serving `generated/` via `python -m http.server 8001 --directory generated` returns a directory listing at `/` (no legacy index inside `generated/`), so switcher routes that point to `../` cannot reach the legacy home when publishing `generated/` directly.

## Commands executed
- `python -m pip install -r requirements.txt` → dependency setup (already satisfied). 【reports/sitegen_validate.log】
- `python -m sitegen validate --experiences config/experiences.yaml --content content/posts` (see `reports/sitegen_validate.log`)
- `python -m sitegen build --experiences config/experiences.yaml --src experience_src --out generated --content content/posts --all` (see `reports/sitegen_build.log`)
- `find generated -maxdepth 3 -type f | sort > reports/out_files.txt`
- `python scripts/audit_generated_site.py --out generated --routes generated/routes.json --experiences config/experiences.yaml --content content/posts` (auto-prints Top10; findings below)
- Ad-hoc publish check: `python -m http.server 8001 --directory generated` + `curl -I http://localhost:8001/` (returned directory listing, confirming no `index.html` at generated root for ruri/blog routes).

## Summary
| Severity | Count |
| --- | ---: |
| BLOCKER | 0 |
| MAJOR | 8 |
| MINOR | 0 |
| INFO | 0 |

### Top BLOCKER/MAJOR findings
1. [MAJOR] ruri home route points outside output directory
2. [MAJOR] ruri content route points outside output directory
3. [MAJOR] blog home route points outside output directory
4. [MAJOR] Content items are not distributed across experiences
5. [MAJOR] immersive home missing experience branding
6. [MAJOR] immersive list missing experience branding
7. [MAJOR] magazine home missing experience branding
8. [MAJOR] magazine list missing experience branding

## Findings (details)
### [MAJOR] ruri home route points outside output directory
- Type: `ROUTES_OUTSIDE_OUTDIR`
- Evidence: `generated/routes.json` maps `ruri.home` to `../`, resolving to `/workspace/stories/index.html` instead of under `/workspace/stories/generated`. Serving `generated/` via `python -m http.server --directory generated` yields a directory listing at `/`, so the switcher cannot reach the legacy top when published from the build root.
- Suggested next step: Place legacy pages inside the publish root or adjust route paths so all switcher targets live under `generated/`.

### [MAJOR] ruri content route points outside output directory
- Type: `ROUTES_OUTSIDE_OUTDIR`
- Evidence: `ruri.content.ep01` in `generated/routes.json` resolves to `/workspace/stories/story1.html`, which is outside `generated/`. When publishing only `generated/`, this becomes unreachable.
- Suggested next step: Copy legacy story detail into the publish root or route to a generated equivalent.

### [MAJOR] blog home route points outside output directory
- Type: `ROUTES_OUTSIDE_OUTDIR`
- Evidence: `blog.home` points to `../` (same directory-listing issue as ruri), leaving the switcher without an in-root target when hosting `generated/`.
- Suggested next step: Either remove legacy blog routes from the switcher plan or ensure a blog landing page exists inside `generated/`.

### [MAJOR] Content items are not distributed across experiences
- Type: `CONTENT_ASSIGNMENT_SUSPECT`
- Evidence: All 20 content items in `content/posts/*.json` set `"experience": "hina"`. Counts by experience: `{"hina": 20, "immersive": 0, "magazine": 0}`. Routes for immersive/magazine are still emitted, so they recycle hina content and lack dedicated assignments.
- Suggested next step: Allocate content per experience or gate route emission based on available items.

### [MAJOR] immersive home missing experience branding
- Type: `BRANDING_MISMATCH`
- Evidence: `/generated/immersive/index.html` has `<title>Hina Generated Experience | Home</title>`; expected to reference Immersive. `routes.json` uses `immersive` key, but head metadata still carries hina branding.
- Suggested next step: Inject the immersive name/description into page titles and hero metadata.

### [MAJOR] immersive list missing experience branding
- Type: `BRANDING_MISMATCH`
- Evidence: `/generated/immersive/list/index.html` title is `Hina Generated Experience | List`; expected immersive naming.
- Suggested next step: Same as above for list templates.

### [MAJOR] magazine home missing experience branding
- Type: `BRANDING_MISMATCH`
- Evidence: `/generated/magazine/index.html` title is `Hina Generated Experience | Home`; expected magazine naming.
- Suggested next step: Inject magazine-specific branding into head/hero metadata.

### [MAJOR] magazine list missing experience branding
- Type: `BRANDING_MISMATCH`
- Evidence: `/generated/magazine/list/index.html` title is `Hina Generated Experience | List`; expected magazine naming.
- Suggested next step: Fix list template to pull magazine labels.
