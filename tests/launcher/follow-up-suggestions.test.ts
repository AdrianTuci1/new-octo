import test from 'node:test';
import assert from 'node:assert/strict';

import { assistantMessageCanSurfaceFollowUp } from '../../src/components/Layout/Launcher/hooks/modules/followUpEligibility.ts';

test('follow-up suggestions only surface for completed assistant messages', () => {
  assert.equal(
    assistantMessageCanSurfaceFollowUp({
      role: 'assistant',
      status: 'completed',
      isStreaming: false,
      isError: false
    }),
    true
  );

  assert.equal(
    assistantMessageCanSurfaceFollowUp({
      role: 'assistant',
      status: 'waitingForTool',
      isStreaming: false,
      isError: false
    }),
    false
  );

  assert.equal(
    assistantMessageCanSurfaceFollowUp({
      role: 'assistant',
      status: 'running',
      isStreaming: true,
      isError: false
    }),
    false
  );
});
