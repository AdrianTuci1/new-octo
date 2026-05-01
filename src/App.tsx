import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { PhysicalPosition, currentMonitor, getCurrentWindow, primaryMonitor } from '@tauri-apps/api/window';
import { Bot, FileText, MessagesSquare, Sparkles, Code2 } from 'lucide-react';
import './App.css';
import { ChatPanel } from './components/ChatPanel';
import { ComposerBar } from './components/ComposerBar';
import { TrayPanel } from './components/TrayPanel';
import type { CommandItem, HelpItem, TrayContentMode } from './components/trayTypes';

type PanelMode = 'launcher' | 'settings' | 'onboarding';
type TrayMode = 'closed' | TrayContentMode;

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  title: string;
  body: string;
};

const HELP_ITEMS: HelpItem[] = [
  { keys: ['!'], label: 'input shell command' },
  { keys: ['/'], label: 'for slash commands' },
  { keys: ['@'], label: 'for file paths and attaching other context' },
  { keys: ['⇧', '⌘', '+'], label: 'open code review' },
  { keys: ['⇧', '⌘', 'A'], label: 'toggle conversation list' },
  { keys: ['⌘', 'Y'], label: 'search and continue conversations' },
  { keys: ['⌘', '↩'], label: 'start a new conversation' },
  { keys: ['⇧', '⌘', 'I'], label: 'toggle auto-accept' },
  { keys: ['^', 'C'], label: 'pause agent' },
  { keys: ['esc'], label: 'go back to terminal' }
];

const COMMAND_ITEMS: CommandItem[] = [
  { label: '/agent', detail: 'Start an assisted coding conversation', icon: Bot },
  { label: '/create-environment', detail: 'Create an Oz environment via guided setup', icon: Code2 },
  { label: '/open-file', detail: 'Open a file in the code editor', icon: FileText },
  { label: '/conversations', detail: 'Open conversation history', icon: MessagesSquare },
  { label: '/prompts', detail: 'Search saved prompts', icon: Sparkles },
  { label: '/plan', detail: 'Prompt the agent to research and create a plan', icon: Code2 },
  { label: '/create mcp', detail: 'Placeholder for MCP creation flow', icon: Code2 },
  { label: '/new', detail: 'Reset the current conversation shell', icon: Sparkles }
];

const INITIAL_CHAT: ChatMessage[] = [];
function getPanelMode(): PanelMode {
  const panel = new URLSearchParams(window.location.search).get('panel');
  if (panel === 'settings') return 'settings';
  if (panel === 'onboarding') return 'onboarding';
  return 'launcher';
}

function PanelPlaceholder(props: { title: string; subtitle: string }) {
  return (
    <div className="panel-screen">
      <div className="panel-card">
        <div className="panel-kicker">Placeholder</div>
        <h1>{props.title}</h1>
        <p>{props.subtitle}</p>
      </div>
    </div>
  );
}

function LauncherPrototype() {
  const [query, setQuery] = useState('');
  const [trayMode, setTrayMode] = useState<TrayMode>('closed');
  const [lastTrayMode, setLastTrayMode] = useState<Exclude<TrayMode, 'closed'>>('help');
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_CHAT);
  const [composerHeight, setComposerHeight] = useState(0);
  const [dockHeight, setDockHeight] = useState(0);
  const shellRef = useRef<HTMLElement | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const lastWindowSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  const isExpanded = trayMode !== 'closed';
  const activeTrayMode = trayMode === 'closed' ? lastTrayMode : trayMode;

  useLayoutEffect(() => {
    const element = shellRef.current;
    if (!element) {
      return;
    }

    const currentWindow = getCurrentWindow();
    let rafId = 0;

    const syncWindow = async () => {
      const rect = element.getBoundingClientRect();
      const scaleFactor = await currentWindow.scaleFactor();
      const physicalSize = new LogicalSize(Math.ceil(rect.width), Math.ceil(rect.height)).toPhysical(scaleFactor);

      if (
        lastWindowSizeRef.current.width === physicalSize.width &&
        lastWindowSizeRef.current.height === physicalSize.height
      ) {
        return;
      }

      lastWindowSizeRef.current = { width: physicalSize.width, height: physicalSize.height };
      await currentWindow.setSize(physicalSize);

      const monitor = await currentMonitor();
      const workingMonitor = monitor ?? (await primaryMonitor());
      if (!workingMonitor) {
        return;
      }

      const { position, size } = workingMonitor.workArea;
      const x = position.x + Math.max(0, Math.floor((size.width - physicalSize.width) / 2));
      const y = position.y + Math.max(0, size.height - physicalSize.height - 10);
      await currentWindow.setPosition(new PhysicalPosition(x, y));
    };

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        void syncWindow();
      });
    });

    observer.observe(element);
    void syncWindow();

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    const element = dockRef.current;
    if (!element) {
      return;
    }

    const updateHeight = () => {
      setDockHeight(Math.ceil(element.getBoundingClientRect().height));
    };

    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  const openTray = (nextMode: Exclude<TrayMode, 'closed'>) => {
    setLastTrayMode(nextMode);
    setTrayMode((current) => (current === nextMode ? 'closed' : nextMode));
  };

  const submitQuery = () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    if (trimmed === '/new') {
      setMessages([]);
      setQuery('');
      setTrayMode('closed');
      return;
    }

    setMessages((current) => [
      ...current,
      {
        id: `user-${current.length + 1}`,
        role: 'user',
        title: 'User',
        body: trimmed
      },
      {
        id: `assistant-${current.length + 2}`,
        role: 'assistant',
        title: 'Assistant',
        body: 'This is placeholder conversation content for the new Rust + React launcher shell.'
      }
    ]);
    setQuery('');
    setTrayMode('closed');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitQuery();
      return;
    }

    if (event.key === 'Escape') {
      setTrayMode('closed');
      return;
    }

    if (event.key === '?' && query.length === 0) {
      event.preventDefault();
      openTray('help');
      return;
    }

    if (event.key === '/' && query.length === 0) {
      event.preventDefault();
      openTray('commands');
    }
  };

  return (
    <main className="prototype-root">
      <section
        ref={shellRef}
        className={`launcher-shell ${isExpanded ? 'expanded' : 'collapsed'}`}
        style={{ height: `${(isExpanded ? 472 : 0) + dockHeight}px` }}
      >
        <div className="chat-stack">
          <ChatPanel
            dockOffset={composerHeight}
            isOpen={isExpanded}
            messages={messages}
          />
        </div>

        <div ref={dockRef} className="dock-stack">
          <TrayPanel
            activeMode={activeTrayMode}
            commandItems={COMMAND_ITEMS}
            helpItems={HELP_ITEMS}
            isOpen={isExpanded}
            onInsertCommand={(command) => setQuery(`${command} `)}
            onToggleCommands={() => openTray('commands')}
            onToggleHelp={() => openTray('help')}
          />

          <ComposerBar
            onKeyDown={handleKeyDown}
            onHeightChange={setComposerHeight}
            onQueryChange={setQuery}
            query={query}
          />
        </div>
      </section>
    </main>
  );
}

export function App() {
  const panelMode = getPanelMode();

  if (panelMode === 'settings') {
    return (
      <PanelPlaceholder
        title="Settings Tray Placeholder"
        subtitle="This stays outside the launcher shell. The real settings flow can be built later as a separate panel."
      />
    );
  }

  if (panelMode === 'onboarding') {
    return (
      <PanelPlaceholder
        title="Onboarding Tray Placeholder"
        subtitle="This is intentionally separate from chat, tray, and input so the launcher core remains simple."
      />
    );
  }

  return <LauncherPrototype />;
}
