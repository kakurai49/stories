# Stories explore benchmark (summary 03)

## Per-seed results

| strategy | seed | status | uniqueRoutes | steps | revisitRate | errorsTotal |
| --- | --- | --- | --- | --- | --- | --- |
| random-walk | 1 | passed | 14 | 121 | 0.881 | 0 |
| random-walk | 2 | passed | 14 | 121 | 0.878 | 0 |
| random-walk | 3 | passed | 14 | 120 | 0.878 | 0 |
| random-walk | 4 | passed | 14 | 122 | 0.876 | 0 |
| random-walk | 5 | passed | 13 | 122 | 0.886 | 0 |
| guided-coverage | 1 | passed | 14 | 121 | 0.885 | 0 |
| guided-coverage | 2 | passed | 14 | 121 | 0.885 | 0 |
| guided-coverage | 3 | passed | 14 | 122 | 0.886 | 0 |
| guided-coverage | 4 | passed | 14 | 124 | 0.888 | 0 |
| guided-coverage | 5 | passed | 14 | 125 | 0.889 | 0 |
| set-cover-greedy | 1 | passed | 14 | 124 | 0.888 | 0 |
| set-cover-greedy | 2 | passed | 14 | 125 | 0.889 | 0 |
| set-cover-greedy | 3 | passed | 14 | 123 | 0.887 | 0 |
| set-cover-greedy | 4 | passed | 14 | 124 | 0.888 | 0 |
| set-cover-greedy | 5 | passed | 14 | 124 | 0.888 | 0 |
| rl-bandit | 1 | passed | 14 | 125 | 0.889 | 0 |
| rl-bandit | 2 | passed | 14 | 122 | 0.886 | 0 |
| rl-bandit | 3 | passed | 14 | 124 | 0.888 | 0 |
| rl-bandit | 4 | passed | 14 | 125 | 0.889 | 0 |
| rl-bandit | 5 | passed | 14 | 128 | 0.891 | 0 |

## Notes

- Random-walk seed 5 under-shot coverage (13 routes) and carried the highest revisit rate within that strategy.
- rl-bandit seed 5 ran the longest (128 steps) with revisitRate ≈0.891 as the learner cycled after covering the route set.
- All runs across all strategies remained error-free.
