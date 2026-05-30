import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getModelProviderPreset,
  inferModelProviderId,
  listModelProviderPresets
} from '../../src/lib/modelProviders.ts';

test('provider presets keep OpenAI and Google locked with multimodal defaults', () => {
  const openai = getModelProviderPreset('openai');
  const google = getModelProviderPreset('google');

  assert.equal(openai.baseUrlLocked, true);
  assert.equal(google.baseUrlLocked, true);
  assert.equal(openai.defaultSupportsAttachments, true);
  assert.equal(google.defaultSupportsAttachments, true);
});

test('provider presets list expected providers', () => {
  const ids = listModelProviderPresets().map((preset) => preset.id);
  assert.deepEqual(ids, ['openai', 'google', 'openrouter', 'custom']);
});

test('provider inference recognizes migrated records and known endpoints', () => {
  assert.equal(
    inferModelProviderId({ providerLabel: 'Google Gemini', baseUrl: 'https://api.openai.com/v1' }),
    'google'
  );
  assert.equal(
    inferModelProviderId({ baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' }),
    'google'
  );
  assert.equal(
    inferModelProviderId({ baseUrl: 'https://openrouter.ai/api/v1' }),
    'openrouter'
  );
  assert.equal(
    inferModelProviderId({ providerLabel: 'Anything else', baseUrl: 'https://llm.example.com/v1' }),
    'custom'
  );
});
