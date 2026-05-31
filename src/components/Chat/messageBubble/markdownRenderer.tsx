import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { invoke } from '@tauri-apps/api/core';
import { CodeBlock } from './CodeBlock';
import {
  looksLikeLocalPath,
  prepareMarkdownBody,
  normalizeLocalInlinePath
} from './markdownText';
import {
  openLocalPath,
  resolveLocalPathFromHref
} from './pathUtils';
import type { CommandApproval } from '../../../types/terminal';
import type { OpenEditorFileOptions } from '../../../stores/editorStore';

export const markdownRemarkPlugins = [remarkGfm];

export async function openMarkdownLink(
  href: string | null | undefined,
  openFile: (path: string, name: string, content?: string, options?: OpenEditorFileOptions) => void
) {
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
}

export function createMarkdownComponents({
  openFile,
  onRequestCommandApproval
}: {
  openFile: (path: string, name: string, content?: string, options?: OpenEditorFileOptions) => void;
  onRequestCommandApproval?: (approval: CommandApproval) => void;
}): Components {
  return {
    a({ href, children, ...props }) {
      if (href && href.startsWith('slash-cmd://')) {
        return <span className="chat-slash-command">{children}</span>;
      }

      return (
        <a
          {...props}
          className="chat-action-link"
          href={href}
          onClick={(event) => {
            event.preventDefault();
            void openMarkdownLink(href, openFile);
          }}
        >
          {children}
        </a>
      );
    },
    code(props) {
      const { className, children } = props;
      const codeValue = String(children || '').trim();
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';
      const inline = !match;

      if (!inline && match) {
        return (
          <CodeBlock
            code={String(children).replace(/\n$/, '')}
            language={language}
            onRequestCommandApproval={onRequestCommandApproval}
          />
        );
      }

      if (inline && looksLikeLocalPath(codeValue)) {
        const localPath = normalizeLocalInlinePath(codeValue);
        return (
          <button
            type="button"
            className="chat-action-link chat-local-path-chip"
            onClick={(event) => {
              event.preventDefault();
              void openLocalPath(localPath, openFile);
            }}
          >
            <code {...props}>{children}</code>
          </button>
        );
      }

      const isSlash = codeValue.startsWith('/');
      const combinedClassName = isSlash
        ? `${className || ''} is-slash-command`.trim()
        : className;

      return (
        <code {...props} className={combinedClassName}>
          {children}
        </code>
      );
    }
  };
}

export function MarkdownRenderer({
  body,
  className,
  components
}: {
  body: string;
  className?: string;
  components: Components;
}) {
  const preparedBody = prepareMarkdownBody(body);

  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={markdownRemarkPlugins} components={components}>
        {preparedBody}
      </ReactMarkdown>
    </div>
  );
}
