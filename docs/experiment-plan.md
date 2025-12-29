# Experiment Plan: Template Experiment Plan

Experiments across story templates to compare engagement and completion performance.

## hina – Hina Story

AI-hosted persona narrative tailored for new visitors.

### Metrics
- **completion_rate**: Percentage of sessions reaching the final Hina card. | Target: Increase completions relative to control.
- **avg_dwell_time**: Average seconds spent on the Hina story page. | Target: Lift time-on-page for narrative-driven sessions.

### Events
- **story_load**
  - When: When a Hina story page is shown.
  - Properties: story_id, template, traffic_source
- **story_complete**
  - When: When a user finishes the Hina narrative.
  - Properties: story_id, template, duration_seconds

## immersive – Immersive Panel

Swipeable immersive reading flow for engaged users.

### Metrics
- **scroll_depth**: Median scroll depth across immersive panels. | Target: Reach 75% median scroll depth.
- **interaction_rate**: Share of users interacting with swipe or tap actions. | Target: Improve gesture interactions session-over-session.

### Events
- **panel_swipe**
  - When: On each swipe between immersive panels.
  - Properties: story_id, panel_index, direction, template
- **cta_click**
  - When: When the immersive CTA is clicked.
  - Properties: story_id, cta_destination, template

## magazine – Magazine Layout

Editorial-style layout for users browsing multiple articles.

### Metrics
- **article_click_through**: Click-through rate from magazine grid to articles. | Target: Lift CTR compared to classic listing.
- **session_pages_viewed**: Average articles opened per session. | Target: Reach 2.0+ articles per session.

### Events
- **grid_impression**
  - When: When the magazine grid loads.
  - Properties: section, template, story_count
- **article_open**
  - When: When a user opens an article from the grid.
  - Properties: story_id, position, template
