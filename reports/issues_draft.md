# Issues Draft (for GitHub)

## 1) [MAJOR] Switcher routes point outside published output (`generated/`)
**Observed**: `generated/routes.json` maps legacy experiences (`ruri.home`, `blog.home`, `ruri.content.ep01`) to `../...`, which resolves to files outside the `generated/` publish root. Serving `generated/` via `python -m http.server --directory generated` returns a directory listing at `/`, so switcher navigation to these entries cannot reach a real page.  
**Expected**: All switcher targets should exist under the published root, or the legacy pages should be copied into `generated/` so that `../` resolves to real content.  
**Repro steps**:  
1. Serve the build output: `python -m http.server 8000 --directory generated`.  
2. Visit `http://localhost:8000/` (shows directory listing, no legacy home).  
3. Inspect `generated/routes.json`: `ruri.home` and `blog.home` are `../`; `ruri.content.ep01` is `../story1.html`.  
4. Use the switcher on `generated/hina/index.html` and cycle to `ruri`/`blog` → navigation leaves the publish root.  
**Evidence**: Audit findings IDs 1–3 in `reports/site_audit.json`; `generated/routes.json`; `find generated -maxdepth 1 -type f` shows no `index.html` at root.  
**Suspected cause**: Routes for legacy experiences are emitted without relocating the legacy HTML into the build output, so relative `../` targets fall outside the hosted root.  
**Acceptance criteria**: Switcher links for legacy experiences resolve to real pages within the deployed root (or are removed if unsupported); loading `/` from a `generated/` server renders the intended legacy landing instead of a directory listing.

## 2) [MAJOR] All content assigned to hina; immersive/magazine have zero dedicated items
**Observed**: Every entry in `content/posts/*.json` sets `"experience": "hina"`. The audit count is `{"hina": 20, "immersive": 0, "magazine": 0}`. Despite this, routes for immersive/magazine are generated, causing those experiences to reuse hina content with no experience-specific items.  
**Expected**: Content should be distributed across experiences (or unused experiences should be hidden) so that each experience has appropriately scoped home/list/detail content.  
**Repro steps**:  
1. Inspect `content/posts/*.json` fields `experience` (all `hina`).  
2. Run `python scripts/audit_generated_site.py --out generated --routes generated/routes.json --experiences config/experiences.yaml --content content/posts`.  
3. Note finding `CONTENT_ASSIGNMENT_SUSPECT` and absence of immersive/magazine-specific content counts.  
**Evidence**: Audit finding ID 4 in `reports/site_audit.json`; content JSON files such as `content/posts/ep01.json` (`"experience": "hina"`).  
**Suspected cause**: Content curation has not been split per experience and route emission is not gated by available items.  
**Acceptance criteria**: Each generated experience has at least the required content items (home/list/detail) assigned, or the experience/routes are disabled until content exists; audit reports zero `CONTENT_ASSIGNMENT_SUSPECT`.

## 3) [MAJOR] Immersive/Magazine pages use hina branding in titles and metadata
**Observed**: `generated/immersive/index.html` and `list/index.html`, as well as the magazine equivalents, render `<title>Hina Generated Experience | ...</title>` and include hina labels in head metadata. Experience names from `config/experiences.yaml` (Immersive/Magazine) do not appear, so branding is misleading.  
**Expected**: Each experience should display its own name/description in page titles and hero metadata.  
**Repro steps**:  
1. Open `generated/immersive/index.html` or `generated/magazine/index.html` and inspect `<title>` / meta tags.  
2. Compare with expected labels in `config/experiences.yaml` (`Immersive Generated Experience`, `Magazine Generated Experience`).  
3. Run the audit script to see `BRANDING_MISMATCH` findings for these pages.  
**Evidence**: Audit findings IDs 5–8 in `reports/site_audit.json`; `<title>` tags in `generated/immersive/index.html` and `generated/magazine/index.html`.  
**Suspected cause**: Templates pull shared site-meta content (hina) instead of the current experience’s metadata.  
**Acceptance criteria**: Immersive/magazine home and list pages show their own experience names/descriptions in titles and hero areas; audit reports no `BRANDING_MISMATCH` for these pages.
