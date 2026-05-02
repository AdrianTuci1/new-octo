import './TrayHistory.css';
import type { HistoryEntry, HistoryTab } from '../../types/history';

type TrayHistoryProps = {
  activeTab: HistoryTab;
  entries: HistoryEntry[];
  selectedIndex: number;
  onSelectEntry: (entry: HistoryEntry) => void;
  onTabChange: (tab: HistoryTab) => void;
};

const HISTORY_TABS: { id: HistoryTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'commands', label: 'Commands' },
  { id: 'prompts', label: 'Prompts' }
];

export function TrayHistory({
  activeTab,
  entries,
  selectedIndex,
  onSelectEntry,
  onTabChange
}: TrayHistoryProps) {
  return (
    <section className="tray-pane tray-history" aria-label="Tray history">
      <div className="tray-history-header">
        {HISTORY_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tray-history-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tray-pane-scroll">
        <div className="tray-history-list">
          {entries.map((entry, index) => (
            <button
              key={entry.id}
              className={`tray-history-row ${index === selectedIndex ? 'active' : ''}`}
              onClick={() => onSelectEntry(entry)}
              type="button"
            >
              <span className="tray-history-kind">{entry.kind === 'command' ? 'cmd' : 'ai'}</span>
              <span className="tray-history-label">{entry.label}</span>
              <span className="tray-history-detail">{entry.detail}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
