import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSelection } from '../public/js/select.js';
import { MIB } from '../public/js/limits.js';

const t = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);
const file = (mb) => ({ name: `f${mb}.bin`, size: mb * MIB });

function setup(options = {}) {
  const calls = [];
  const prepare = async (files) => {
    calls.push(files);
    if (options.error) throw options.error;
    if (options.cancel) return { cancelled: true, shown: true };
    return { file: options.zip ?? { name: 'files.zip', size: files.reduce((n, f) => n + f.size, 0) + 500 } };
  };
  return { calls, run: (files, maxMb = 500) => resolveSelection(files, { t, maxBytes: maxMb * MIB, prepare, ui: {} }) };
}

test('nessun file: annullato, senza fare nulla', async () => {
  const { run, calls } = setup();
  assert.deepEqual(await run([]), { cancelled: true });
  assert.equal(calls.length, 0);
});

test('un solo file: passa com\'è, senza zip', async () => {
  const { run, calls } = setup();
  const only = file(100);
  assert.deepEqual(await run([only]), { file: only });
  assert.equal(calls.length, 0);
});

test('un file oltre il limite: messaggio con le due dimensioni, niente zip', async () => {
  const { run, calls } = setup();
  const result = await run([file(600)]);
  assert.match(result.message, /^limit\.exceeded:/);
  assert.equal(calls.length, 0);
});

test('tre file da 200 MB con limite 500 MB: respinti prima di leggere qualunque cosa', async () => {
  const { run, calls } = setup();
  const result = await run([file(200), file(200), file(200)]);
  assert.match(result.message, /^limit\.exceeded:/);
  assert.match(result.message, /600 MB/);
  assert.match(result.message, /500 MB/);
  assert.equal(calls.length, 0);
});

test('più file entro il limite: diventano lo zip preparato', async () => {
  const { run, calls } = setup();
  const files = [file(100), file(100)];
  const result = await run(files);
  assert.equal(result.file.name, 'files.zip');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], files);
});

test('annullamento e fallimento della preparazione', async () => {
  assert.deepEqual(await setup({ cancel: true }).run([file(1), file(1)]), { cancelled: true });

  const quiet = console.error;
  console.error = () => {};
  try {
    const failed = await setup({ error: new Error('boom') }).run([file(1), file(1)]);
    assert.deepEqual(failed, { message: 'zip.failed' });
  } finally {
    console.error = quiet;
  }
});

test('lo zip stesso (intestazioni comprese) non può superare il limite', async () => {
  const { run } = setup({ zip: { name: 'files.zip', size: 500 * MIB + 300 } });
  const result = await run([file(250), file(250)]);
  assert.match(result.message, /^limit\.exceeded:/);
});
