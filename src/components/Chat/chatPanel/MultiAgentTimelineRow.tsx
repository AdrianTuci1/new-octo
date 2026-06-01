import { MultiAgentBlock } from '../blocks/MultiAgentBlock';
import type { TimelineItem } from '../utils/timeline';

type MultiAgentTimelineRowProps = {
  item: Extract<TimelineItem, { kind: 'multi-agent-block' }>;
};

export function MultiAgentTimelineRow({ item }: MultiAgentTimelineRowProps) {
  return (
    <div className="agent-block-row-standalone">
      <MultiAgentBlock
        agentName={item.block.agentName}
        status={item.block.status}
        taskSummary={item.block.taskSummary}
        colorScheme={item.block.colorScheme}
      />
    </div>
  );
}
