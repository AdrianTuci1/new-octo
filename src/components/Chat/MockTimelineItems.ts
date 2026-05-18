import type { TimelineItem } from './utils/timeline';
import type { CommandApproval } from '../../types/terminal';

export const MOCK_TIMELINE_ITEMS: TimelineItem[] = [
  {
    id: 'mock-k8s-user-1',
    kind: 'message',
    at: 1,
    order: 1,
    message: {
      id: 'mock-k8s-user-1',
      role: 'user',
      title: 'Production incident',
      body: 'We have intermittent 502s on checkout-api after the last deploy. Kubernetes shows a few pods in CrashLoopBackOff and latency spikes every time traffic shifts. Can you help me triage this without making changes yet?',
      createdAt: new Date().toISOString()
    }
  },
  {
    id: 'mock-k8s-thinking-1',
    kind: 'message',
    at: 2,
    order: 2,
    message: {
      id: 'mock-k8s-thinking-1',
      role: 'assistant',
      title: 'Thinking',
      body: 'I will treat this as a production triage and avoid mutating commands.\nFirst I want to correlate rollout state, pod restarts, readiness failures, and recent events in the checkout namespace.\nThe safest first command should only read cluster state.',
      messageKind: 'reasoning',
      thinkingDurationSeconds: 9,
      isStreaming: false,
      createdAt: new Date().toISOString()
    }
  },
  {
    id: 'mock-k8s-assistant-1',
    kind: 'message',
    at: 3,
    order: 3,
    message: {
      id: 'mock-k8s-assistant-1',
      role: 'assistant',
      title: 'Triage plan',
      body: `I would start by checking the deployment, current ReplicaSet split, pod readiness, restart counts, and recent warning events in one pass.

The symptoms point to one of these:
- a new image failing startup probes under production config
- a readiness probe mismatch causing traffic to reach pods too early
- resource pressure causing OOMKilled restarts
- a downstream dependency timeout that only appears under load

I can run a read-only diagnostic command first, then summarize what changed between the stable and unstable pods before suggesting any rollback or patch.`,
      createdAt: new Date().toISOString()
    }
  },
  {
    id: 'mock-k8s-agent-1',
    kind: 'multi-agent-block',
    at: 4,
    order: 4,
    block: {
      agentName: 'Cluster Inspector',
      status: 'running',
      taskSummary: 'Preparing a read-only Kubernetes diagnostic across deployment, pods, restart reasons, and warning events.',
      colorScheme: 'indigo'
    }
  },
  {
    id: 'mock-k8s-agent-2',
    kind: 'multi-agent-block',
    at: 5,
    order: 5,
    block: {
      agentName: 'Incident Analyst',
      status: 'running',
      taskSummary: 'Mapping CrashLoopBackOff timing against rollout and readiness behavior for checkout-api.',
      colorScheme: 'teal'
    }
  },
  {
    id: 'mock-k8s-assistant-2',
    kind: 'message',
    at: 6,
    order: 6,
    message: {
      id: 'mock-k8s-assistant-2',
      role: 'assistant',
      title: 'Command suggestion',
      body: `I suggest starting with a single read-only command. It will not restart pods, change traffic, or edit cluster resources.

The output should tell us whether the crash is tied to image startup, readiness probes, memory limits, or node-level pressure.`,
      createdAt: new Date().toISOString()
    }
  },
  {
    id: 'mock-k8s-terminal-preview',
    kind: 'terminal-block',
    at: 7,
    order: 7,
    block: {
      id: 'mock-k8s-terminal-preview',
      command: 'kubectl -n production get deploy checkout-api -o wide && kubectl -n production get pods -l app=checkout-api -o wide',
      status: 'finished',
      exitCode: 0,
      output: 'NAME           READY   UP-TO-DATE   AVAILABLE   AGE   CONTAINERS     IMAGES\\ncheckout-api   3/5     2            3           42d   checkout-api   registry.example.com/checkout-api:2026.05.18-rc.4\\n\\nNAME                            READY   STATUS             RESTARTS   AGE   IP\\ncheckout-api-7df9c8d9b8-4xz2k   1/1     Running            0          41m   10.42.8.31\\ncheckout-api-7df9c8d9b8-bm6vj   0/1     CrashLoopBackOff   6          39m   10.42.8.44',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      source: 'assistant'
    }
  },
  {
    id: 'mock-k8s-assistant-3',
    kind: 'message',
    at: 8,
    order: 8,
    message: {
      id: 'mock-k8s-assistant-3',
      role: 'assistant',
      title: 'Next step',
      body: `The rollout is partially available and at least one new pod is restarting. I need the previous container termination reason and warning events next.

Please approve the diagnostic command below. It is still read-only and scoped to \`production\` / \`checkout-api\`.`,
      createdAt: new Date().toISOString()
    }
  }
];

export const MOCK_PENDING_APPROVAL: CommandApproval = {
  kind: 'command',
  command:
    'kubectl -n production describe pods -l app=checkout-api && kubectl -n production get events --sort-by=.lastTimestamp --field-selector type=Warning | tail -40',
  reason:
    'Run a read-only Kubernetes diagnostic to inspect restart reasons, probe failures, OOMKilled signals, and recent warning events for checkout-api.'
};

