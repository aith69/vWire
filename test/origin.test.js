import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { isAllowedOrigin } from '../server/origin.js';
import { setup } from '../support/ws.js';

test('isAllowedOrigin: senza Origin passa; con Origin deve avere lo stesso nome host', () => {
  const allowed = [
    [undefined, 'vwire.app'],
    ['https://vwire.app', 'vwire.app'],
    ['https://VWire.App', 'vwire.app'],
    ['http://192.168.0.173:3001', '192.168.0.173:3001'],
    ['http://192.168.0.173:3001', '192.168.0.173'], // il proxy toglie la porta: si confronta solo il nome
    ['https://vwire.app:8443', 'vwire.app'],
    ['http://[::1]:3000', '[::1]:3000'],
  ];
  const refused = [
    ['https://evil.example', 'vwire.app'],
    ['https://vwire.app.evil.example', 'vwire.app'],
    ['https://evilvwire.app', 'vwire.app'],
    ['null', 'vwire.app'],
    ['', 'vwire.app'],
    ['not a url', 'vwire.app'],
    ['file:///x', 'vwire.app'],
    ['chrome-extension://vwire.app', 'vwire.app'],
    ['https://vwire.app', undefined],
    ['https://vwire.app', ''],
    ['https://vwire.app', 'bad host with spaces'],
  ];
  for (const [origin, host] of allowed) assert.equal(isAllowedOrigin(origin, host), true, `${origin} / ${host}`);
  for (const [origin, host] of refused) assert.equal(isAllowedOrigin(origin, host), false, `${origin} / ${host}`);
});

test('WebSocket: un altro sito non può usare il server dal browser di un visitatore (403)', async (t) => {
  const env = await setup(t);
  const port = new URL(env.url.replace('ws://', 'http://')).port;
  const quiet = console.warn;
  console.warn = () => {};
  t.after(() => {
    console.warn = quiet;
  });

  const attempt = (origin) =>
    new Promise((resolve) => {
      const ws = new WebSocket(env.url, origin === undefined ? {} : { origin });
      ws.on('open', () => {
        ws.terminate();
        resolve('open');
      });
      ws.on('unexpected-response', (req, res) => {
        res.resume();
        ws.terminate();
        resolve(res.statusCode);
      });
      ws.on('error', () => resolve('error'));
    });

  assert.equal(await attempt(undefined), 'open', 'senza Origin (non è un browser)');
  assert.equal(await attempt(`http://127.0.0.1:${port}`), 'open', 'stesso sito');
  assert.equal(await attempt('http://127.0.0.1:9'), 'open', 'stesso nome host, porta diversa: ammesso');
  assert.equal(await attempt('https://evil.example'), 403);
  assert.equal(await attempt('null'), 403);
});
