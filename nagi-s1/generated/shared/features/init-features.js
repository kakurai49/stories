(function initFeatures() {
  try {
    const contentBody = document.querySelector('[data-content-body]');
    if (!contentBody) return;

    const features = contentBody.getAttribute('data-features') || '';
    if (features) {
      console.info('[features:init]', features);
    }
  } catch (error) {
    console.info('[features:init] skipped due to error', error);
  }
})();
