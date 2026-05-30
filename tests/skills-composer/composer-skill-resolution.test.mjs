import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveAgentPrompt } from '../../src/hooks/useChat/modules/agentPrompt.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const scenariosPath = path.join(__dirname, 'scenarios.json');
const scenarios = JSON.parse(fs.readFileSync(scenariosPath, 'utf8'));

test('composer skill slash scenarios resolve as expected', async (t) => {
  assert.ok(Array.isArray(scenarios) && scenarios.length > 0, 'expected non-empty composer skill fixtures');

  for (const scenario of scenarios) {
    await t.test(scenario.id, () => {
      const resolved = resolveAgentPrompt(scenario.prompt);

      if (scenario.expectedEquals) {
        assert.equal(
          resolved,
          scenario.expectedEquals,
          `scenario "${scenario.id}" should resolve exactly as expected`
        );
      }

      for (const expectedSnippet of scenario.expectedIncludes ?? []) {
        assert.ok(
          resolved.includes(expectedSnippet),
          `scenario "${scenario.id}" should include "${expectedSnippet}"`
        );
      }
    });
  }
});
