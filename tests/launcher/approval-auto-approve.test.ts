import test from 'node:test';
import assert from 'node:assert/strict';

import { commandMatchesAllowPattern, shouldAutoApprovePendingApproval } from '../../src/components/Layout/Launcher/hooks/modules/approvalAutoApprove.ts';

const defaultProfile = {
  id: 'default',
  name: 'Default',
  baseModel: 'Auto',
  terminalModel: 'Auto',
  applyDiffs: 'Agent decides',
  readFiles: 'Agent decides',
  directoryAllowlist: [],
  executeCommands: 'Always ask',
  commandAllowlist: [],
  interactWithRunningCommands: 'Always ask',
  askQuestions: 'Ask unless auto-approve',
  callMcpServers: 'Agent decides',
  mcpAllowlist: [],
  mcpDenylist: [],
  callWebTools: true,
  planAutoSync: true
} as const;

test('command allowlist patterns auto-approve matching commands', () => {
  const shouldAutoApprove = shouldAutoApprovePendingApproval({
    approval: {
      kind: 'command',
      command: 'docker ps',
      toolCallId: 'tool-1'
    },
    activeProfile: {
      ...defaultProfile,
      commandAllowlist: ['^docker ps$']
    },
    autoApproveAgentLoop: false
  });

  assert.equal(shouldAutoApprove, true);
});

test('loop auto-approve covers follow-up approvals even without an allowlist entry', () => {
  const shouldAutoApprove = shouldAutoApprovePendingApproval({
    approval: {
      kind: 'file-change',
      toolCallId: 'tool-2',
      fileDiffs: [{
        filePath: 'src/lib.rs',
        diffType: {
          kind: 'create',
          delta: {
            replacement_line_range: { start: 1, end: 1 },
            insertion: 'pub fn ping() -> &\'static str { "pong" }\n'
          }
        }
      }]
    },
    activeProfile: defaultProfile,
    autoApproveAgentLoop: true
  });

  assert.equal(shouldAutoApprove, true);
});

test('invalid regex patterns fall back to exact string matching', () => {
  assert.equal(commandMatchesAllowPattern('docker ps', '[invalid'), false);
  assert.equal(commandMatchesAllowPattern('docker ps', 'docker ps'), true);
});
