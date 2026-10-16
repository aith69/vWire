import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropDestination } from '../public/js/drop.js';

test('dropDestination: home sempre; pagina "Carica file" solo se è pronta a ricevere un file', () => {
  const state = (homeVisible, guestVisible, hasGuestHandler) => ({ homeVisible, guestVisible, hasGuestHandler });
  assert.equal(dropDestination(state(true, false, false)), 'home');
  assert.equal(dropDestination(state(true, false, true)), 'home');
  assert.equal(dropDestination(state(false, true, true)), 'guest');
  // collegamento in corso (nessun gestore ancora): non si accetta niente
  assert.equal(dropDestination(state(false, true, false)), null);
  // altre schermate (QR, preparazione, trasferimento, messaggi): niente, anche con un gestore rimasto registrato
  assert.equal(dropDestination(state(false, false, true)), null);
  assert.equal(dropDestination(state(false, false, false)), null);
});
