(() => {
  const card = document.getElementById('analyticsCard');
  const title = document.getElementById('analyticsTitle');
  const promptTitle = document.getElementById('analyticsPromptTitle');
  const settingsTitle = document.getElementById('analyticsSettingsTitle');
  const settings = document.getElementById('analyticsSettings');
  const details = document.getElementById('analyticsDetails');
  const accept = document.getElementById('analyticsAccept');
  const decline = document.getElementById('analyticsDecline');
  const close = document.getElementById('analyticsClose');
  const choices = [[accept, 'yes'], [decline, 'no']];
  const preferenceKey = 'paralabAnalyticsOptIn';
  const editions = new Set(['land', 'water', 'sky', 'jade', 'tropics', 'glacier',
    'tropical-glacier', 'neon', 'my-lab', 'my-lab-on-paradise']);
  let preference = null;
  let editing = false;
  let enabled = false;
  let started = false;

  function setEnabled(allow) {
    if (enabled === allow) return;
    enabled = allow;
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

  function renderCard() {
    card.hidden = !editing && preference !== null;
    settings.setAttribute('aria-expanded', String(!card.hidden));
    promptTitle.hidden = editing;
    settingsTitle.hidden = close.hidden = !editing;
    for (const [button, value] of choices) {
      if (editing) button.setAttribute('aria-pressed', String(preference === value));
      else button.removeAttribute('aria-pressed');
    }
    if (card.hidden) details.open = false;
  }

  function applyPreference(value) {
    preference = value === 'yes' || value === 'no' ? value : null;
    setEnabled(preference === 'yes');
    renderCard();
  }

  function closeSettings() {
    editing = false;
    details.open = false;
    renderCard();
    settings.focus({ preventScroll: true });
  }

  for (const [button, value] of choices) {
    button.addEventListener('click', () => {
      try { localStorage.setItem(preferenceKey, value); } catch {}
      applyPreference(value);
      if (editing) closeSettings();
      else document.getElementById('btnWorkspace').focus({ preventScroll: true });
    });
  }
  settings.addEventListener('click', () => {
    editing = true;
    renderCard();
    title.focus({ preventScroll: true });
  });
  close.addEventListener('click', closeSettings);
  card.addEventListener('keydown', event => {
    if (editing && event.key === 'Escape') {
      event.preventDefault();
      closeSettings();
    }
  });
  window.addEventListener('storage', event => {
    if (event.storageArea === localStorage && (event.key === preferenceKey || event.key === null)) {
      applyPreference(event.newValue);
    }
  });
  try { preference = localStorage.getItem(preferenceKey); } catch {}
  applyPreference(preference);

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
