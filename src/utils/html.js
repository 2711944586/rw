export function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function escapeAttr(value) {
  return escapeHTML(value).replaceAll('`', '&#096;');
}

export function safeExternalUrl(value, base = 'http://localhost') {
  const raw = String(value || '').trim();
  try {
    const url = new URL(raw, base);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch {
    // Return an inert target below.
  }
  return '#';
}
