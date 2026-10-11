import { loadTranslations, createTranslator, applyTranslations } from './i18n.js';
import { randomDarkTheme, applyTheme } from './theme.js';
import { $, showScreen, showMessage } from './ui.js';
import { startHost } from './host.js';
import { startGuest } from './guest.js';
import { attachDrop } from './drop.js';
import { parseServerConfig } from './limits.js';
import { resolveSelection } from './select.js';

applyTheme(document, randomDarkTheme());

const params = new URLSearchParams(location.search);
const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
const preferred = [params.get('lang'), ...browserLanguages].filter(Boolean);

const { lang, messages } = await loadTranslations({ languages: preferred });
const t = createTranslator(messages);
applyTranslations(document, t, lang);

async function loadServerConfig() {
  try {
    const res = await fetch('/api/config', { cache: 'no-store' });
    if (res.ok) return parseServerConfig(await res.json());
  } catch {
    /* without the server settings: no STUN servers (local network only) and the default size limit */
  }
  return parseServerConfig(null);
}

const serverConfig = await loadServerConfig();

const ctx = {
  t,
  iceServers: serverConfig.iceServers,
  maxTransferBytes: serverConfig.maxTransferBytes,
  signalingUrl: `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`,
  goHome() {
    history.replaceState(null, '', location.pathname + location.search);
    showScreen('home');
  },
};

$('btn-receive').onclick = () => startHost(ctx, { mode: 'receive' });
$('btn-code').onclick = () => startGuest(ctx);

let selecting = false;

/** Starts a transfer from the home page: one file as it is, several as a zip, unless over the limit. */
async function sendFiles(files) {
  if (selecting) return;
  selecting = true;
  try {
    const result = await resolveSelection(files, { t, maxBytes: ctx.maxTransferBytes });
    if (result.message) return showMessage(result.message, { onHome: ctx.goHome });
    if (result.cancelled) return showScreen('home');
    startHost(ctx, { mode: 'send', file: result.file });
  } finally {
    selecting = false;
  }
}

const fileInput = $('file-send');
$('btn-send').onclick = () => fileInput.click();
fileInput.onchange = () => {
  const files = Array.from(fileInput.files);
  fileInput.value = '';
  if (files.length) sendFiles(files);
};

// Drag and drop: accepted only on the home page. Elsewhere a dropped file is ignored
// (see drop.js: the browser must never open it, or the page and the transfer would be lost).
const homeScreen = document.querySelector('[data-screen="home"]');
attachDrop(document, {
  overlay: $('drop-overlay'),
  isActive: () => !homeScreen.hidden,
  onFiles: sendFiles,
});

const id = location.hash.slice(1);
if (/^[A-Za-z0-9_-]{16,64}$/.test(id)) startGuest(ctx, { id });
else showScreen('home');
