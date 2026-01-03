# Stories explore benchmark (summary 04)

## Recommendations

1. **Primary**: guided-coverage — matched the top coverage (14 routes, coverageRate ≈1.31 with flow targets) while keeping request volume moderate (~799 requests/run) and revisitRate ≈0.887.
2. **Secondary**: set-cover-greedy — same route coverage with slightly higher traffic (~808 requests/run) but deterministic target ordering; rl-bandit is close in coverage yet a bit heavier on requests (~813/run), so treat it as the adaptive alternative when exploration needs to rebalance dynamically.

## Trade-offs

- Errors: all 20 runs were clean (no HTTP/console/page failures) across every strategy.
- Coverage: guided-coverage, set-cover-greedy, and rl-bandit all held 14.00 unique routes on average; random-walk trailed at 13.80 but produced the lowest request load.
- Requests (avg requestsTotal): random-walk ~738.2, guided-coverage ~798.6, set-cover-greedy ~807.8, rl-bandit ~813.0.
- Revisit rates clustered between 0.880 (random-walk) and 0.889 (rl-bandit); bandit’s higher step count (up to 128) comes from late-run looping once coverage plateaued.

## Bandit observations

- State snapshot (seed 5): 14 states, 51 arms, 128 pulls; examples include `/nagi-s1/generated/hina → list` (mean 0.60, pulls 3) and `/nagi-s1/generated/hina/list → posts/ep11` (mean 0.80, pulls 3), showing the learner preferred deeper episode links after initial exploration.
- Learning trajectory (seed 5 steps): first 10 steps gained 6 new routes with average reward ≈1.46, while the last 10 steps added 0 routes and averaged −0.66 reward, evidencing a plateau into revisits despite restart scheduling.
- Evidence files: `steps.jsonl` now logs reward/gain/revisit flags alongside candidate samples and coverage deltas, and `rl-bandit-state.json` captures per-state arm counts/means for each bench run.

## Top requests (aggregated)

1. /nagi-s1/generated/hina/assets/tokens.css — 2,447 requests (asset)
2. /nagi-s1/generated/hina/assets/base.css — 2,447 requests (asset)
3. /nagi-s1/generated/hina/assets/components.css — 2,447 requests (asset)
4. /nagi-s1/generated/shared/switcher.css — 2,447 requests (asset)
5. /nagi-s1/generated/shared/switcher.js — 2,447 requests (asset)
6. /nagi-s1/generated/shared/features/init-features.js — 1,106 requests (asset)
7. /nagi-s1/generated/hina — 792 requests (route)
8. /nagi-s1/generated/hina/list — 549 requests (route)
9. /nagi-s1/generated/hina/posts/ep09 — 104 requests (route)
10. /nagi-s1/generated/hina/posts/ep01 — 99 requests (route)

Breakdown: 4 routes, 6 assets, 0 other. Shared hina styles/scripts dominate, with traffic concentrating on the home/list pages and early episode routes; no API endpoints surfaced in the top set.

## Suggested next steps

- Adjust bandit rewards to penalize late-stage loops (e.g., stronger negative weight on recentLoop/revisited after coverage saturates) and consider decay for overused arms to keep exploration fresh.
- If request volume is a concern, prefer guided-coverage or set-cover-greedy; use rl-bandit when adaptive arm selection is desired and the extra traffic is acceptable.
