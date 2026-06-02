import './AgentsView.css';
import { useMemo, useState } from 'react';
import { Search, CheckCircle2, Circle, Moon, AlertTriangle, Ban } from 'lucide-react';
import type { WorkspaceConversation } from '../chrome/workspaceChromeTypes';
import { useAppWindowController } from '../hooks/useAppWindowController';

type ConversationGroup = 'active' | 'past';
type StatusFilter = 'all' | 'active' | 'completed' | 'failed' | 'cancelled';
type GroupFilter = 'all' | ConversationGroup;
type CreatedFilter = 'all' | 'today' | 'week' | 'month' | 'older' | 'unknown';

type Run = WorkspaceConversation & {
  group: ConversationGroup;
  displayStatus: Exclude<StatusFilter, 'all'>;
};

type AgentsViewProps = {
  conversations?: WorkspaceConversation[];
  openConversationIds?: string[];
  selectedConversationId?: string | null;
  onNewConversation?: () => void;
  onSelectConversation?: (id: string) => void;
  onClose?: () => void;
};

function normalizeStatus(conversation: WorkspaceConversation, group: ConversationGroup): Run['displayStatus'] {
  const status = conversation.status?.toLowerCase() ?? '';

  if (status.includes('cancel')) return 'cancelled';
  if (status.includes('fail') || status.includes('error')) return 'failed';
  if (
    group === 'active'
    || status.includes('running')
    || status.includes('progress')
    || status.includes('pending')
    || status.includes('queued')
  ) {
    return 'active';
  }

  return 'completed';
}

function isCreatedWithin(createdAt: string | null | undefined, days: number) {
  if (!createdAt) return false;

  const createdTime = new Date(createdAt).getTime();
  if (!Number.isFinite(createdTime)) return false;

  return Date.now() - createdTime <= days * 24 * 60 * 60 * 1000;
}

function matchesCreatedFilter(createdAt: string | null | undefined, filter: CreatedFilter) {
  if (filter === 'all') return true;
  if (!createdAt) return filter === 'unknown';

  const createdDate = new Date(createdAt);
  if (Number.isNaN(createdDate.getTime())) return filter === 'unknown';

  if (filter === 'today') {
    const today = new Date();
    return createdDate.toDateString() === today.toDateString();
  }

  if (filter === 'week') return isCreatedWithin(createdAt, 7);
  if (filter === 'month') return isCreatedWithin(createdAt, 30);
  return !isCreatedWithin(createdAt, 30);
}

function initialsFromTitle(title: string) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('') || 'A';
}

function statusLabel(status: Run['displayStatus']) {
  if (status === 'active') return 'Active';
  if (status === 'failed') return 'Failed';
  if (status === 'cancelled') return 'Cancelled';
  return 'Completed';
}

function environmentLabel(conversation: WorkspaceConversation) {
  const cwdSegments = conversation.cwd?.split('/').filter(Boolean) ?? [];
  return conversation.branchLabel ?? cwdSegments[cwdSegments.length - 1] ?? '~';
}

