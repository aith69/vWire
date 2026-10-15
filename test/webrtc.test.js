import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasWebRTC } from '../public/js/webrtc.js';
import { runTransfer } from '../public/js/transfer.js';

test('hasWebRTC: vero solo se RTCPeerConnection è una funzione', () => {
  assert.equal(hasWebRTC({ RTCPeerConnection: function () {} }), true);
  for (const win of [{}, { RTCPeerConnection: undefined }, { RTCPeerConnection: 'x' }, null]) {
    assert.equal(hasWebRTC(win), false, JSON.stringify(win));
  }
});

test('runTransfer senza WebRTC: errore subito, senza effetti collaterali', () => {
  const saved = globalThis.RTCPeerConnection;
  delete globalThis.RTCPeerConnection;
  let ended = false;
  try {
    assert.throws(
      () => runTransfer({ t: (key) => key }, { sig: {}, initiator: true, role: 'send', onEnd: () => (ended = true) }),
      /webrtc_unavailable/,
    );
  } finally {
    if (saved) globalThis.RTCPeerConnection = saved;
  }
  assert.equal(ended, false);
});
