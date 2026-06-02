import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveLocalConversationIdSyncTarget } from '../../src/components/Layout/Launcher/hooks/modules/useLauncherMemorySync.ts';

test('preserves the launcher-local conversation id while agent mode is bootstrapping', () => {
  assert.equal(
    resolveLocalConversationIdSyncTarget({
      controlledConversationId: null,
      initialComposerSurface: 'agent',
      localConversationId: 'conv_local'
    }),
    'conv_local'
  );
});

test('clears the launcher-local conversation id when the parent is explicitly back in terminal mode', () => {
  assert.equal(
    resolveLocalConversationIdSyncTarget({
      controlledConversationId: null,
      initialComposerSurface: 'terminal',
      localConversationId: 'conv_local'
    }),
    null
  );
});

test('adopts the controlled conversation id when the workspace store has one', () => {
  assert.equal(
    resolveLocalConversationIdSyncTarget({
      controlledConversationId: 'conv_parent',
      initialComposerSurface: 'agent',
      localConversationId: 'conv_local'
    }),
    'conv_parent'
  );
});

test('leaves uncontrolled launchers untouched', () => {
  assert.equal(
    resolveLocalConversationIdSyncTarget({
      controlledConversationId: undefined,
      initialComposerSurface: 'terminal',
      localConversationId: 'conv_local'
    }),
    'conv_local'
  );
});
