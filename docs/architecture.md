# Architecture Overview

This document outlines the foundational terms for the site generator:

- **experience**: A collection of pages or flows that share a common goal.
- **pageType**: A category describing the layout or purpose of a page within an experience.
- **contentId**: An identifier used to locate or reference specific content assets.
- **routes.json**: A manifest describing the routes available in an experience.

## Data attribute contract

Markup rendered by the generator is annotated with data attributes so that hydration and
client-side navigation can resolve the correct assets:

- `data-experience`: The experience key (e.g., `blog`) that owns the current DOM tree.
- `data-page-type`: The page type used to select a template (e.g., `post`).
- `data-content-id`: The stable `contentId` for the bound content item.
- `data-routes-href`: An absolute or relative path to a `routes.json` payload.
  This JSON follows the `RouteMap` schema and lists each route with its `href`,
  `pageType`, `contentId`, and optional `dataHref`. Client code can dereference the
  attribute to prefetch or hydrate navigation models without hard-coding URLs.

Example linkage in markup:

```html
<nav
  data-experience="blog"
  data-page-type="post"
  data-content-id="welcome-post"
  data-routes-href="/config/routes.json"
>
  ...
</nav>
```

The referenced `routes.json` would look like:

```json
{
  "experience": "blog",
  "version": "1.0",
  "routes": [
    {
      "href": "/stories/welcome-post",
      "pageType": "post",
      "contentId": "welcome-post",
      "dataHref": "/data/routes/welcome-post.json"
    }
  ]
}
```

These conventions ensure that runtime components can discover routing metadata
without coupling to build-time file layouts.
