# Site Audit Report

## Overview

- Executed: 2025-12-30T10:20:17.115098+00:00
- Out dir: /workspace/stories/generated
- Command: `python scripts/audit_generated_site.py --out generated --routes /workspace/stories/generated/routes.json --experiences config/experiences.yaml --content content/posts `
- Parser: beautifulsoup4

## Summary

| Severity | Count |
| --- | ---: |
| BLOCKER | 30 |
| MAJOR | 1 |
| MINOR | 0 |
| INFO | 0 |

## Context notes

- Repository inventory captured via `find . -maxdepth 4 -print` because `tree` was unavailable in the container.
- No GitHub Actions / Pages workflow files were found; audit assumes the publish root is the default `generated/`.
- Headless exploratory browsing (Playwright) was not executed; link and asset checks rely on static HTML crawling.

## Key observations

- Generated experience `hina` lacks detail pages for non-episode content (about/character/site-meta), resulting in missing files referenced by routes.
- `routes.json` contains numerous entries pointing to nonexistent `../posts/*.html` blog pages and `site-meta` detail routes across experiences.
- All content items target only the `hina` experience; `immersive` and `magazine` currently have zero assigned items.

## Findings (sorted by severity)

### [BLOCKER] Detail page missing for hina slug=about-世界観

- Type: `MISSING_PAGE`
- ID: 1
- Evidence: `{"expected": "/workspace/stories/generated/hina/posts/about-世界観/index.html"}`
- Suggested: Check slug resolution and ensure build generated detail pages.

### [BLOCKER] Detail page missing for hina slug=about-読みどころ

- Type: `MISSING_PAGE`
- ID: 2
- Evidence: `{"expected": "/workspace/stories/generated/hina/posts/about-読みどころ/index.html"}`
- Suggested: Check slug resolution and ensure build generated detail pages.

### [BLOCKER] Detail page missing for hina slug=character-サキュバスメイド喫茶∞

- Type: `MISSING_PAGE`
- ID: 3
- Evidence: `{"expected": "/workspace/stories/generated/hina/posts/character-サキュバスメイド喫茶∞/index.html"}`
- Suggested: Check slug resolution and ensure build generated detail pages.

### [BLOCKER] Detail page missing for hina slug=character-バルハ

- Type: `MISSING_PAGE`
- ID: 4
- Evidence: `{"expected": "/workspace/stories/generated/hina/posts/character-バルハ/index.html"}`
- Suggested: Check slug resolution and ensure build generated detail pages.

### [BLOCKER] Detail page missing for hina slug=character-神崎ナギ

- Type: `MISSING_PAGE`
- ID: 5
- Evidence: `{"expected": "/workspace/stories/generated/hina/posts/character-神崎ナギ/index.html"}`
- Suggested: Check slug resolution and ensure build generated detail pages.

### [BLOCKER] Detail page missing for hina slug=character-結城ユイ

- Type: `MISSING_PAGE`
- ID: 6
- Evidence: `{"expected": "/workspace/stories/generated/hina/posts/character-結城ユイ/index.html"}`
- Suggested: Check slug resolution and ensure build generated detail pages.

### [BLOCKER] Detail page missing for hina slug=site-meta

- Type: `MISSING_PAGE`
- ID: 7
- Evidence: `{"expected": "/workspace/stories/generated/hina/posts/site-meta/index.html"}`
- Suggested: Check slug resolution and ensure build generated detail pages.

### [BLOCKER] blog content route missing for about-世界観

- Type: `ROUTES_MISMATCH`
- ID: 8
- Evidence: `{"route": "../posts/about-世界観.html", "resolved": null}`
- Suggested: Ensure content items are generated and routes.json matches the output structure.

### [BLOCKER] blog content route missing for about-読みどころ

- Type: `ROUTES_MISMATCH`
- ID: 9
- Evidence: `{"route": "../posts/about-読みどころ.html", "resolved": null}`
- Suggested: Ensure content items are generated and routes.json matches the output structure.

### [BLOCKER] blog content route missing for character-サキュバスメイド喫茶∞

- Type: `ROUTES_MISMATCH`
- ID: 10
- Evidence: `{"route": "../posts/character-サキュバスメイド喫茶∞.html", "resolved": null}`
- Suggested: Ensure content items are generated and routes.json matches the output structure.

### [BLOCKER] blog content route missing for character-バルハ

- Type: `ROUTES_MISMATCH`
- ID: 11
- Evidence: `{"route": "../posts/character-バルハ.html", "resolved": null}`
- Suggested: Ensure content items are generated and routes.json matches the output structure.

### [BLOCKER] blog content route missing for character-神崎ナギ

- Type: `ROUTES_MISMATCH`
- ID: 12
- Evidence: `{"route": "../posts/character-神崎ナギ.html", "resolved": null}`
- Suggested: Ensure content items are generated and routes.json matches the output structure.

### [BLOCKER] blog content route missing for character-結城ユイ

