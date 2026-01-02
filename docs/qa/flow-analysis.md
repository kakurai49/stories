# QA Flow Analysis（自動生成）

- baseURL: http://127.0.0.1:3000
- startPath: /
- knownRoutes: 11（source: file:/workspace/stories/.qa/known-routes.txt）
- crawledPages: 94
- edges: 362
- unreachable: 0
- deadEndsOk: 1
- broken: 0 (raw: 0)
- consoleErrors: uniq 1 / total 36
- blockedExternalRequests: uniq 3 / total 36

## Top Hubs（リンクが多いページ）

- /nagi-s2/generated_v2/hina (out=15)
- /nagi-s2/generated_v2/hina/list (out=15)
- /nagi-s2/generated/hina (out=15)
- /nagi-s3/generated_v2/hina (out=15)
- /nagi-s3/generated_v2/hina/list (out=15)
- /nagi-s3/generated/hina (out=15)
- /nagi-s1/generated/hina (out=14)
- /nagi-s1/generated/hina/index.html (out=14)
- /nagi-s1/generated/hina/list (out=14)
- /nagi-s1/generated/immersive (out=14)

## Dead Ends OK（broken を除く、遷移先リンクが見つからないページ）

- /nagi-s1/generated/routes.json

## Console Errors（ユニーク）

- (36) console: Failed to load resource: net::ERR_FAILED

## Blocked External Requests（ユニーク外部アクセス遮断ログ）

- (12) https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js
- (12) https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css
- (12) https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js

