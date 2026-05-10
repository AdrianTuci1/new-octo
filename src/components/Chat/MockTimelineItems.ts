import type { TimelineItem } from './utils/timeline';

export const MOCK_TIMELINE_ITEMS: TimelineItem[] = [
  {
    id: 'msg-user-1',
    kind: 'message',
    at: 1,
    order: 1,
    message: {
      id: 'msg-user-1',
      role: 'user',
      title: 'User question',
      body: 'Please show me examples of all blocks so I can style them.',
      createdAt: new Date().toISOString()
    }
  },
  {
    id: 'msg-thinking-1',
    kind: 'message',
    at: 2,
    order: 2,
    message: {
      id: 'msg-thinking-1',
      role: 'assistant',
      title: 'Thinking',
      body: 'Thinking about how to display all blocks in a coherent UI layout...\nAnalyzing requirements for spacing and consistency.\nPreparing the presentation layers.',
      messageKind: 'reasoning',
      thinkingDurationSeconds: 7,
      isStreaming: false,
      createdAt: new Date().toISOString()
    }
  },
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
      parentName: 'Architect Prime',
      status: 'running',
      subAgents: [
        {
          id: 'sub1',
          name: 'Refactoring Agent',
          task: 'Analyzing component architecture for redundancies...',
          status: 'running',
        },
        {
          id: 'sub2',
          name: 'Styling Specialist',
          task: 'Preparing dynamic theme configuration generators.',
          status: 'completed',
          result: 'Theme configs generated.'
        },
        {
          id: 'sub3',
          name: 'Test Writer',
          task: 'Generating unit tests for core engine logic.',
          status: 'idle',
        }
      ]
    }
  }
];
