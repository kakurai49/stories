# Stories explore benchmark (summary 04)

## Recommendations

1. **Primary**: guided-coverage — coverage leader with revisit rate 0.901 and ~916.6 requests/run.
2. **Secondary**: set-cover-greedy — same coverage tier; trade a bit more traffic (~917.8) for deterministic target selection.

## Trade-offs

- Errors: all runs were clean (no HTTP/console/page failures).
- Coverage: guided-coverage, set-cover-greedy held 14.00 unique routes on average; random-walk trailed at 13.80.
- Requests (avg requestsTotal): random-walk ~857.0, guided-coverage ~916.6, set-cover-greedy ~917.8
- Lowest revisit rate: guided-coverage (0.901)
- Request volume spread (avg): 857.0 – 917.8

## Top requests (aggregated)

1. /nagi-s1/generated/hina/assets/tokens.css — 2086 requests (asset)
2. /nagi-s1/generated/hina/assets/base.css — 2086 requests (asset)
3. /nagi-s1/generated/hina/assets/components.css — 2086 requests (asset)
4. /nagi-s1/generated/shared/switcher.css — 2086 requests (asset)
5. /nagi-s1/generated/shared/switcher.js — 2086 requests (asset)
6. /nagi-s1/generated/shared/features/init-features.js — 941 requests (asset)
7. /nagi-s1/generated/hina — 686 requests (route)
8. /nagi-s1/generated/hina/list — 459 requests (route)
9. /nagi-s1/generated/hina/posts/ep01 — 90 requests (route)
10. /nagi-s1/generated/hina/posts/ep09 — 86 requests (route)

Breakdown: 4 routes, 6 assets, 0 other. Assets dominate the top list, reflecting shared hina styling scripts; the route entries cover the hina home, list, and early episodes with no API calls surfacing in the top set.