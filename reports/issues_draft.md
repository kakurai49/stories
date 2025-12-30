# Issues Draft (for GitHub)

## 1) [BLOCKER] Hina generated detail pages for about/character/site-meta are missing
**Observed**: After `sitegen build --all`, `generated/hina/posts` lacks detail pages for non-episode content (about-世界観, about-読みどころ, character-* entries, site-meta) even though corresponding content JSON exists. Navigation via routes.json would 404.  
**Expected**: Each content item assigned to `hina` produces a `generated/hina/posts/<slug>/index.html` detail page.  
**Repro steps**:  
1. Run `python -m sitegen build --experiences config/experiences.yaml --src experience_src --out generated --content content/posts --all`.  
2. Check `generated/hina/posts/` and note only episode/welcome items exist.  
3. Compare against content slugs in `content/posts/*.json`.  
**Evidence**: Missing files recorded in audit findings IDs 1-7 (e.g., `generated/hina/posts/about-世界観/index.html` absent). See `reports/site_audit.md` and `reports/site_audit.json`.  
**Suspected cause**: Build pipeline may filter by `pageType` or `render.kind` and skip non-story entries, or templates may not cover about/character/site-meta kinds.  
**Acceptance criteria**: All hina content slugs render to detail pages without 404s; routes.json entries resolve to existing files; automated audit reports zero MISSING_PAGE for hina.

## 2) [BLOCKER] routes.json contains legacy blog paths that resolve to missing files
**Observed**: `generated/routes.json` includes `blog` routes pointing to `../posts/*.html`, but no such files exist at repo root or under `generated/`, leading to broken switches.  
**Expected**: routes.json should reference real pages (or omit `blog` if unsupported), so switching experiences does not yield 404s.  
**Repro steps**:  
1. Open `generated/routes.json`.  
2. Resolve any `../posts/*.html` entry relative to repo root; the files are absent.  
3. Use the switcher on legacy pages to attempt navigation to `blog` content; it will 404.  
**Evidence**: Audit findings IDs 8-27 flag unresolved blog content routes. See `reports/site_audit.md` / `.json`.  
**Suspected cause**: Legacy `blog` experience is kept in configuration but not actually built or published.  
**Acceptance criteria**: routes.json only references reachable files; switcher navigation to blog items succeeds or blog routes are removed/redirected.

## 3) [BLOCKER] site-meta routes emitted for generated experiences have no backing files
**Observed**: routes.json lists `site-meta` detail URLs for hina/immersive/magazine, but no `site-meta` directories exist under `generated/<exp>/posts/`, causing switcher targets to fail.  
**Expected**: Either generate site-meta detail pages or exclude them from routes.  
**Repro steps**:  
1. Inspect `generated/routes.json` for `site-meta` entries.  
2. Check `generated/<exp>/posts/site-meta/` for hina, immersive, magazine—directories are missing.  
3. Attempt navigating to these URLs in a local server; 404 occurs.  
**Evidence**: Audit findings IDs 28-30 highlight missing site-meta targets. See `reports/site_audit.md` / `.json`.  
**Suspected cause**: Content or template coverage for `siteMeta` pageType not implemented across experiences.  
**Acceptance criteria**: site-meta entries resolve to existing pages (with correct content) or are removed from routes.json; audit no longer reports ROUTES_MISMATCH for site-meta.

## 4) [MAJOR] Content assignment limited to hina experience
**Observed**: All 20 content items set `experience: hina`; immersive and magazine have zero assigned items, yet routes are emitted for them.  
**Expected**: Content should be distributed per intended experience, or unused experiences should not publish routes.  
**Repro steps**:  
1. Inspect `content/posts/*.json` for `experience` fields (all `hina`).  
2. Check `generated/routes.json` which still contains immersive/magazine routes.  
3. Attempt to follow immersive/magazine routes; they point to duplicated hina content or missing items (e.g., site-meta).  
**Evidence**: Audit finding ID 31 (`CONTENT_ASSIGNMENT_SUSPECT`) and `reports/site_audit.json` counts.  
**Suspected cause**: Content creation not aligned with multi-experience plan; route generation not gated by available content.  
**Acceptance criteria**: Either allocate content to each generated experience or prune routes/experiences so emitted navigation reflects available content.
