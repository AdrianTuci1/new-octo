import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Terminal, Check } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CodeDiffView } from './CodeDiffView';
import { FileArtifactBlock, ImplementationPlanBlock, ThinkingBlock, WebSearchBlock, WorkspaceExplorationBlock } from './blocks';
import { extractInlineFileChangeApproval, visibleChatMessageBody } from '../../hooks/useChat';
import type { ChatMessage, ExecutionPlanArtifact } from '../../types/chat';
import type { CommandApproval } from '../../types/terminal';
import type { FileDiff } from '../../types/diff';
import { type FileDiffPreviewStatus } from '../../lib/fileDiffs';
import { ProfileAvatar } from '../App/profile/ProfileAvatar';
import type { UserProfileSettings } from '../App/settings/profileSettings';
import type { OpenEditorFileOptions } from '../../stores/editorStore';

type MessageBubbleProps = {
  message: ChatMessage;
  profile: UserProfileSettings;
  openFile: (path: string, name: string, content?: string, options?: OpenEditorFileOptions) => void;
  onRequestCommandApproval?: (approval: CommandApproval) => void;
};

function highlightSlashCommandsInMarkdown(text: string): string {
  // Split text by backticks (code blocks) to ignore them during processing
  const parts = text.split(/(`{1,3}[\s\S]*?`{1,3})/g);

  return parts.map((part, index) => {
    // Odd indices correspond to matches from the capturing group (the backtick blocks)
    if (index % 2 === 1) {
      return part;
    }

    // In normal text, find occurrences of slash commands
    // Must be preceded by start/whitespace, contain only word chars/hyphens,
    // and followed by whitespace, end, or sentence punctuation.
    return part.replace(/(^|\s)(\/[a-zA-Z0-9-_]+)(?=$|\s|[.,!?;:])/g, (match, space, cmd) => {
      return `${space}[${cmd}](slash-cmd://${cmd.slice(1)})`;
    });
  }).join('');
}

