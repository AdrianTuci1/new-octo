import React, { useState } from 'react';
import { Bot, Loader2, CheckCircle2, XCircle, Circle, Sparkles, ChevronDown, Check, X, Pause, Square, GitCompare, Pencil, Compass } from 'lucide-react';
import type { SubAgentCall } from '../../../types/chat';
import './TerminalBlockSummary.css';
import './MultiAgentBlock.css';

// Import dynamic assets
import octomusSvg from '../../../../assets/svg/octomus.svg';
import agent01 from '../../../../assets/svg/loading-agents-01.svg';
import agent02 from '../../../../assets/svg/loading-agents-02.svg';
import agent03 from '../../../../assets/svg/loading-agents-03.svg';
import agent04 from '../../../../assets/svg/loading-agents-04.svg';
import agent05 from '../../../../assets/svg/loading-agents-05.svg';
import agent06 from '../../../../assets/svg/loading-agents-06.svg';
import agent07 from '../../../../assets/svg/loading-agents-07.svg';
import agent08 from '../../../../assets/svg/loading-agents-08.svg';

const AGENT_SVGS = [agent01, agent02, agent03, agent04, agent05, agent06, agent07, agent08];

function useAgentFrame(isActive: boolean, offset = 0, intervalMs = 160) {
  const [frame, setFrame] = React.useState(offset % AGENT_SVGS.length);

  React.useEffect(() => {
    if (!isActive) {
      setFrame(0);
      return;
    }
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % AGENT_SVGS.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isActive, intervalMs, offset]);

  return frame;
}

type MultiAgentBlockProps = {
  parentAgentName: string;
  status: 'running' | 'completed' | 'idle';
  subAgents: SubAgentCall[];
  isExpanded: boolean;
  onToggleExpanded?: () => void;
};

export function MultiAgentBlock({ 
  parentAgentName, 
  status, 
  subAgents, 
  isExpanded, 
  onToggleExpanded 
}: MultiAgentBlockProps) {
  const hasChildren = subAgents.length > 0;

  return (
    <div className={`multi-agent-block ${isExpanded ? 'expanded' : 'collapsed'}`}>
      {/* Parent Agent Head utilizing unified system summary styling */}
      <div 
        className={`terminal-block-summary multi-agent-parent-summary ${isExpanded ? 'active-header' : ''}`}
        onClick={() => hasChildren && onToggleExpanded?.()}
        style={{ cursor: hasChildren ? 'pointer' : 'default' }}
      >
        <div className="agent-avatar-wrapper" style={{ marginRight: '4px' }}>
          <div className={`agent-avatar parent ${status === 'running' ? 'active' : ''}`}>
            <img src={octomusSvg} width={16} height={14} alt="Octomus" style={{ objectFit: 'contain' }} />
          </div>
        </div>
        
        <span className="terminal-summary-command agent-name">
          {parentAgentName}
        </span>

        <div className="terminal-summary-chevron" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button 
            className="agent-action-btn parent-action" 
            title="Stop All Agents"
            onClick={(e) => { e.stopPropagation(); /* Add Stop overarching logic */ }}
          >
            <Square size={13} fill="currentColor" />
          </button>

          <button 
            className="agent-action-btn parent-action" 
            title="View Plan"
            onClick={(e) => { e.stopPropagation(); /* Add Compass plan logic */ }}
          >
            <Compass size={14} />
          </button>
          
          {hasChildren && (
            <ChevronDown 
              size={16} 
              className={`card-chevron parent-chevron ${isExpanded ? 'active' : ''}`} 
            />
          )}
        </div>
      </div>

      {/* Conditionally show children tree */}
      {isExpanded && hasChildren && (
        <div className="sub-agents-list">
          {subAgents.map((subAgent, idx) => (
            <SubAgentItem key={subAgent.id} subAgent={subAgent} index={idx} />
          ))}
        </div>
      )}
    </div>
  );
}

function SubAgentItem({ subAgent, index }: { subAgent: SubAgentCall; index: number }) {
  // Drives dynamic frames slowly when running
  const currentFrame = useAgentFrame(subAgent.status === 'running', index, 160);
  const agentSvgUrl = AGENT_SVGS[currentFrame];

  const renderAvatarIcon = () => {
    switch (subAgent.status) {
      case 'running':
        return (
          <div 
            className="custom-agent-svg-mask"
            style={{
              WebkitMaskImage: `url(${agentSvgUrl})`,
              maskImage: `url(${agentSvgUrl})`,
            }}
          />
        );
      case 'completed':
        return <Check size={12} className="state-icon-color" style={{ color: '#30b86f' }} />;
      case 'failed':
        return <X size={12} className="state-icon-color" style={{ color: '#f87171' }} />;
      default: // idle
        return <Pause size={10} className="state-icon-color" style={{ opacity: 0.5, color: 'white' }} fill="currentColor" />;
    }
  };

  return (
    <div className={`sub-agent-row ${subAgent.status}`}>
      {/* AVATAR FLOATING OUTSIDE THE CARD */}
      <div className="sub-agent-avatar-slot">
        <div className="agent-avatar-wrapper">
          <div className={`agent-avatar sub ${subAgent.status}`}>
            {renderAvatarIcon()}
          </div>
        </div>
      </div>

      {/* THE CARD ITSELF - PURELY STATIC NOW */}
      <div className="sub-agent-card card-style static">
        <div className="agent-card-header" style={{ cursor: 'default' }}>
          <div className="agent-header-content">
            <div className="agent-header-top">
              <span className="agent-name">{subAgent.name}</span>
              <div className="header-meta-right">
                {/* INLINE TOOLBAR ACTIONS */}
                <div className="agent-card-toolbar">
                  <button 
                    className="agent-action-btn" 
                    title="Stop Agent"
                    onClick={(e) => { e.stopPropagation(); /* Add Stop logic */ }}
                  >
                    <Square size={11} fill="currentColor" />
                  </button>
                  <button 
                    className="agent-action-btn" 
                    title="View Diff"
                    onClick={(e) => { e.stopPropagation(); /* Add Diff logic */ }}
                  >
                    <GitCompare size={11} />
                  </button>
                  <button 
                    className="agent-action-btn" 
                    title="Edit"
                    onClick={(e) => { e.stopPropagation(); /* Add Edit logic */ }}
                  >
                    <Pencil size={11} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