export function AgentsView(props: AgentsViewProps) {
  // Standalone consumers may resolve their own controller.
  // AppWindow must pass the shared state explicitly so the overlay stays bound to the live workspace store.
  const app = props.onNewConversation !== undefined ? null : useAppWindowController();
  const conversations = props.conversations ?? (app ? app.sidebar.workspaceConversations : []);
  const openConversationIds = props.openConversationIds ?? (app ? app.sidebar.openConversationIds : []);
  const selectedConversationId = props.selectedConversationId ?? (app ? app.sidebar.selectedOpenConversationId : null);
  const onNewConversation = props.onNewConversation ?? (app ? app.actions.onNewConversationInNewTab : () => {});
  const onSelectConversation = props.onSelectConversation ?? (app ? app.actions.onSelectConversation : () => {});
  const onClose = props.onClose ?? (app ? app.actions.onToggleAgents : () => {});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');
  const [createdFilter, setCreatedFilter] = useState<CreatedFilter>('all');
  const [environmentFilter, setEnvironmentFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const openConversationIdSet = useMemo(() => new Set(openConversationIds), [openConversationIds]);

  const runs = useMemo<Run[]>(() => conversations.map((conversation) => {
    const group = openConversationIdSet.has(conversation.id) ? 'active' : 'past';

    return {
      ...conversation,
      group,
      displayStatus: normalizeStatus(conversation, group)
    };
  }), [conversations, openConversationIdSet]);

  const environmentOptions = useMemo(() => {
    const labels = runs
      .map(environmentLabel)
      .filter((label, index, allLabels) => allLabels.indexOf(label) === index)
      .sort((a, b) => a.localeCompare(b));

    return labels;
  }, [runs]);

  const filteredRuns = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return runs.filter((run) => {
      const environment = environmentLabel(run);
      const searchableText = [
        run.title,
        run.id,
        run.status ?? '',
        run.branchLabel ?? '',
        run.cwd ?? '',
        run.modelId ?? ''
      ].join(' ').toLowerCase();

      return (
        (statusFilter === 'all' || run.displayStatus === statusFilter) &&
        (groupFilter === 'all' || run.group === groupFilter) &&
        matchesCreatedFilter(run.createdAt, createdFilter) &&
        (environmentFilter === 'all' || environment === environmentFilter) &&
        (!query || searchableText.includes(query))
      );
    });
  }, [createdFilter, environmentFilter, groupFilter, runs, searchQuery, statusFilter]);

  const hasFilters = statusFilter !== 'all'
    || groupFilter !== 'all'
    || createdFilter !== 'all'
    || environmentFilter !== 'all'
    || searchQuery.trim().length > 0;

  const resetFilters = () => {
    setStatusFilter('all');
    setGroupFilter('all');
    setCreatedFilter('all');
    setEnvironmentFilter('all');
    setSearchQuery('');
  };

  const handleNewConversation = () => {
    onNewConversation();
    onClose?.();
  };

  const handleSelectConversation = (conversationId: string) => {
    onSelectConversation(conversationId);
    onClose?.();
  };

  return (
    <div className="agents-view">
      <header className="agents-header">
        <h1 className="agents-title">Runs</h1>
        <div className="agents-header-actions">
          <button className="agents-btn-secondary" type="button" onClick={resetFilters} disabled={!hasFilters}>
            Reset filters
          </button>
          <button className="agents-btn-primary" type="button" onClick={handleNewConversation}>
            New agent
          </button>
        </div>
      </header>

      <div className="agents-filters-bar">
        <div className="agents-filters-group">
          <label className="filter-item">
            <span>Status:</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label className="filter-item">
            <span>Group:</span>
            <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value as GroupFilter)}>
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="past">Past</option>
            </select>
          </label>
          <label className="filter-item">
            <span>Created:</span>
            <select value={createdFilter} onChange={(event) => setCreatedFilter(event.target.value as CreatedFilter)}>
              <option value="all">All</option>
              <option value="today">Today</option>
              <option value="week">Last 7 days</option>
              <option value="month">Last 30 days</option>
              <option value="older">Older</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <label className="filter-item">
            <span>Environment:</span>
            <select value={environmentFilter} onChange={(event) => setEnvironmentFilter(event.target.value)}>
              <option value="all">All</option>
              {environmentOptions.map((environment) => (
                <option key={environment} value={environment}>{environment}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="agents-search-wrapper">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
      </div>

      <div className="agents-runs-list">
        {filteredRuns.map((run) => (
          <button
            key={run.id}
            className={`run-card ${run.id === selectedConversationId ? 'selected' : ''}`}
            type="button"
            onClick={() => handleSelectConversation(run.id)}
          >
            <div className="run-card-icon">
              {run.displayStatus === 'completed' ? (
                <div className="status-icon-completed-wrapper">
                  <CheckCircle2 size={16} />
                </div>
              ) : run.displayStatus === 'active' ? (
                <div className="status-icon-running-wrapper">
                  <Moon size={14} fill="currentColor" />
                </div>
              ) : run.displayStatus === 'failed' ? (
                <div className="status-icon-failed-wrapper">
                  <AlertTriangle size={16} />
                </div>
              ) : run.displayStatus === 'cancelled' ? (
                <div className="status-icon-cancelled-wrapper">
                  <Ban size={16} />
                </div>
              ) : (
                <Circle size={16} className="status-icon-idle" />
              )}
            </div>

            <div className="run-card-content">
              <div className="run-card-top">
                <span className="run-card-title">{run.title}</span>
                <div className="run-card-right">
                  <span className="run-card-time">{run.timeLabel}</span>
                  <div className="run-user-avatar">{initialsFromTitle(run.title)}</div>
                </div>
              </div>
              <div className="run-card-metadata">
                {statusLabel(run.displayStatus)} • {run.group === 'active' ? 'Active conversation' : 'Past conversation'} • Environment: {environmentLabel(run)}
                {typeof run.messageCount === 'number' ? ` • Messages: ${run.messageCount}` : ''}
              </div>
            </div>
          </button>
        ))}

        {filteredRuns.length === 0 && (
          <div className="agents-empty-state">
            <span>No runs match the current filters.</span>
            {hasFilters && (
              <button type="button" onClick={resetFilters}>Reset filters</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