export const LEGACY_MOCK_TIMELINE_ITEMS: TimelineItem[] = [
  {
    id: 'msg-websearch-1',
    kind: 'message',
    at: 3,
    order: 3,
    message: {
      id: 'msg-websearch-1',
      role: 'tool',
      title: 'Web Search',
      body: 'Search completed.',
      toolKind: 'web-search',
      webSearchStatus: 'success',
      webSearchQuery: 'modern ui components examples',
      webSearchResults: [
        { title: 'Modern UI Principles', url: 'https://example.com/1', snippet: 'A guide to modern user interface design.' },
        { title: 'Glassmorphism in 2024', url: 'https://example.com/2', snippet: 'How glassmorphism is evolving this year.' }
      ],
      createdAt: new Date().toISOString()
    }
  },
  {
    id: 'msg-plan-1',
    kind: 'message',
    at: 4,
    order: 4,
    message: {
      id: 'msg-plan-1',
      role: 'tool',
      title: 'Plan',
      body: '',
      toolKind: 'plan',
      executionPlan: {
        id: 'plan-id',
        title: 'Modern UI Style Guidelines',
        version: 'v1.2',
        steps: [
          { id: 's1', label: 'Define Color Palette', status: 'completed' },
          { id: 's2', label: 'Setup Typography System', status: 'inProgress' },
          { id: 's3', label: 'Implement Responsive Grid', status: 'pending' }
        ]
      },
      createdAt: new Date().toISOString()
    }
  },
  {
    id: 'msg-assistant-content',
    kind: 'message',
    at: 5,
    order: 5,
    message: {
      id: 'msg-assistant-content',
      role: 'assistant',
      title: 'Assistant Response',
      body: `Here is some markdown content.
      
We can include lists:
- Item one
- Item two

And syntax-highlighted code blocks:
\`\`\`javascript
function helloWorld() {
  console.log("Hello world!");
  return true;
}
\`\`\`

And shell commands:
\`\`\`bash
ls -la
npm install react-syntax-highlighter
\`\`\`
`,
      createdAt: new Date().toISOString()
    }
  },
  {
    id: 'msg-diff-1',
    kind: 'message',
    at: 6,
    order: 6,
    message: {
      id: 'msg-diff-1',
      role: 'assistant',
      title: 'Code Changes',
      body: 'I have proposed some changes to the styles:',
      fileDiffs: [
        {
          filePath: 'src/components/Chat/ChatPanel.css',
          diffType: {
            kind: 'create',
            delta: {
              replacement_line_range: { start: 0, end: 0 },
              insertion: '.chat-region {\n  background: var(--background-color);\n}\n\n.message-bubble {\n  border-radius: 4px;\n}'
            }
          }
        },
        {
          filePath: 'src/components/Chat/ChatPanel.tsx',
          diffType: {
            kind: 'create',
            delta: {
              replacement_line_range: { start: 0, end: 0 },
              insertion: 'import React from "react";\n\nexport const ChatPanel = () => {\n  return <div>Hello</div>;\n};'
            }
          }
        }
      ],
      createdAt: new Date().toISOString()
    }
  },
  {
    id: 'block-user-1',
    kind: 'terminal-block',
    at: 7,
    order: 7,
    block: {
      id: 'block-user-1',
      command: 'ls -la',
      status: 'finished',
      output: 'total 16\\ndrwxr-xr-x  10 user  group  320 May 10 01:00 .',
      startedAt: new Date().toISOString(),
      source: 'user'
    }
  },
  {
    id: 'block-running-1',
    kind: 'terminal-block',
    at: 7,
    order: 7,
    block: {
      id: 'block-running-1',
      command: 'npm run build',
      status: 'running',
      output: 'Generating static site... [==        ] 20%',
      startedAt: new Date().toISOString(),
      source: 'assistant'
    }
  },
  {
    id: 'block-finished-1',
    kind: 'terminal-block',
    at: 8,
    order: 8,
    block: {
      id: 'block-finished-1',
      command: 'ls -l',
      status: 'finished',
      exitCode: 0,
      output: 'total 0\\ndrwxr-xr-x  2 user  group  64 May 10 00:00 src',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      source: 'assistant'
    }
  },
  {
    id: 'block-error-1',
    kind: 'terminal-block',
    at: 9,
    order: 9,
    block: {
      id: 'block-error-1',
      command: 'cat file_not_found.txt',
      status: 'finished',
      exitCode: 1,
      output: 'cat: file_not_found.txt: No such file or directory',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      source: 'assistant'
    }
  },
  {
    id: 'term-err-1',
    kind: 'terminal-error',
    at: 10,
    order: 10,
    error: 'Failed to execute command: Connection refused by server.'
  },
  {
    id: 'msg-multi-agent-1',
    kind: 'multi-agent-block',
    at: 11,
    order: 11,
    block: {
      agentName: 'Architect Prime',
      status: 'running',
      taskSummary: 'Analyzing component architecture and preparing dynamic theme configuration generators.',
      colorScheme: 'indigo'
    }
  },
  {
    id: 'msg-multi-agent-2',
    kind: 'multi-agent-block',
    at: 12,
    order: 12,
    block: {
      agentName: 'Code Evaluator',
      status: 'running',
      taskSummary: 'Auditing generated layout files for strict accessibility compliance (WCAG).',
      colorScheme: 'pink'
    }
  },
  {
    id: 'msg-multi-agent-3',
    kind: 'multi-agent-block',
    at: 13,
    order: 13,
    block: {
      agentName: 'Test Verifier',
      status: 'completed',
      taskSummary: 'All 24 unit and integration test suites passed successfully.',
      colorScheme: 'teal'
    }
  }
];
