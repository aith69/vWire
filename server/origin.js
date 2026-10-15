/**
 * Browsers always send an Origin header when they open a WebSocket. If the page that opens it does not come
 * from the same host name as the server, another website is trying to use this server from a visitor's browser.
 * Only the host name is compared, not the port: a reverse proxy often drops the port from Host.
 * Without an Origin header the client is not a browser (tests, curl, scripts) and the check does not apply.
 */
export function isAllowedOrigin(origin, host) {
  if (origin === undefined) return true;
  if (typeof origin !== 'string' || typeof host !== 'string' || host === '') return false;
  try {
    const from = new URL(origin);
    if (from.protocol !== 'http:' && from.protocol !== 'https:') return false;
    return from.hostname === new URL(`http://${host}`).hostname;
  } catch {
    return false;
  }
}
