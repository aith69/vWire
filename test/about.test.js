import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parseAboutFile, loadAbout, ABOUT_LIMITS } from '../server/about.js';
import { parseAbout, safeLink, displayLink } from '../public/js/about.js';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const good = { title: 'About', text: 'Some text', link: 'https://example.org/repo' };

async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'vwire-about-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('parseAboutFile: titolo, testo e link validi', () => {
  const { value, errors } = parseAboutFile(good);
  assert.deepEqual(errors, []);
  assert.deepEqual(value, good);
});

test('parseAboutFile: il link è facoltativo; spazi e a capo vengono normalizzati', () => {
  assert.deepEqual(parseAboutFile({ title: 'T', text: 'x' }).value, { title: 'T', text: 'x', link: null });
  assert.deepEqual(parseAboutFile({ title: 'T', text: 'x', link: '' }).value, { title: 'T', text: 'x', link: null });
  const { value } = parseAboutFile({ title: '  T  ', text: ' uno\r\ndue\r\n\r\ntre \n', link: 'https://example.org' });
  assert.equal(value.title, 'T');
  assert.equal(value.text, 'uno\ndue\n\ntre');
  assert.equal(value.link, 'https://example.org/');
});

test('parseAboutFile: oggetto vuoto (o solo note) = nessuna pagina informazioni', () => {
  assert.deepEqual(parseAboutFile({}), { value: null, errors: [] });
  assert.deepEqual(parseAboutFile({ _note: 'solo una nota' }), { value: null, errors: [] });
  assert.deepEqual(parseAboutFile({ ...good, _note: 'ok' }).errors, []);
});

test('parseAboutFile: errori chiari', () => {
  const cases = [
    [null, /JSON object/],
    [[], /JSON object/],
    ['testo', /JSON object/],
    [{ text: 'x' }, /"title"/],
    [{ title: 'T' }, /"text"/],
    [{ title: '', text: 'x' }, /"title"/],
    [{ title: 5, text: 'x' }, /"title"/],
    [{ title: 'T', text: '   ' }, /"text"/],
    [{ title: 'x'.repeat(ABOUT_LIMITS.title + 1), text: 'x' }, /"title"/],
    [{ title: 'T', text: 'x'.repeat(ABOUT_LIMITS.text + 1) }, /"text"/],
    [{ title: 'a\nb', text: 'x' }, /"title"/],
    [{ title: 'T', text: 'a\u0000b' }, /"text"/],
    [{ ...good, tittle: 'x' }, /unknown key "tittle"/],
  ];
  for (const [data, pattern] of cases) {
    const { errors } = parseAboutFile(data);
    assert.ok(errors.length > 0, JSON.stringify(data));
    assert.match(errors.join('\n'), pattern, JSON.stringify(data));
  }
});

test('parseAboutFile: il link deve essere http(s), senza credenziali', () => {
  const bad = [
    'javascript:alert(1)',
    'data:text/html,x',
    'ftp://example.org/x',
    'example.org',
    '//example.org',
    'https://user:pw@example.org',
    'http://',
    5,
    'https://' + 'a'.repeat(ABOUT_LIMITS.link),
  ];
  for (const link of bad) {
    const { errors } = parseAboutFile({ ...good, link });
    assert.match(errors.join('\n'), /"link"/, String(link));
  }
  assert.deepEqual(parseAboutFile({ ...good, link: 'http://example.org' }).errors, []);
});

test('loadAbout: about.json ha la precedenza, altrimenti l\'esempio, altrimenti niente', async (t) => {
  const dir = await tempDir(t);
  assert.equal(loadAbout({ env: {}, dir, useFile: true }), null, 'nessun file');

  await writeFile(join(dir, 'about.example.json'), JSON.stringify({ title: 'Example', text: 'e' }));
  assert.equal(loadAbout({ env: {}, dir, useFile: true }).title, 'Example');

  await writeFile(join(dir, 'about.json'), JSON.stringify({ title: 'Mine', text: 'm', link: 'https://example.org/' }));
  assert.deepEqual(loadAbout({ env: {}, dir, useFile: true }), {
    title: 'Mine',
    text: 'm',
    link: 'https://example.org/',
  });
});

test('loadAbout: JSON non valido o contenuto errato fermano l\'avvio, con il nome del file', async (t) => {
  const dir = await tempDir(t);
  await writeFile(join(dir, 'about.json'), '{ "title": "x", }');
  assert.throws(() => loadAbout({ env: {}, dir, useFile: true }), /about\.json is not valid JSON/);

  await writeFile(join(dir, 'about.json'), JSON.stringify({ title: 'T' }));
  assert.throws(
    () => loadAbout({ env: {}, dir, useFile: true }),
    (err) => /Invalid about\.json/.test(err.message) && /"text"/.test(err.message),
  );
});

test('loadAbout: {} spegne la pagina (senza ripiegare sull\'esempio); useFile=false ignora about.json', async (t) => {
  const dir = await tempDir(t);
  await writeFile(join(dir, 'about.example.json'), JSON.stringify({ title: 'Example', text: 'e' }));
  await writeFile(join(dir, 'about.json'), '{}');
  assert.equal(loadAbout({ env: {}, dir, useFile: true }), null);
  assert.equal(loadAbout({ env: {}, dir, useFile: false }).title, 'Example');
});

test('about.example.json è valido e ha un link https', async () => {
  const example = JSON.parse(await readFile(join(root, 'about.example.json'), 'utf8'));
  const { value, errors } = parseAboutFile(example);
  assert.deepEqual(errors, []);
  assert.ok(value.title && value.text);
  assert.match(value.link, /^https:\/\//);
});

test('pagina informazioni (browser): parseAbout, safeLink, displayLink', () => {
  assert.deepEqual(parseAbout(good), good);
  assert.equal(parseAbout(null), null);
  assert.equal(parseAbout({ title: 'T' }), null);
  assert.equal(parseAbout({ title: ' ', text: 'x' }), null);
  assert.equal(parseAbout({ title: 'T', text: 'x', link: 'javascript:alert(1)' }).link, null);
  assert.equal(parseAbout({ title: 'T', text: 'x' }).link, null);
  assert.equal(safeLink('https://example.org/a?b=c'), 'https://example.org/a?b=c');
  assert.equal(safeLink('https://u:p@example.org'), null);
  assert.equal(safeLink(undefined), null);
  assert.equal(displayLink('https://github.com/aith69/vWire'), 'github.com/aith69/vWire');
  assert.equal(displayLink('https://example.org/'), 'example.org');
});

test('index.html: struttura della pagina informazioni', async () => {
  const html = await readFile(join(root, 'public', 'index.html'), 'utf8');
  const tag = (re) => html.match(re)?.[0];

  const button = tag(/<button id="btn-about"[^>]*>/);
  assert.ok(button, 'manca #btn-about');
  assert.match(button, /data-only-on="home"/);
  assert.match(button, /\shidden(\s|>)/);
  assert.match(html, /data-screen="about"/);

  const link = tag(/<a id="about-link"[^>]*>/);
  assert.ok(link, 'manca #about-link');
  assert.match(link, /rel="noopener noreferrer"/);
  assert.match(link, /target="_blank"/);
  assert.doesNotMatch(link, /\shref=/, 'il link si imposta da script: un href statico sarebbe un link fisso');

  for (const id of ['about-title', 'about-text']) {
    assert.match(tag(new RegExp(`<[a-z0-9]+ id="${id}"[^>]*>`)), /dir="auto"/, id);
  }
  assert.match(tag(/<button id="about-back"[^>]*>/), /data-i18n="common\.home"/);
});
