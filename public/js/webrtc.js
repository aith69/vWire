/** True if the browser can make WebRTC connections. Tor Browser and some hardened settings turn it off. */
export function hasWebRTC(win = globalThis) {
  return typeof win?.RTCPeerConnection === 'function';
}
