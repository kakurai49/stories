# Exploratory Test Checklist

## Setup
- Serve the built site locally: `python -m http.server 8000 --directory generated`
- Use both desktop and mobile viewport toggles; test iOS Safari-style back/forward navigation if possible.

## Flows to cover
- Legacy top (`http://localhost:8000/index.html`) → switcher → hina/immersive/magazine home → return.
- Legacy story (`http://localhost:8000/story1.html`) → switcher → generated detail → back navigation.
- Generated home (each experience) → list → first detail (ep01) → switcher → another experience.
- Scroll/anchor checks on home pages: `#about`, `#episodes`, `#characters` (verify smooth scroll and element presence).
- Verify 404 handling: capture the URL whenever a route from switcher or in-page link fails.

## Observations to log
- Broken or missing assets (CSS/JS) and console errors.
- Visual differences between experiences (layout, components) and any unexpected uniformity.
- Behavior of the experience switcher across routes (does it retain context, does it misroute).
- Mobile interactions: address bar collapse/expand, back swipe, tap targets near anchors or nav.

## 404/issue template
- URL:
- Action (click path):
- Expected:
- Actual:
- Screenshot / console snippet (if available):