const SHELL_LANGUAGES = new Set(['bash', 'console', 'fish', 'ps1', 'powershell', 'sh', 'shell', 'terminal', 'zsh']);
const FILE_PATH_PATTERN = /(?:^|[\s"'`=:/])((?:\.{1,2}\/|\/)?(?:[\w.-]+\/)+[\w.-]+\.[A-Za-z0-9]{1,12}|[\w.-]+\.[A-Za-z0-9]{1,12})(?=$|[\s"'`),;])/;

function cleanPossibleFilePath(value: string) {
  return value
    .trim()
    .replace(/^[-*]\s+/, '')
    .replace(/^file(?:name)?\s*[:=]\s*/i, '')
    .replace(/^path\s*[:=]\s*/i, '')
    .replace(/^`+|`+$/g, '')
    .replace(/^\*\*|\*\*$/g, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

function extractFilePathFromFence(info: string, previousLine: string) {
  const infoParts = info.trim().split(/\s+/).filter(Boolean);
  const language = infoParts[0]?.toLowerCase() ?? '';
  if (SHELL_LANGUAGES.has(language)) {
    return null;
  }

  const metadata = infoParts.slice(1).join(' ');
  const metadataMatch = metadata.match(FILE_PATH_PATTERN);
  if (metadataMatch?.[1]) {
    return cleanPossibleFilePath(metadataMatch[1]);
  }

  const previous = cleanPossibleFilePath(previousLine);
  const previousMatch = previous.match(FILE_PATH_PATTERN);
  return previousMatch?.[1] ? cleanPossibleFilePath(previousMatch[1]) : null;
}

function extractFileProposalFromMarkdown(body: string) {
  const lines = body.split('\n');
  const fileDiffs: FileDiff[] = [];
  const visibleLines: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const fenceStart = lines[index].match(/^```([^\n`]*)$/);
    if (!fenceStart) {
      visibleLines.push(lines[index]);
      continue;
    }

    const previousVisibleLine = visibleLines[visibleLines.length - 1] ?? '';
    const filePath = extractFilePathFromFence(fenceStart[1] ?? '', previousVisibleLine);
    const codeLines: string[] = [];
    let endIndex = index + 1;
    for (; endIndex < lines.length; endIndex += 1) {
      if (/^```$/.test(lines[endIndex])) {
        break;
      }
      codeLines.push(lines[endIndex]);
    }

    if (endIndex >= lines.length) {
      visibleLines.push(lines[index], ...codeLines);
      break;
    }

    if (!filePath) {
      visibleLines.push(lines[index], ...codeLines, lines[endIndex]);
      index = endIndex;
      continue;
    }

    if (previousVisibleLine && cleanPossibleFilePath(previousVisibleLine).includes(filePath)) {
      visibleLines.pop();
    }

    fileDiffs.push({
      filePath,
      diffType: {
        kind: 'create',
        delta: {
          replacement_line_range: { start: 1, end: 1 },
          insertion: codeLines.join('\n')
        }
      }
    });
    index = endIndex;
  }

  return {
    visibleBody: visibleLines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd(),
    fileDiffs
  };
}

function MessageBubbleComponent({ message, onRequestCommandApproval, profile, openFile }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const rawVisibleBodyWithArtifacts = message.role === 'assistant'
    ? visibleChatMessageBody(message.body)
    : message.body;
  const inlineFileChangeApproval = useMemo(() => (
    message.role === 'assistant' && !message.isStreaming
      ? extractInlineFileChangeApproval(message.body).approval
      : undefined
  ), [message.body, message.isStreaming, message.role]);
  const extractedFileProposal = useMemo(() => (
    message.role === 'assistant' && !message.isStreaming
      ? extractFileProposalFromMarkdown(rawVisibleBodyWithArtifacts)
      : { visibleBody: rawVisibleBodyWithArtifacts, fileDiffs: [] as FileDiff[] }
  ), [message.isStreaming, message.role, rawVisibleBodyWithArtifacts]);
  const displayFileDiffs = message.fileDiffs?.length
    ? message.fileDiffs
    : extractedFileProposal.fileDiffs;
  const filePreviewStatus: FileDiffPreviewStatus = message.fileChangeStatus
    ?? (message.toolKind === 'file-change'
      ? 'accepted'
      : displayFileDiffs.length > 0
        ? 'pending'
        : 'pending');
  const emittedFileProposalIdsRef = useRef(new Set<string>());
  const rawVisibleBody = extractedFileProposal.visibleBody;
  const visibleBody = highlightSlashCommandsInMarkdown(rawVisibleBody);
  const showStreamingHint = message.role === 'assistant'
    && message.isStreaming
    && !visibleBody.trim()
    && !message.hasNativeThinking;

  useEffect(() => {
    if (!onRequestCommandApproval) return;
    if (message.role !== 'assistant' || message.isStreaming) return;
    if (message.fileDiffs?.length) return;
    if (emittedFileProposalIdsRef.current.has(message.id)) return;

    if (inlineFileChangeApproval) {
      emittedFileProposalIdsRef.current.add(message.id);
      onRequestCommandApproval(inlineFileChangeApproval);
      return;
    }

    if (extractedFileProposal.fileDiffs.length === 0) return;

    emittedFileProposalIdsRef.current.add(message.id);
    onRequestCommandApproval({
      kind: 'file-change',
      summary: `Review proposed changes across ${extractedFileProposal.fileDiffs.length} ${extractedFileProposal.fileDiffs.length === 1 ? 'file' : 'files'}`,
      fileDiffs: extractedFileProposal.fileDiffs
    });
  }, [
    extractedFileProposal.fileDiffs,
    inlineFileChangeApproval,
    message.fileDiffs?.length,
    message.id,
    message.isStreaming,
    message.role,
    onRequestCommandApproval
  ]);

  const handleMarkdownLinkClick = useCallback(async (href?: string | null) => {
    if (!href) return;

    const localPath = resolveLocalPathFromHref(href);
    if (localPath) {
      const openedInEditor = await openLocalPath(localPath, openFile);
      if (openedInEditor) {
        return;
      }
    }

    const match = href.match(/^octomus:\/\/cloud-profile\/(modal|custom-vm)$/);
    if (!match) {
      try {
        await invoke('open_external_url', { url: href });
      } catch (error) {
        console.warn('[chat] failed to open external chat link', error);
        window.open(href, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    const provider = match[1];
    const profileId = provider === 'modal' ? 'modal-sandbox' : 'core-dev-vm';

    try {
      await invoke('open_cloud_profile_drawer', { profileId });
    } catch (error) {
      console.warn('[chat] failed to open cloud profile drawer from chat link', error);
    }
  }, [openFile]);

  const markdownComponents = useMemo(() => ({
    a({ href, children, ...props }: any) {
      if (href && href.startsWith('slash-cmd://')) {
        return (
          <span className="chat-slash-command">
            {children}
          </span>
        );
      }

      return (
        <a
          {...props}
          className="chat-action-link"
          href={href}
          onClick={(event) => {
            event.preventDefault();
            void handleMarkdownLinkClick(href);
          }}
        >
          {children}
        </a>
      );
    },
    code({ inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '');
      const lang = match ? match[1] : '';

      if (!inline && match) {
        return (
          <CodeBlock
            code={String(children).replace(/\n$/, '')}
            language={lang}
            onRequestCommandApproval={onRequestCommandApproval}
          />
        );
      }

      const isSlash = String(children || '').trim().startsWith('/');
      const combinedClassName = isSlash
        ? `${className || ''} is-slash-command`.trim()
        : className;

      return (
        <code className={combinedClassName} {...props}>
          {children}
        </code>
      );
    }
  }), [handleMarkdownLinkClick, onRequestCommandApproval]);

  return (
    <div className={`message-bubble ${message.role}`}>
      <div className="role-avatar-container">
        {isUser && (
          <ProfileAvatar profile={profile} size={24} showInitials={Boolean(profile.avatarDataUrl)} />
        )}
      </div>

      <div className="message-content">
        {message.messageKind === 'reasoning' ? (
          <ThinkingBlock 
            body={visibleBody} 
            isStreaming={message.isStreaming} 
            durationSeconds={message.thinkingDurationSeconds}
          />
        ) : showStreamingHint ? (
          <div className="message-streaming-hint">
            <span className="thinking-dot-animation">Thinking</span>
            {message.status && message.status !== 'queued' && (
              <span className="status-badge"> ({message.status})</span>
            )}
          </div>
        ) : message.role === 'tool' ? (
          message.toolKind === 'web-search'
            ? (
                <div className="tool-output-web-search">
                  <WebSearchBlock
                    status={message.webSearchStatus}
                    results={message.webSearchResults ?? []}
                    query={message.webSearchQuery}
                    onOpenResult={(url) => {
                      void handleMarkdownLinkClick(url);
                    }}
                  />
                  {(!message.webSearchResults || message.webSearchResults.length === 0) && message.body.trim().length > 0 && (
                    <MarkdownBody
                      body={message.body}
                      className="tool-output-raw tool-output-web-search-fallback"
                      components={markdownComponents}
                    />
                  )}
                </div>
              )
            : message.toolKind === 'workspace-exploration' && message.workspaceExploration
              ? (
                  <div className="tool-output-workspace-exploration">
                    <WorkspaceExplorationBlock
                      exploration={message.workspaceExploration}
                      isStreaming={message.isStreaming}
                    />
                  </div>
                )
            : message.toolKind === 'plan' && message.executionPlan
              ? (
                  <div className="tool-output-plan">
                    {(() => {
                      const executionPlan = message.executionPlan;
                      return (
                    <ImplementationPlanBlock
                      title={executionPlan.title}
                      version={executionPlan.version ?? 'v1'}
                      onClick={() => {
                        openExecutionPlanInEditor(executionPlan, openFile);
                      }}
                    />
                      );
                    })()}
                  </div>
                )
            : message.toolKind === 'file-change' && message.fileDiffs?.length
              ? null
            : (
                <MarkdownBody
                  body={message.body}
                  className="tool-output-raw"
                  components={markdownComponents}
                />
              )
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {visibleBody}
          </ReactMarkdown>
        )}

        {displayFileDiffs.length > 0 && (
          <div className="message-diffs">
            <FileDiffPreviewGroup
              diffs={displayFileDiffs}
              status={filePreviewStatus}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleComponent, (prev, next) => (
  prev.message === next.message
  && prev.profile === next.profile
  && prev.openFile === next.openFile
  && prev.onRequestCommandApproval === next.onRequestCommandApproval
));

function MarkdownBody({
  body,
  className,
  components
}: {
  body: string;
  className?: string;
  components: any;
}) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {body}
      </ReactMarkdown>
    </div>
  );
}

function resolveLocalPathFromHref(href: string) {
  const trimEditorLocationSuffix = (value: string) => value
    .replace(/#L\d+(?:C\d+)?$/i, '')
    .replace(/:\d+(?::\d+)?$/i, '');

  if (href.startsWith('file://')) {
    try {
      return trimEditorLocationSuffix(decodeURIComponent(new URL(href).pathname));
    } catch {
      return null;
    }
  }

  if (href.startsWith('/')) {
    return trimEditorLocationSuffix(href);
  }

  return null;
}

function fileNameFromPath(path: string) {
  const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path;
  return normalizedPath.split('/').pop() || normalizedPath;
}

function FileDiffPreviewGroup({
  diffs,
  status
}: {
  diffs: FileDiff[];
  status: FileDiffPreviewStatus;
}) {
  const createDiffs = diffs.filter((diff) => diff.diffType.kind === 'create');
  const nonCreateDiffs = diffs.filter((diff) => diff.diffType.kind !== 'create');

  return (
    <>
      {createDiffs.length > 0 ? (
        <FileArtifactBlock
          key={`create:${createDiffs.map((diff) => diff.filePath).join('|')}:${status}`}
          diffs={createDiffs}
          status={status}
        />
      ) : null}
      {nonCreateDiffs.length > 0 ? (
        <CodeDiffView diffs={nonCreateDiffs} status={status} />
      ) : null}
    </>
  );
}

async function openLocalPath(
  path: string,
  openFile: (path: string, name: string, content?: string) => void
) {
  try {
    const content = await invoke<string>('terminal_read_file', {
      request: { path }
    });
    openFile(path, fileNameFromPath(path), content);
    return true;
  } catch (error) {
    try {
      await invoke('open_external_url', { url: path });
      return true;
    } catch (openError) {
      console.warn('[chat] failed to open local path from chat link', {
        path,
        readError: error,
        openError
      });
      return false;
    }
  }
}

function sanitizeArtifactId(id: string) {
  return id.replace(/[^a-zA-Z0-9._-]/g, '-');
}

function buildExecutionPlanDocument(plan: ExecutionPlanArtifact) {
  const completedSteps = plan.steps.filter((step) => step.status === 'completed');
  const inProgressSteps = plan.steps.filter((step) => step.status === 'inProgress');
  const pendingSteps = plan.steps.filter((step) => step.status === 'pending');

  return [
    `# ${plan.title}`,
    '',
    plan.summary?.trim() || 'Execution plan proposed.',
    ...(plan.workstreams?.length
      ? [
          '',
          '## Workstreams',
          ...plan.workstreams.map((workstream) => {
            const linkedSteps = workstream.stepIds.length > 0
              ? ` - steps: ${workstream.stepIds.join(', ')}`
            : '';
            return `- [${workstream.status}] ${workstream.title}${linkedSteps}`;
          })
        ]
      : []),
    '',
    '## Tasks',
    ...completedSteps.map((step) => `- [x] ${step.label}`),
    ...inProgressSteps.map((step) => `- [ ] ${step.label} _(in progress)_`),
    ...pendingSteps.map((step) => `- [ ] ${step.label}`),
    '',
    '## Metadata',
    `- id: ${plan.id}`,
    `- version: ${plan.version ?? 'v1'}`
  ].join('\n');
}

function openExecutionPlanInEditor(
  plan: ExecutionPlanArtifact,
  openFile: (path: string, name: string, content?: string, options?: { presentation?: 'artifact-markdown'; readOnly?: boolean }) => void
) {
  const safeId = sanitizeArtifactId(plan.id);
  const path = `/private/tmp/octomus-plan-${safeId}.md`;
  const fileName = `plan-${safeId}.md`;
  openFile(path, fileName, buildExecutionPlanDocument(plan), {
    presentation: 'artifact-markdown',
    readOnly: true
  });
}

const CodeBlock = memo(function CodeBlock({
  code,
  language,
  onRequestCommandApproval
}: {
  code: string;
  language: string;
  onRequestCommandApproval?: (approval: CommandApproval) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isShell = ['sh', 'bash', 'zsh', 'shell', 'fish'].includes(language.toLowerCase());

  return (
    <div className="code-block-container">
      <SyntaxHighlighter
        language={language}
        style={vscDarkPlus}
        showLineNumbers={true}
        lineNumberStyle={{
          minWidth: '2.5em',
          paddingRight: '1em',
          textAlign: 'right',
          color: 'rgba(255, 255, 255, 0.25)',
          fontSize: '11px',
          userSelect: 'none'
        }}
        customStyle={{
          margin: 0,
          background: 'transparent',
          fontSize: '12px',
          padding: '12px 12px 8px 12px',
          lineHeight: '1.5'
        }}
      >
        {code}
      </SyntaxHighlighter>
      <div className="code-block-footer">
        <span className="code-lang">{language}</span>
        <div className="code-actions">
          <button className="code-action-btn" onClick={handleCopy} title="Copy">
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
          {isShell && (
            <button
              className="code-action-btn run"
              title="Run in terminal"
              onClick={() => onRequestCommandApproval?.({ kind: 'command', command: code })}
            >
              <Terminal size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
