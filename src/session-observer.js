// Session synchronization only: no DOM queries, no API polling, no navigation.
(() => {
  const original = window.fetch;
  let latest = null, owner = null;
  const publish = () => { if (latest && owner) window.postMessage({channel:'FOMO_MONITOR_SESSION_V3', authorization:latest, owner}, location.origin); };
  window.fetch = async function(input, init) {
    let url, headers, method;
    try {
      url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
      headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (url.origin === 'https://prod-api.fomo.family') {
        if (url.pathname === '/v2/users' && method === 'POST') owner = null;
        const auth = headers.get('authorization');
        if (auth?.startsWith('Bearer ') && auth !== latest) { latest = auth; publish(); }
      }
    } catch { /* never interfere with the website */ }
    const response = await original.apply(this, arguments);
    if (url?.origin === 'https://prod-api.fomo.family' && url.pathname === '/v2/users' && method === 'POST' && response.ok) {
      response.clone().json().then(data => {
        const u = data?.responseObject;
        if (data.success && u?.id && u?.userHandle) { owner = {id:u.id, handle:u.userHandle}; publish(); }
      }).catch(() => {});
    }
    return response;
  };
})();
