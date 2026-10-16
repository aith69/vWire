import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripInvisible, avoidReservedName } from '../public/js/names.js';
import { sanitizeFileName } from '../public/js/protocol.js';
import { entryName } from '../public/js/zip.js';

const cp = (code) => String.fromCodePoint(code);

test('stripInvisible: toglie direzioni forzate, caratteri invisibili, controlli C1 e separatori di riga', () => {
  const bad = [
    0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069, 0x200e, 0x200f, 0x061c,
    0x200b, 0x2060, 0x2061, 0x2064, 0xfeff, 0x00ad, 0x0085, 0x009f, 0x2028, 0x2029, 0xe0041, 0xe007f,
  ];
  for (const code of bad) assert.equal(stripInvisible(`a${cp(code)}b`), 'ab', `U+${code.toString(16)}`);
  assert.equal(stripInvisible(null), '');
  assert.equal(stripInvisible(undefined), '');
});

test('stripInvisible: lascia ciò che serve (giunzioni di emoji, mezzo spazio persiano, accenti, CJK)', () => {
  const keep = ['👨\u200D👩\u200D👧', 'می\u200Cخواهم', 'è☃🎉', '❤\uFE0F', '日本語', 'пример', 'e\u0301'];
  for (const text of keep) assert.equal(stripInvisible(text), text);
});

test('avoidReservedName: nomi riservati di Windows, con o senza estensione', () => {
  for (const name of ['CON', 'con', 'PRN.txt', 'aux.tar.gz', 'NUL', 'COM1', 'com9.txt', 'LPT1', 'lpt9.log']) {
    assert.equal(avoidReservedName(name), `_${name}`, name);
  }
  for (const name of ['console.txt', 'com10', 'a.con', 'nulla', 'COM0', 'lpt', 'file']) {
    assert.equal(avoidReservedName(name), name, name);
  }
});

test('sanitizeFileName: il nome ricevuto non può mentire né essere un nome riservato', () => {
  assert.equal(sanitizeFileName('foto\u202Egpj.exe'), 'fotogpj.exe');
  assert.equal(sanitizeFileName('\u200B\u202E'), 'file');
  assert.equal(sanitizeFileName('CON'), '_CON');
  assert.equal(sanitizeFileName('nul.txt'), '_nul.txt');
  assert.equal(sanitizeFileName('COM1.tar.gz'), '_COM1.tar.gz');
  assert.equal(sanitizeFileName('console.txt'), 'console.txt');
  assert.equal(sanitizeFileName('report.pdf. . '), 'report.pdf');
  assert.equal(sanitizeFileName('nome...'), 'nome');
  assert.equal(sanitizeFileName('foto è ☃ 🎉.bin'), 'foto è ☃ 🎉.bin');
});

test('entryName (zip): stesse regole per ogni segmento del percorso', () => {
  assert.equal(entryName('foto\u202Egpj.exe'), 'fotogpj.exe');
  assert.equal(entryName('dir/CON.txt'), 'dir/_CON.txt');
  assert.equal(entryName('AUX'), '_AUX');
  assert.equal(entryName('a/\u202E/b'), 'a/file/b');
  assert.equal(entryName('a\u200Bb/c\u2028d'), 'ab/cd');
});
