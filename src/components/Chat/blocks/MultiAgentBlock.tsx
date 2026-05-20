import React from 'react';
import { Square, CheckCircle2, XCircle } from 'lucide-react';
import './MultiAgentBlock.css';

// Import dynamic assets for the animated agent indicator
import agent01 from '../../../../assets/svg/loading-agents-01.svg';
import agent02 from '../../../../assets/svg/loading-agents-02.svg';
import agent03 from '../../../../assets/svg/loading-agents-03.svg';
import agent04 from '../../../../assets/svg/loading-agents-04.svg';
import agent05 from '../../../../assets/svg/loading-agents-05.svg';
import agent06 from '../../../../assets/svg/loading-agents-06.svg';
import agent07 from '../../../../assets/svg/loading-agents-07.svg';
import agent08 from '../../../../assets/svg/loading-agents-08.svg';

const AGENT_SVGS = [agent01, agent02, agent03, agent04, agent05, agent06, agent07, agent08];

function useAgentFrame(isActive: boolean, intervalMs = 160) {
  const [frame, setFrame] = React.useState(0);

  React.useEffect(() => {
    if (!isActive) {
      setFrame(0);
      return;
    }
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % AGENT_SVGS.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isActive, intervalMs]);

  return frame;
}

type ColorTheme = {
  border: string;
  borderHover: string;
  iconBg: string;
  iconBorder: string;
  accent: string;
  tagBg: string;
};

const COLOR_SCHEMES: Record<string, ColorTheme> = {
  indigo: {
    border: 'rgba(129, 140, 248, 0.25)',
    borderHover: 'rgba(129, 140, 248, 0.48)',
    iconBg: 'rgba(129, 140, 248, 0.16)',
    iconBorder: 'rgba(129, 140, 248, 0.3)',
    accent: '#818cf8',
    tagBg: 'rgba(129, 140, 248, 0.1)'
  },
  pink: {
    border: 'rgba(244, 114, 182, 0.25)',
    borderHover: 'rgba(244, 114, 182, 0.48)',
    iconBg: 'rgba(244, 114, 182, 0.16)',
    iconBorder: 'rgba(244, 114, 182, 0.3)',
    accent: '#f472b6',
    tagBg: 'rgba(244, 114, 182, 0.1)'
  },
  teal: {
    border: 'rgba(45, 212, 191, 0.25)',
    borderHover: 'rgba(45, 212, 191, 0.48)',
    iconBg: 'rgba(45, 212, 191, 0.16)',
    iconBorder: 'rgba(45, 212, 191, 0.3)',
    accent: '#2dd4bf',
    tagBg: 'rgba(45, 212, 191, 0.1)'
  },
  amber: {
    border: 'rgba(251, 191, 36, 0.25)',
    borderHover: 'rgba(251, 191, 36, 0.48)',
    iconBg: 'rgba(251, 191, 36, 0.16)',
    iconBorder: 'rgba(251, 191, 36, 0.3)',
    accent: '#fbbf24',
    tagBg: 'rgba(251, 191, 36, 0.1)'
  },
  sky: {
    border: 'rgba(56, 189, 248, 0.25)',
    borderHover: 'rgba(56, 189, 248, 0.48)',
    iconBg: 'rgba(56, 189, 248, 0.16)',
    iconBorder: 'rgba(56, 189, 248, 0.3)',
    accent: '#38bdf8',
    tagBg: 'rgba(56, 189, 248, 0.1)'
  },
  green: {
    border: 'rgba(48, 184, 111, 0.25)',
    borderHover: 'rgba(48, 184, 111, 0.48)',
    iconBg: 'rgba(48, 184, 111, 0.16)',
    iconBorder: 'rgba(48, 184, 111, 0.3)',
    accent: '#30b86f',
    tagBg: 'rgba(48, 184, 111, 0.1)'
  }
};

type MultiAgentBlockProps = {
  agentName: string;
  taskSummary: string;
  status: 'running' | 'completed' | 'idle';
  colorScheme?: string;
};

export function MultiAgentBlock({ agentName, taskSummary, status, colorScheme = 'green' }: MultiAgentBlockProps) {
  const currentFrame = useAgentFrame(status === 'running', 160);
  const agentSvgUrl = AGENT_SVGS[currentFrame];

  // Fallback if dynamic color scheme is not defined
  const theme = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.green;

  // Build custom property style bag
  const dynamicStyle = {
    '--agent-border': theme.border,
    '--agent-border-hover': theme.borderHover,
    '--agent-icon-bg': theme.iconBg,
    '--agent-icon-border': theme.iconBorder,
    '--agent-accent-color': theme.accent,
    '--agent-tag-bg': theme.tagBg,
  } as React.CSSProperties;

  return (
    <div
      className={`agent-running-card ${status}`}
      style={dynamicStyle}
    >
      <div className="agent-square-icon-wrapper">
        {status === 'running' ? (
          <div
            className="custom-agent-svg-mask"
            style={{
              WebkitMaskImage: `url(${agentSvgUrl})`,
              maskImage: `url(${agentSvgUrl})`,
            }}
          />
        ) : status === 'completed' ? (
          <CheckCircle2 size={14} style={{ color: 'var(--agent-accent-color)' }} />
        ) : (
          <XCircle size={14} style={{ color: '#f87171' }} />
        )}
      </div>

      <div className="agent-running-info">
        <div className="agent-running-header">
          <span className="agent-running-name">{agentName}</span>
        </div>
        <span className="agent-running-summary">{taskSummary}</span>
      </div>

      <div className="agent-running-card-actions">
        {status === 'running' && (
          <button className="agent-action-btn" title="Stop Agent" onClick={(e) => e.stopPropagation()}>
            <Square size={11} fill="currentColor" />
          </button>
        )}
      </div>
    </div>
  );
}
