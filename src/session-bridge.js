window.addEventListener('message', event => {
  const d = event.data;
  if (event.source !== window || event.origin !== 'https://fomo.family' || d?.channel !== 'FOMO_MONITOR_SESSION_V3') return;
  if (typeof d.authorization !== 'string' || !/^Bearer [A-Za-z0-9_.-]{20,12000}$/.test(d.authorization)) return;
  if (!/^[a-f0-9-]{36}$/i.test(d.owner?.id ?? '') || typeof d.owner?.handle !== 'string') return;
  chrome.runtime.sendMessage({type:'SYNC_SESSION', authorization:d.authorization, owner:d.owner}).catch(() => {});
});
