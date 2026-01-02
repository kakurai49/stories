# QA Flow Analysis（自動生成）

- baseURL: http://127.0.0.1:3000
- startPath: /
- knownRoutes: 5（source: file:/workspace/stories/.qa/known-routes.txt）
- crawledPages: 52
- edges: 106
- unreachable: 0
- deadEndsOk: 0
- broken: 19 (raw: 19)
- consoleErrors: uniq 2 / total 55
- blockedExternalRequests: uniq 3 / total 36

## Top Hubs（リンクが多いページ）

- /nagi-s1/generated/hina (out=14)
- /nagi-s1/generated/hina/index.html (out=14)
- /nagi-s1/generated/hina/list (out=14)
- /nagi-s1/index.html (out=12)
- /nagi-s1/generated (out=6)
- / (out=4)
- /index.html (out=4)
- /nagi-s1/generated/hina/posts/ep01 (out=2)
- /nagi-s1/generated/hina/posts/ep02 (out=2)
- /nagi-s1/generated/hina/posts/ep03 (out=2)

## Broken（移動失敗・HTTP>=400 等）

- target: `/nagi-s1/_buildinfo.json`
  - href samples: `http://127.0.0.1:3000/nagi-s1/_buildinfo.json`
  - reason: HTTP 404
  - inbound: `/nagi-s1/_buildinfo.json`, `/nagi-s1/generated`
  - 置換候補: (なし)
- target: `/nagi-s1/generated/list`
  - href samples: `http://127.0.0.1:3000/nagi-s1/generated/list`
  - reason: HTTP 404
  - inbound: `/nagi-s1/generated/hina`, `/nagi-s1/generated/hina/posts/ep01`, `/nagi-s1/generated/hina/posts/ep02`, `/nagi-s1/generated/hina/posts/ep03`, `/nagi-s1/generated/hina/posts/ep04`, `/nagi-s1/generated/hina/posts/ep05`, `/nagi-s1/generated/hina/posts/ep06`, `/nagi-s1/generated/hina/posts/ep07`, `/nagi-s1/generated/hina/posts/ep08`, `/nagi-s1/generated/hina/posts/ep09`, `/nagi-s1/generated/hina/posts/ep10`, `/nagi-s1/generated/hina/posts/ep11`, `/nagi-s1/generated/hina/posts/ep12`, `/nagi-s1/generated/list`
  - 置換候補: `/nagi-s1/generated/hina/list`
- target: `/nagi-s1/generated/posts/ep01`
  - href samples: `http://127.0.0.1:3000/nagi-s1/generated/posts/ep01`
  - reason: HTTP 404
  - inbound: `/nagi-s1/generated/hina`, `/nagi-s1/generated/hina/list`, `/nagi-s1/generated/posts/ep01`
  - 置換候補: `/nagi-s1/generated/hina/posts/ep01`
- target: `/nagi-s1/generated/posts/ep02`
  - href samples: `http://127.0.0.1:3000/nagi-s1/generated/posts/ep02`
  - reason: HTTP 404
  - inbound: `/nagi-s1/generated/hina`, `/nagi-s1/generated/hina/list`, `/nagi-s1/generated/posts/ep02`
  - 置換候補: `/nagi-s1/generated/hina/posts/ep02`
- target: `/nagi-s1/generated/posts/ep03`
  - href samples: `http://127.0.0.1:3000/nagi-s1/generated/posts/ep03`
  - reason: HTTP 404
  - inbound: `/nagi-s1/generated/hina`, `/nagi-s1/generated/hina/list`, `/nagi-s1/generated/posts/ep03`
  - 置換候補: `/nagi-s1/generated/hina/posts/ep03`
- target: `/nagi-s1/generated/posts/ep04`
  - href samples: `http://127.0.0.1:3000/nagi-s1/generated/posts/ep04`
  - reason: HTTP 404
  - inbound: `/nagi-s1/generated/hina`, `/nagi-s1/generated/hina/list`, `/nagi-s1/generated/posts/ep04`
  - 置換候補: `/nagi-s1/generated/hina/posts/ep04`
- target: `/nagi-s1/generated/posts/ep05`
  - href samples: `http://127.0.0.1:3000/nagi-s1/generated/posts/ep05`
  - reason: HTTP 404
  - inbound: `/nagi-s1/generated/hina`, `/nagi-s1/generated/hina/list`, `/nagi-s1/generated/posts/ep05`
  - 置換候補: `/nagi-s1/generated/hina/posts/ep05`
