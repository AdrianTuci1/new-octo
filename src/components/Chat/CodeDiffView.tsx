import { useState } from 'react';
import { Check, X, ChevronDown, Plus, ArrowUp, ArrowDown } from 'lucide-react';
import './CodeDiffView.css';
import type { FileDiff } from '../../types/diff';

type CodeDiffViewProps = {
  diffs: FileDiff[];
  onAccept?: () => void;
  onReject?: () => void;
  status?: 'pending' | 'accepted' | 'rejected';
};

export function CodeDiffView({ 
  diffs, 
  onAccept, 
  onReject,
  status = 'pending' 
}: CodeDiffViewProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(true);

  if (!diffs || diffs.length === 0) return null;

  const totalAdditions = diffs.reduce((sum, diff) => {
    if (diff.diffType.kind === 'create') {
      return sum + diff.diffType.delta.insertion.split('\n').length;
    }
    if (diff.diffType.kind === 'update') {
      return sum + diff.diffType.deltas.reduce((s, d) => s + d.insertion.split('\n').length, 0);
    }
    return sum;
  }, 0);

  const activeDiff = diffs[activeIndex];
  const activeFileName = activeDiff.filePath.split('/').pop() || activeDiff.filePath;

  const handleNext = () => {
    if (activeIndex < diffs.length - 1) setActiveIndex(activeIndex + 1);
  };

  const handlePrev = () => {
    if (activeIndex > 0) setActiveIndex(activeIndex - 1);
  };

  return (
    <div className={`modern-diff-view ${status}`}>
      {/* Main Header */}
      <div className="modern-diff-header">
        <div className="modern-diff-header-left">
          <div className={`status-indicator ${status}`}>
            {status === 'accepted' ? <Check size={14} strokeWidth={3} /> : 
             status === 'rejected' ? <X size={14} strokeWidth={3} /> : 
             <Check size={14} strokeWidth={3} className="opacity-50" />}
          </div>
          <div className="modern-diff-title">
            Proposed changes across {diffs.length} {diffs.length === 1 ? 'file' : 'files'}
          </div>
          {totalAdditions > 0 && (
            <div className="modern-diff-badge count-additions">
              +{totalAdditions}
            </div>
          )}
        </div>

        <div className="modern-diff-header-right">
          <button className="header-action-icon">
            <Plus size={16} />
          </button>
          <button 
            className={`header-action-icon collapse-toggle ${isExpanded ? 'expanded' : ''}`}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <ChevronDown size={16} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <>
          {/* File Tabs */}
          {diffs.length > 0 && (
            <div className="modern-diff-tabs">
              {diffs.map((diff, index) => {
                const fname = diff.filePath.split('/').pop() || diff.filePath;
                return (
                  <button
                    key={index}
                    className={`diff-tab-item ${activeIndex === index ? 'active' : ''}`}
                    onClick={() => setActiveIndex(index)}
                  >
                    {fname}
                  </button>
                );
              })}
            </div>
          )}

          {/* Code Area */}
          <div className="modern-diff-body">
            <div className="code-diff-content">
              {renderDiffLines(activeDiff)}
            </div>
          </div>

          {/* Footer */}
          <div className="modern-diff-footer">
            <div className="hunk-indicator">
              File: {activeIndex + 1}/{diffs.length}
            </div>
            <div className="footer-nav-actions">
              <button 
                className="footer-nav-btn" 
                onClick={handlePrev}
                disabled={activeIndex === 0}
              >
                <ArrowUp size={14} />
                <span>Previous</span>
              </button>
              <button 
                className="footer-nav-btn" 
                onClick={handleNext}
                disabled={activeIndex === diffs.length - 1}
              >
                <ArrowDown size={14} />
                <span>Next</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function renderDiffLines(diff: FileDiff) {
  if (diff.diffType.kind === 'update') {
    return diff.diffType.deltas.map((delta, i) => (
      <div key={i} className="code-diff-hunk">
        <div className="code-diff-line deletion">
          <span className="code-diff-line-number">...</span>
          <span className="code-diff-prefix"></span>
          <span className="code-diff-line-content">Old content placeholder</span>
        </div>
        <div className="code-diff-line addition">
          <span className="code-diff-line-number">...</span>
          <span className="code-diff-prefix"></span>
          <span className="code-diff-line-content">{delta.insertion}</span>
        </div>
      </div>
    ));
  }

  if (diff.diffType.kind === 'create') {
    return diff.diffType.delta.insertion.split('\n').map((line, i) => (
      <div key={i} className="code-diff-line addition">
        <span className="code-diff-line-number">{i + 1}</span>
        <span className="code-diff-prefix"></span>
        <span className="code-diff-line-content">{line}</span>
      </div>
    ));
  }

  return null;
}
