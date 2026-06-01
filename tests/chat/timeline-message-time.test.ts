import test from 'node:test';
import assert from 'node:assert/strict';

import { timelineMessageTime } from '../../src/components/Chat/utils/timelineMessageTime.ts';

test('thinking blocks keep their own timestamps instead of snapping to the parent message', () => {
  const parentAt = timelineMessageTime({
    id: 'assistant-1',
    createdAt: '2026-06-01T10:00:00.000Z'
  });
  const reasoningAt = timelineMessageTime({
    id: 'assistant-1::reasoning-2',
    createdAt: '2026-06-01T10:00:10.000Z'
  });
  const toolAt = timelineMessageTime({
    id: 'tool-1',
    createdAt: '2026-06-01T10:00:05.000Z'
  });

  assert.deepEqual(
    [
      ['assistant-1', parentAt],
      ['tool-1', toolAt],
      ['assistant-1::reasoning-2', reasoningAt]
    ].sort((left, right) => Number(left[1]) - Number(right[1])).map(([id]) => id),
    ['assistant-1', 'tool-1', 'assistant-1::reasoning-2']
  );
});