- target: `/nagi-s1/generated/posts/ep06`
  - href samples: `http://127.0.0.1:3000/nagi-s1/generated/posts/ep06`
  - reason: HTTP 404
  - inbound: `/nagi-s1/generated/hina`, `/nagi-s1/generated/hina/list`, `/nagi-s1/generated/posts/ep06`
  - 置換候補: `/nagi-s1/generated/hina/posts/ep06`
- target: `/nagi-s1/generated/posts/ep07`
  - href samples: `http://127.0.0.1:3000/nagi-s1/generated/posts/ep07`
  - reason: HTTP 404
  - inbound: `/nagi-s1/generated/hina`, `/nagi-s1/generated/hina/list`, `/nagi-s1/generated/posts/ep07`
  - 置換候補: `/nagi-s1/generated/hina/posts/ep07`
- target: `/nagi-s1/generated/posts/ep08`
  - href samples: `http://127.0.0.1:3000/nagi-s1/generated/posts/ep08`
  - reason: HTTP 404
  - inbound: `/nagi-s1/generated/hina`, `/nagi-s1/generated/hina/list`, `/nagi-s1/generated/posts/ep08`
  - 置換候補: `/nagi-s1/generated/hina/posts/ep08`
- target: `/nagi-s1/generated/posts/ep09`
  - href samples: `http://127.0.0.1:3000/nagi-s1/generated/posts/ep09`
  - reason: HTTP 404
  - inbound: `/nagi-s1/generated/hina`, `/nagi-s1/generated/hina/list`, `/nagi-s1/generated/posts/ep09`
  - 置換候補: `/nagi-s1/generated/hina/posts/ep09`
- target: `/nagi-s1/generated/posts/ep10`
  - href samples: `http://127.0.0.1:3000/nagi-s1/generated/posts/ep10`
  - reason: HTTP 404
  - inbound: `/nagi-s1/generated/hina`, `/nagi-s1/generated/hina/list`, `/nagi-s1/generated/posts/ep10`
  - 置換候補: `/nagi-s1/generated/hina/posts/ep10`
- target: `/nagi-s1/generated/posts/ep11`
  - href samples: `http://127.0.0.1:3000/nagi-s1/generated/posts/ep11`
  - reason: HTTP 404
  - inbound: `/nagi-s1/generated/hina`, `/nagi-s1/generated/hina/list`, `/nagi-s1/generated/posts/ep11`
  - 置換候補: `/nagi-s1/generated/hina/posts/ep11`
- target: `/nagi-s1/generated/posts/ep12`
  - href samples: `http://127.0.0.1:3000/nagi-s1/generated/posts/ep12`
  - reason: HTTP 404
  - inbound: `/nagi-s1/generated/hina`, `/nagi-s1/generated/hina/list`, `/nagi-s1/generated/posts/ep12`
  - 置換候補: `/nagi-s1/generated/hina/posts/ep12`
- target: `/nagi-s1/hina`
  - href samples: `http://127.0.0.1:3000/nagi-s1/hina`
  - reason: HTTP 404
  - inbound: `/nagi-s1/generated`, `/nagi-s1/hina`
  - 置換候補: `/nagi-s1/generated/hina`
- target: `/nagi-s1/immersive`
  - href samples: `http://127.0.0.1:3000/nagi-s1/immersive`
  - reason: HTTP 404
  - inbound: `/nagi-s1/generated`, `/nagi-s1/immersive`
  - 置換候補: (なし)
- target: `/nagi-s1/magazine`
  - href samples: `http://127.0.0.1:3000/nagi-s1/magazine`
  - reason: HTTP 404
  - inbound: `/nagi-s1/generated`, `/nagi-s1/magazine`
  - 置換候補: (なし)
- target: `/nagi-s1/routes.json`
  - href samples: `http://127.0.0.1:3000/nagi-s1/routes.json`
  - reason: HTTP 404
  - inbound: `/nagi-s1/generated`, `/nagi-s1/routes.json`
  - 置換候補: (なし)
- target: `/nagi-s1/shared`
  - href samples: `http://127.0.0.1:3000/nagi-s1/shared`
  - reason: HTTP 404
  - inbound: `/nagi-s1/generated`, `/nagi-s1/shared`
  - 置換候補: (なし)

## Console Errors（ユニーク）

- (36) console: Failed to load resource: net::ERR_FAILED
- (19) console: Failed to load resource: the server responded with a status of 404 (File not found)

## Blocked External Requests（ユニーク外部アクセス遮断ログ）

- (12) https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js
- (12) https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css
- (12) https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js