- Type: `ROUTES_MISMATCH`
- ID: 13
- Evidence: `{"route": "../posts/character-結城ユイ.html", "resolved": null}`
- Suggested: Ensure content items are generated and routes.json matches the output structure.

### [BLOCKER] blog content route missing for ep01

- Type: `ROUTES_MISMATCH`
- ID: 14
- Evidence: `{"route": "../posts/ep01.html", "resolved": null}`
- Suggested: Ensure content items are generated and routes.json matches the output structure.

### [BLOCKER] blog content route missing for ep02

- Type: `ROUTES_MISMATCH`
- ID: 15
- Evidence: `{"route": "../posts/ep02.html", "resolved": null}`
- Suggested: Ensure content items are generated and routes.json matches the output structure.

### [BLOCKER] blog content route missing for ep03

- Type: `ROUTES_MISMATCH`
- ID: 16
- Evidence: `{"route": "../posts/ep03.html", "resolved": null}`
- Suggested: Ensure content items are generated and routes.json matches the output structure.

### [BLOCKER] blog content route missing for ep04

- Type: `ROUTES_MISMATCH`
- ID: 17
- Evidence: `{"route": "../posts/ep04.html", "resolved": null}`
- Suggested: Ensure content items are generated and routes.json matches the output structure.

### [BLOCKER] blog content route missing for ep05

- Type: `ROUTES_MISMATCH`
- ID: 18
- Evidence: `{"route": "../posts/ep05.html", "resolved": null}`
- Suggested: Ensure content items are generated and routes.json matches the output structure.

### [BLOCKER] blog content route missing for ep06

- Type: `ROUTES_MISMATCH`
- ID: 19
- Evidence: `{"route": "../posts/ep06.html", "resolved": null}`
- Suggested: Ensure content items are generated and routes.json matches the output structure.

### [BLOCKER] blog content route missing for ep07

- Type: `ROUTES_MISMATCH`
- ID: 20
- Evidence: `{"route": "../posts/ep07.html", "resolved": null}`
- Suggested: Ensure content items are generated and routes.json matches the output structure.

### [BLOCKER] blog content route missing for ep08

- Type: `ROUTES_MISMATCH`
- ID: 21
- Evidence: `{"route": "../posts/ep08.html", "resolved": null}`
- Suggested: Ensure content items are generated and routes.json matches the output structure.

### [BLOCKER] blog content route missing for ep09

- Type: `ROUTES_MISMATCH`
- ID: 22
- Evidence: `{"route": "../posts/ep09.html", "resolved": null}`
- Suggested: Ensure content items are generated and routes.json matches the output structure.

### [BLOCKER] blog content route missing for ep10

- Type: `ROUTES_MISMATCH`
- ID: 23
- Evidence: `{"route": "../posts/ep10.html", "resolved": null}`
- Suggested: Ensure content items are generated and routes.json matches the output structure.

### [BLOCKER] blog content route missing for ep11

- Type: `ROUTES_MISMATCH`
- ID: 24
- Evidence: `{"route": "../posts/ep11.html", "resolved": null}`
- Suggested: Ensure content items are generated and routes.json matches the output structure.

### [BLOCKER] blog content route missing for ep12

- Type: `ROUTES_MISMATCH`
- ID: 25
- Evidence: `{"route": "../posts/ep12.html", "resolved": null}`
- Suggested: Ensure content items are generated and routes.json matches the output structure.

### [BLOCKER] blog content route missing for site-meta

- Type: `ROUTES_MISMATCH`
- ID: 26
- Evidence: `{"route": "../posts/site-meta.html", "resolved": null}`
- Suggested: Ensure content items are generated and routes.json matches the output structure.

### [BLOCKER] blog content route missing for welcome-post

- Type: `ROUTES_MISMATCH`
- ID: 27
- Evidence: `{"route": "../posts/welcome-post.html", "resolved": null}`
- Suggested: Ensure content items are generated and routes.json matches the output structure.

### [BLOCKER] hina content route missing for site-meta

- Type: `ROUTES_MISMATCH`
- ID: 28
- Evidence: `{"route": "hina/posts/site-meta/", "resolved": null}`
- Suggested: Ensure content items are generated and routes.json matches the output structure.

### [BLOCKER] immersive content route missing for site-meta

- Type: `ROUTES_MISMATCH`
- ID: 29
- Evidence: `{"route": "immersive/posts/site-meta/", "resolved": null}`
- Suggested: Ensure content items are generated and routes.json matches the output structure.

### [BLOCKER] magazine content route missing for site-meta

- Type: `ROUTES_MISMATCH`
- ID: 30
- Evidence: `{"route": "magazine/posts/site-meta/", "resolved": null}`
- Suggested: Ensure content items are generated and routes.json matches the output structure.

### [MAJOR] Content items are not distributed across experiences

- Type: `CONTENT_ASSIGNMENT_SUSPECT`
- ID: 31
- Evidence: `{"counts": {"hina": 20}, "missingGeneratedExperiences": ["magazine", "immersive"]}`
- Suggested: Confirm intended experience assignment per content item; add items for missing experiences or adjust routing.
