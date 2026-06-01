import test from 'node:test';
import assert from 'node:assert/strict';

import { settleAssistantMessagesForResolvedTool } from '../../src/hooks/useChat/toolResultResolution.ts';

test('settling a resolved tool closes the assistant turn and all attached thinking segments', () => {
  const resolved = settleAssistantMessagesForResolvedTool([
    {
      id: 'assistant-1',
      role: 'assistant',
      title: 'Octomus',
      body: '',
      status: 'waitingForTool',
      isStreaming: true,
      toolCalls: [{ id: 'call_1' }]
    },
    {
      id: 'assistant-1::reasoning',
      role: 'assistant',
      title: 'Thinking',
      body: 'Inspectez workspace-ul. Aleg urmatorul pas potrivit.',
      messageKind: 'reasoning',
      parentMessageId: 'assistant-1',
      status: 'running',
      isStreaming: true,
      createdAt: new Date(Date.now() - 2_000).toISOString()
    },
    {
      id: 'assistant-1::reasoning-2',
      role: 'assistant',
      title: 'Thinking',
      body: 'Pregatesc rezolutia dupa tool.',
      messageKind: 'reasoning',
      parentMessageId: 'assistant-1',
      status: 'running',
      isStreaming: true,
      createdAt: new Date(Date.now() - 1_000).toISOString()
    }
  ], {
    toolCallId: 'call_1',
    assistantStatus: 'cancelled',
    nowMs: Date.now()
  });

  assert.equal(resolved[0]?.status, 'cancelled');
  assert.equal(resolved[0]?.isStreaming, false);
  assert.equal(resolved[0]?.hasNativeThinking, true);
  assert.equal(resolved[1]?.status, 'completed');
  assert.equal(resolved[1]?.isStreaming, false);
  assert.equal(resolved[2]?.status, 'completed');
  assert.equal(resolved[2]?.isStreaming, false);
});
