# Stories explore benchmark (summary 02)

## Strategy-level metrics

| strategy | runs | passed | failed | uniqueRoutes (avg/med/min/max) | steps (avg/med/min/max) | errorsTotal (avg/med/min/max) | revisitRate (avg) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| random-walk | 5 | 5 | 0 | 13.80/14.00/13.00/14.00 | 121.20/121.00/120.00/122.00 | 0.00/0.00/0.00/0.00 | 0.880 |
| guided-coverage | 5 | 5 | 0 | 14.00/14.00/14.00/14.00 | 122.60/122.00/121.00/125.00 | 0.00/0.00/0.00/0.00 | 0.887 |
| set-cover-greedy | 5 | 5 | 0 | 14.00/14.00/14.00/14.00 | 124.00/124.00/123.00/125.00 | 0.00/0.00/0.00/0.00 | 0.888 |
| rl-bandit | 5 | 5 | 0 | 14.00/14.00/14.00/14.00 | 124.80/125.00/122.00/128.00 | 0.00/0.00/0.00/0.00 | 0.889 |

## Notes

- Coverage parity: guided-coverage, set-cover-greedy, and rl-bandit all held 14.00 unique routes on average; random-walk trailed slightly at 13.80.
- Request load (avg requestsTotal): random-walk ~738.2, guided-coverage ~798.6, set-cover-greedy ~807.8, rl-bandit ~813.0.
- Errors: all runs recorded 0 errors; guided-coverage also achieved flow coverageRate ≈1.31 because target set hits exceeded the 94-route goal.
