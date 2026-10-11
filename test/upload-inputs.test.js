import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const html = await readFile(join(fileURLToPath(import.meta.url), '..', '..', 'public', 'index.html'), 'utf8');
const input = (id) => html.match(new RegExp(`<input id="${id}"[^>]*>`))?.[0];

test('i campi di scelta file accettano più file', () => {
  for (const id of ['file-send', 'file-upload']) {
    assert.ok(input(id), `manca #${id}`);
    assert.match(input(id), /\smultiple(\s|>)/, `#${id} deve accettare più file`);
  }
});

test('i campi di scelta file non filtrano i tipi (gestore file di sistema)', () => {
  for (const id of ['file-send', 'file-upload']) assert.doesNotMatch(input(id), /accept=/, id);
});
