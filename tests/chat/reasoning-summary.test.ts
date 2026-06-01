import test from 'node:test';
import assert from 'node:assert/strict';

import { summarizeReasoningText } from '../../src/hooks/useChat/reasoningSummary.ts';

test('summarizeReasoningText keeps a short 2-3 sentence summary', () => {
  const summary = summarizeReasoningText(`
    Verific starea mediului local si aleg intre terminal si fisiere.
    Daca am un rezultat concret, raspund direct fara sa repet output-ul brut.
    Daca apare un blocaj, aleg urmatorul pas minim care avanseaza task-ul.
    Aceasta a patra propozitie nu ar trebui inclusa.
  `);

  assert.equal(
    summary,
    'Verific starea mediului local si aleg intre terminal si fisiere. Daca am un rezultat concret, raspund direct fara sa repet output-ul brut. Daca apare un blocaj, aleg urmatorul pas minim care avanseaza task-ul.'
  );
});

test('summarizeReasoningText clips long output cleanly', () => {
  const summary = summarizeReasoningText(`
    Analizez o cerere foarte lunga care continua cu multe detalii si multe explicatii despre fisiere, tool-uri, comenzi,
    verificari, rezultate, bucle, aprobari si alte lucruri care nu trebuie afisate integral in blocul de thinking.
    Pastrez doar partea utila pentru utilizator.
  `);

  assert.ok(summary.length <= 220);
  assert.ok(summary.endsWith('...'));
});
