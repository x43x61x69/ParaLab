(() => {
  const toggle = document.getElementById('analyticsOptIn');
  const preference = 'paralabAnalyticsOptIn';
  const editions = new Set(['land', 'water', 'sky', 'jade', 'tropics', 'glacier',
    'tropical-glacier', 'neon', 'my-lab', 'my-lab-on-paradise']);
  let enabled = false;
  let started = false;

  function setEnabled(allow) {
    enabled = allow;
    if (!allow && !started) return;
    window.dataLayer = window.dataLayer || [];
    const gtag = function () { window.dataLayer.push(arguments); };
    const consent = {
      analytics_storage: allow ? 'granted' : 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    };
    gtag('consent', started ? 'update' : 'default', consent);
    if (started) return;
    started = true;
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-PV69QV8K';
    document.head.append(script);
  }

  try { toggle.checked = localStorage.getItem(preference) === 'yes'; } catch {}
  toggle.addEventListener('change', () => {
    try { localStorage.setItem(preference, toggle.checked ? 'yes' : 'no'); } catch {}
    setEnabled(toggle.checked);
  });
  setEnabled(toggle.checked);

  // Only accept predefined categories and verified catalog IDs from the app.
  window.ParaLabAnalytics = (event, feature, edition, target, catalogId) => {
    if (!enabled) return;
    try {
      window.dataLayer.push({
        event,
        paralab_feature: feature,
        rom_edition: editions.has(edition) ? edition : 'none',
        target_edition: editions.has(target) ? target : 'none',
        catalog_item_id: Number.isInteger(catalogId) && catalogId > 0 ? String(catalogId) : 'none',
      });
    } catch {}
  };
})();
