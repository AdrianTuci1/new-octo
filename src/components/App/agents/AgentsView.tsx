import './AgentsView.css';
import { ChevronDown, Search, CheckCircle2, Circle, Moon } from 'lucide-react';

type Run = {
  id: string;
  title: string;
  timeLabel: string;
  source: string;
  credits: number;
  status: 'completed' | 'running' | 'idle';
  userInitials: string;
};

const mockRuns: Run[] = [
  {
    id: '1',
    title: 'Untitled conversation',
    timeLabel: '18 min ago',
    source: 'Interactive',
    credits: 0,
    status: 'running',
    userInitials: 'S'
  },
  {
    id: '2',
    title: 'Initial Developer Assistance Offer',
    timeLabel: '5 hours ago',
    source: 'Interactive',
    credits: 4.5,
    status: 'completed',
    userInitials: 'S'
  }
];

export function AgentsView() {
  return (
    <div className="agents-view">
      <header className="agents-header">
        <h1 className="agents-title">Runs</h1>
        <div className="agents-header-actions">
          <button className="agents-btn-secondary">Get started</button>
          <button className="agents-btn-primary">New agent</button>
        </div>
      </header>

      <div className="agents-filters-bar">
        <div className="agents-filters-group">
          <div className="filter-item">
            <span>Status: All</span>
            <ChevronDown size={14} />
          </div>
          <div className="filter-item">
            <span>Source: All</span>
            <ChevronDown size={14} />
          </div>
          <div className="filter-item">
            <span>Created on: All</span>
            <ChevronDown size={14} />
          </div>
          <div className="filter-item">
            <span>Has artifact: All</span>
            <ChevronDown size={14} />
          </div>
          <div className="filter-item">
            <span>Environment: All</span>
            <ChevronDown size={14} />
          </div>
        </div>
        <div className="agents-search-wrapper">
          <Search size={14} className="search-icon" />
          <input type="text" placeholder="Search" />
        </div>
      </div>

      <div className="agents-runs-list">
        {mockRuns.map((run) => (
          <div key={run.id} className="run-card">
            <div className="run-card-icon">
              {run.status === 'completed' ? (
                <div className="status-icon-completed-wrapper">
                  <CheckCircle2 size={16} />
                </div>
              ) : run.status === 'running' ? (
                <div className="status-icon-running-wrapper">
                   <Moon size={14} fill="currentColor" />
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
                  <div className="run-user-avatar">{run.userInitials}</div>
                </div>
              </div>
              <div className="run-card-metadata">
                Source: {run.source} • Credits used: {run.credits} credits
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
