(function experienceSwitcher() {
  const button = document.querySelector('button.view-switcher[data-action="switch-experience"]');
  const { experience: current, contentId, routesHref } = document.body.dataset || {};
  if (!button || !routesHref || !current) return;

  const routesUrl = new URL(routesHref, window.location.href);
  let cache = null;

  async function loadRoutes() {
    if (cache) return cache;
    const response = await fetch(routesUrl.href);
    if (!response.ok) {
      throw new Error(`Failed to load routes: ${response.status}`);
    }
    cache = await response.json();
    return cache;
  }

  button.addEventListener('click', async () => {
    try {
      const payload = await loadRoutes();
      const order = payload.order || [];
      if (!order.length) return;

      const currentIndex = order.indexOf(current);
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % order.length;
      const nextKey = order[nextIndex];
      const nextRoutes = payload.routes?.[nextKey];
      if (!nextRoutes) return;

      let target = null;
      if (contentId && nextRoutes.content && nextRoutes.content[contentId]) {
        target = nextRoutes.content[contentId];
      }
      if (!target) {
        target = nextRoutes.home || null;
      }
      if (!target) return;

      const resolved = new URL(target, routesUrl.href);
      window.location.href = resolved.href;
    } catch (error) {
      console.warn("[switcher] navigation skipped", error);
    }
  });
})();

