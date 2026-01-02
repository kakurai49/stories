# Stories explore benchmark (summary 02)

## Strategy-level metrics

| strategy | runs | passed | failed | uniqueRoutes (avg/med/min/max) | steps (avg/med/min/max) | errorsTotal (avg/med/min/max) | revisitRate (avg) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| guided-coverage | 5 | 5 | 0 | 14.00/14.00/14.00/14.00 | 140.80/141.00/139.00/142.00 | 0.00/0.00/0.00/0.00 | 0.901 |
| random-walk | 5 | 5 | 0 | 13.80/14.00/13.00/14.00 | 141.60/142.00/140.00/143.00 | 0.00/0.00/0.00/0.00 | 0.903 |
| set-cover-greedy | 5 | 5 | 0 | 14.00/14.00/14.00/14.00 | 141.00/141.00/140.00/142.00 | 0.00/0.00/0.00/0.00 | 0.901 |

## Notes

- Coverage leaders: guided-coverage, set-cover-greedy at 14.00; trailing average: random-walk at 13.80
- Request load (avg requestsTotal): random-walk ~857.0, guided-coverage ~916.6, set-cover-greedy ~917.8
- Errors: all runs recorded 0 errors.