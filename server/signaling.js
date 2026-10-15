import { WebSocketServer } from 'ws';
import { AttemptLimiter } from './ratelimit.js';
import { clientIp } from './clientip.js';
import { isAllowedOrigin } from './origin.js';

const MODES = new Set(['send', 'receive']);
const opposite = (mode) => (mode === 'send' ? 'receive' : 'send');

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

/** An error in one handler must not stop the whole service (and every session kept in memory with it). */
function guard(label, fn) {
  return (...args) => {
    try {
      return fn(...args);
    } catch (err) {
      console.error(`[vwire] error in "${label}":`, err?.stack ?? err);
    }
  };
}

function fail(ws, code, extra = {}) {
  send(ws, { type: 'error', code, ...extra });
}

export function attachSignaling(
  httpServer,
  {
    sessions,
    limiter = new AttemptLimiter(),
    trustProxy = false,
    maxMessageBytes = 64 * 1024,
    path = '/ws',
    heartbeatMs = 30_000,
  },
) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: maxMessageBytes });

  let lastOriginWarning = 0;

  httpServer.on('upgrade', (req, socket, head) => {
    let pathname = null;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      /* invalid url */
    }
    if (pathname !== path) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      return socket.destroy();
    }
    if (!isAllowedOrigin(req.headers.origin, req.headers.host)) {
      // Another website is using this server from a visitor's browser, or a proxy rewrites the Host header.
      if (Date.now() - lastOriginWarning > 60_000) {
        lastOriginWarning = Date.now();
        console.warn(
          `Warning: WebSocket refused: the page was opened from ${JSON.stringify(req.headers.origin)} ` +
            `but the request reached the app with host ${JSON.stringify(req.headers.host)}. ` +
            'Behind a reverse proxy, make sure the original Host header is forwarded.',
        );
      }
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  sessions.on('expired', guard('expired', (session) => {
    session.owner.sessionId = null;
    send(session.owner, { type: 'expired' });
    if (session.pending) {
      session.pending.guest.sessionId = null;
      send(session.pending.guest, { type: 'expired' });
    }
  }));

  function leave(ws) {
    const id = ws.sessionId;
    if (!id) return;
    ws.sessionId = null;

    // Chi era solo in verifica: la sessione resta aperta per l'host.
    const verifying = sessions.cancelPending(id, ws);
    if (verifying) return send(verifying.owner, { type: 'verify-cancelled' });

    const session = sessions.get(id);
    const waiting = session && session.owner === ws ? session.pending?.guest : null;
    const other = sessions.leave(id, ws);
    if (waiting) {
      waiting.sessionId = null;
      send(waiting, { type: 'peer-left' });
    }
    if (other) {
      other.sessionId = null;
      send(other, { type: 'peer-left' });
    }
  }

  const handlers = {
    create(ws, msg) {
      if (ws.sessionId) return fail(ws, 'already_in_session');
      if (!MODES.has(msg.mode)) return fail(ws, 'bad_message');
      const session = sessions.create(ws, msg.mode);
      if (!session) return fail(ws, 'busy');
      ws.sessionId = session.id;
      send(ws, {
        type: 'created',
        id: session.id,
        mode: session.mode,
        expiresInMs: sessions.ttlMs,
      });
    },

    join(ws, msg) {
      if (ws.sessionId) return fail(ws, 'already_in_session');
      const { session, error } = sessions.join(msg.id, ws);
      if (error) return fail(ws, error);
      ws.sessionId = session.id;
      send(ws, { type: 'joined', role: opposite(session.mode) });
      send(session.owner, { type: 'peer-joined', role: session.mode });
    },

    'request-code'(ws) {
      if (!ws.sessionId) return fail(ws, 'no_session');
      const res = sessions.issueCode(ws.sessionId, ws);
      if (res.error) return fail(ws, res.error);
      send(ws, { type: 'code', code: res.code, expiresInMs: res.expiresInMs });
    },

    'join-code'(ws, msg) {
      if (ws.sessionId) return fail(ws, 'already_in_session');
      const gate = limiter.check(ws.ip);
      if (!gate.allowed) return fail(ws, 'rate_limited', { retryAfterMs: gate.retryAfterMs });

      const code = typeof msg.code === 'string' ? msg.code.replace(/\D/g, '') : '';
      if (!/^\d{6}$/.test(code)) return fail(ws, 'bad_message');

      const res = sessions.joinByCode(code, ws);
      if (res.error) {
        if (res.error === 'not_found') {
          limiter.fail(ws.ip);
          return fail(ws, 'code_not_found');
        }
        return fail(ws, res.error);
      }
      ws.sessionId = res.session.id;
      send(ws, { type: 'challenge', options: res.options });
      send(res.session.owner, { type: 'verify-request', emoji: res.correct });
    },

    verify(ws, msg) {
      if (!ws.sessionId) return fail(ws, 'no_session');
      const res = sessions.verify(ws.sessionId, ws, msg.emoji);
      if (res.error === 'no_pending') return fail(ws, 'no_pending');
      if (res.error === 'wrong') {
        limiter.fail(ws.ip);
        res.session.owner.sessionId = null;
        ws.sessionId = null;
        send(res.session.owner, { type: 'verify-failed' });
        return fail(ws, 'verify_failed');
      }
      send(ws, { type: 'joined', role: opposite(res.session.mode) });
      send(res.session.owner, { type: 'peer-joined', role: res.session.mode });
    },

    signal(ws, msg) {
      if (!ws.sessionId) return fail(ws, 'no_session');
      if (msg.data === null || typeof msg.data !== 'object') return fail(ws, 'bad_message');
      const peer = sessions.peerOf(ws.sessionId, ws);
      if (!peer) return fail(ws, 'no_peer');
      send(peer, { type: 'signal', data: msg.data });
    },

    leave(ws) {
      leave(ws);
      send(ws, { type: 'left' });
    },
  };

  wss.on('connection', (ws, req) => {
    ws.sessionId = null;
    ws.ip = clientIp(req, trustProxy);
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (raw, isBinary) => {
      if (isBinary) return fail(ws, 'bad_message');
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return fail(ws, 'bad_message');
      }
      if (!msg || typeof msg.type !== 'string' || !Object.hasOwn(handlers, msg.type)) {
        return fail(ws, 'bad_message');
      }
      try {
        handlers[msg.type](ws, msg);
      } catch (err) {
        // Unknown state: tell the client and start from scratch on a new connection.
        console.error(`[vwire] error in "${msg.type}":`, err?.stack ?? err);
        fail(ws, 'internal_error');
        ws.close(1011);
      }
    });

    ws.on('close', () => leave(ws));
    ws.on('error', () => {});
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, heartbeatMs);
  heartbeat.unref();

  const sweeper = setInterval(() => limiter.sweep(), 60_000);
  sweeper.unref();

  function shutdown() {
    clearInterval(heartbeat);
    clearInterval(sweeper);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    sessions.closeAll();
  }

  return { wss, shutdown };
}
