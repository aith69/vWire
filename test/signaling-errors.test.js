import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { EventEmitter } from 'node:events';
import { attachSignaling } from '../server/signaling.js';
import { connectClient } from '../support/ws.js';

/** A session manager that fails, to check that one error does not take the service down. */
class BrokenSessions extends EventEmitter {
  ttlMs = 60000;
  create() {
    throw new Error('boom');
  }
  get() {
    return undefined;
  }
  cancelPending() {
    return null;
  }
  leave() {
    return null;
  }
  closeAll() {}
}

test('un errore in un gestore chiude solo quella connessione (errore interno, codice 1011); il server resta in piedi', async (t) => {
  const http = createHttpServer();
  const signaling = attachSignaling(http, { sessions: new BrokenSessions() });
  await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));
  const url = `ws://127.0.0.1:${http.address().port}/ws`;
  const quiet = console.error;
  console.error = () => {};
  const clients = [];
  t.after(async () => {
    console.error = quiet;
    clients.forEach((c) => c.terminate());
    signaling.shutdown();
    http.closeAllConnections();
    await new Promise((resolve) => http.close(resolve));
  });

  const first = await connectClient(url);
  clients.push(first);
  const closed = new Promise((resolve) => first.once('close', (code) => resolve(code)));
  first.sendJson({ type: 'create', mode: 'send' });
  assert.deepEqual(await first.next(), { type: 'error', code: 'internal_error' });
  assert.equal(await closed, 1011);

  const second = await connectClient(url);
  clients.push(second);
  second.send('non è json');
  assert.deepEqual(await second.next(), { type: 'error', code: 'bad_message' });
});

test('un errore nel gestore della scadenza non lancia eccezioni (finirebbe nel timer e fermerebbe il processo)', (t) => {
  const sessions = new BrokenSessions();
  const http = createHttpServer();
  const signaling = attachSignaling(http, { sessions });
  const quiet = console.error;
  console.error = () => {};
  t.after(() => {
    console.error = quiet;
    signaling.shutdown();
  });
  assert.doesNotThrow(() => sessions.emit('expired', {}));
});
