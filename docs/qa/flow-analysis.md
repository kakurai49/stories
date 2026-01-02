# QA Flow Analysis（自動生成）

- baseURL: http://127.0.0.1:3000
- startPath: /
- knownRoutes: 5（source: file:/workspace/stories/.qa/known-routes.txt）
- crawledPages: 32
- edges: 100
- unreachable: 0
- deadEndsOk: 0
- broken: 0 (raw: 0)
- consoleErrors: uniq 1 / total 36
- blockedExternalRequests: uniq 3 / total 36

## Top Hubs（リンクが多いページ）

- /nagi-s1/generated/hina (out=14)
- /nagi-s1/generated/hina/index.html (out=14)
- /nagi-s1/generated/hina/list (out=14)
- /nagi-s1/index.html (out=12)
- / (out=4)
- /index.html (out=4)
- /nagi-s1/generated/hina/posts/ep01 (out=2)
- /nagi-s1/generated/hina/posts/ep02 (out=2)
- /nagi-s1/generated/hina/posts/ep03 (out=2)
- /nagi-s1/generated/hina/posts/ep04 (out=2)

## Console Errors（ユニーク）

- (36) console: Failed to load resource: net::ERR_FAILED

## Blocked External Requests（ユニーク外部アクセス遮断ログ）

- (12) https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js
- (12) https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css
- (12) https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js

