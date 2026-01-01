# QA Flow Analysis（自動生成）

- baseURL: http://127.0.0.1:3000
- startPath: /
- knownRoutes: 5（source: file:/workspace/stories/.qa/known-routes.txt）
- crawledPages: 52
- edges: 106
- unreachable: 0
- deadEnds: 19
- broken: 19

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

## Dead Ends（遷移先リンクが見つからないページ）

- /nagi-s1/_buildinfo.json
- /nagi-s1/generated/list
- /nagi-s1/generated/posts/ep01
- /nagi-s1/generated/posts/ep02
- /nagi-s1/generated/posts/ep03
- /nagi-s1/generated/posts/ep04
- /nagi-s1/generated/posts/ep05
- /nagi-s1/generated/posts/ep06
- /nagi-s1/generated/posts/ep07
- /nagi-s1/generated/posts/ep08
- /nagi-s1/generated/posts/ep09
- /nagi-s1/generated/posts/ep10
- /nagi-s1/generated/posts/ep11
- /nagi-s1/generated/posts/ep12
- /nagi-s1/hina
- /nagi-s1/immersive
- /nagi-s1/magazine
- /nagi-s1/routes.json
- /nagi-s1/shared

## Broken（移動失敗・HTTP>=400 等）

- from: `/nagi-s1/generated/list` / href: `http://127.0.0.1:3000/nagi-s1/generated/list` / reason: HTTP 404
- from: `/nagi-s1/generated/posts/ep01` / href: `http://127.0.0.1:3000/nagi-s1/generated/posts/ep01` / reason: HTTP 404
- from: `/nagi-s1/generated/posts/ep02` / href: `http://127.0.0.1:3000/nagi-s1/generated/posts/ep02` / reason: HTTP 404
- from: `/nagi-s1/generated/posts/ep03` / href: `http://127.0.0.1:3000/nagi-s1/generated/posts/ep03` / reason: HTTP 404
- from: `/nagi-s1/generated/posts/ep04` / href: `http://127.0.0.1:3000/nagi-s1/generated/posts/ep04` / reason: HTTP 404
- from: `/nagi-s1/generated/posts/ep05` / href: `http://127.0.0.1:3000/nagi-s1/generated/posts/ep05` / reason: HTTP 404
- from: `/nagi-s1/generated/posts/ep06` / href: `http://127.0.0.1:3000/nagi-s1/generated/posts/ep06` / reason: HTTP 404
- from: `/nagi-s1/generated/posts/ep07` / href: `http://127.0.0.1:3000/nagi-s1/generated/posts/ep07` / reason: HTTP 404
- from: `/nagi-s1/generated/posts/ep08` / href: `http://127.0.0.1:3000/nagi-s1/generated/posts/ep08` / reason: HTTP 404
- from: `/nagi-s1/generated/posts/ep09` / href: `http://127.0.0.1:3000/nagi-s1/generated/posts/ep09` / reason: HTTP 404
- from: `/nagi-s1/generated/posts/ep10` / href: `http://127.0.0.1:3000/nagi-s1/generated/posts/ep10` / reason: HTTP 404
- from: `/nagi-s1/generated/posts/ep11` / href: `http://127.0.0.1:3000/nagi-s1/generated/posts/ep11` / reason: HTTP 404
- from: `/nagi-s1/generated/posts/ep12` / href: `http://127.0.0.1:3000/nagi-s1/generated/posts/ep12` / reason: HTTP 404
- from: `/nagi-s1/_buildinfo.json` / href: `http://127.0.0.1:3000/nagi-s1/_buildinfo.json` / reason: HTTP 404
- from: `/nagi-s1/hina` / href: `http://127.0.0.1:3000/nagi-s1/hina` / reason: HTTP 404
- from: `/nagi-s1/immersive` / href: `http://127.0.0.1:3000/nagi-s1/immersive` / reason: HTTP 404
- from: `/nagi-s1/magazine` / href: `http://127.0.0.1:3000/nagi-s1/magazine` / reason: HTTP 404
- from: `/nagi-s1/routes.json` / href: `http://127.0.0.1:3000/nagi-s1/routes.json` / reason: HTTP 404
- from: `/nagi-s1/shared` / href: `http://127.0.0.1:3000/nagi-s1/shared` / reason: HTTP 404

## Blocked External Requests（外部アクセス遮断ログ）

- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js
- https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js

