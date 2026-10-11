import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasFiles, pickDroppedFiles } from '../public/js/drop.js';

const fileItem = (isFile = true) => ({ kind: 'file', webkitGetAsEntry: () => ({ isFile }) });

test('hasFiles: solo i trascinamenti di file', () => {
  assert.equal(hasFiles({ types: ['Files'] }), true);
  assert.equal(hasFiles({ types: ['text/plain', 'Files'] }), true);
  assert.equal(hasFiles({ types: ['text/plain'] }), false);
  assert.equal(hasFiles({ types: { length: 1, 0: 'Files' } }), true, 'elenco simile a un array');
  assert.equal(hasFiles({}), false);
  assert.equal(hasFiles(undefined), false);
});

test('pickDroppedFiles: uno o più file', () => {
  const one = { name: 'a.txt' };
  const two = { name: 'b.txt' };
  assert.deepEqual(pickDroppedFiles({ files: [one], items: [fileItem()] }), { files: [one] });
  assert.deepEqual(
    pickDroppedFiles({ files: [one, two], items: [fileItem(), fileItem()] }),
    { files: [one, two] },
  );
});

test('pickDroppedFiles: nessun file', () => {
  assert.deepEqual(pickDroppedFiles({ files: [], items: [] }), { error: 'empty' });
  assert.deepEqual(pickDroppedFiles(undefined), { error: 'empty' });
});

test('pickDroppedFiles: una cartella respinge tutto il rilascio, anche insieme ad altri file', () => {
  assert.deepEqual(
    pickDroppedFiles({ files: [{ name: 'cartella' }], items: [fileItem(false)] }),
    { error: 'folder' },
  );
  assert.deepEqual(
    pickDroppedFiles({ files: [{ name: 'a' }, { name: 'cartella' }], items: [fileItem(), fileItem(false)] }),
    { error: 'folder' },
  );
});

test('pickDroppedFiles: browser senza webkitGetAsEntry, e testo trascinato insieme', () => {
  const file = { name: 'a.txt' };
  assert.deepEqual(pickDroppedFiles({ files: [file], items: [{ kind: 'file' }] }), { files: [file] });
  assert.deepEqual(
    pickDroppedFiles({ files: [file], items: [{ kind: 'string' }, fileItem()] }),
    { files: [file] },
  );
});
