import { AlertCircle, CheckCircle2, Circle, LoaderCircle } from 'lucide-react';
import './MultiStepPlannerBlock.css';

export type MultiStepPlannerBlockProps = {
  title?: string;
  summary?: string;
  steps?: { id: string; label: string; status: 'pending' | 'inProgress' | 'completed' | 'failed' }[];
  workstreams?: { id: string; title: string; status: 'pending' | 'inProgress' | 'completed' | 'failed'; stepIds: string[] }[];
};

export function MultiStepPlannerBlock({ 
  title = 'Execution Plan',
  summary,
  steps = [
    { id: '1', label: 'Analyze current repository structure', status: 'completed' },
    { id: '2', label: 'Search for multi-provider patterns', status: 'completed' },
    { id: '3', label: 'Draft implementation plan', status: 'inProgress' },
    { id: '4', label: 'Apply code modifications', status: 'pending' }
  ],
  workstreams = []
}: MultiStepPlannerBlockProps) {
  return (
    <div className="multi-step-planner-block">
      <div className="multi-step-planner-header">
        {title}
      </div>
      {summary && (
        <div className="multi-step-planner-summary">
          {summary}
        </div>
      )}
      {steps.map(step => (
        <div key={step.id} className="multi-step-planner-row">
          <div className={`multi-step-planner-icon ${step.status}`}>
            <StatusIcon status={step.status} />
          </div>
          <div className={`multi-step-planner-text ${step.status}`}>
            {step.label}
          </div>
        </div>
      ))}
      {workstreams.length > 0 && (
        <div className="multi-step-planner-workstreams">
          <div className="multi-step-planner-workstreams-label">Workstreams</div>
          {workstreams.map((workstream) => (
            <div key={workstream.id} className="multi-step-planner-workstream-row">
              <div className={`multi-step-planner-icon ${workstream.status}`}>
                <StatusIcon status={workstream.status} />
              </div>
              <div className="multi-step-planner-workstream-content">
                <div className={`multi-step-planner-text ${workstream.status}`}>{workstream.title}</div>
                {workstream.stepIds.length > 0 && (
                  <div className="multi-step-planner-workstream-meta">
                    {workstream.stepIds.join(', ')}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: 'pending' | 'inProgress' | 'completed' | 'failed' }) {
  if (status === 'completed') {
    return <CheckCircle2 size={15} />;
  }

  if (status === 'inProgress') {
    return <LoaderCircle size={15} className="multi-step-planner-spinner" />;
  }

  if (status === 'failed') {
    return <AlertCircle size={15} />;
  }

  return <Circle size={15} />;
}
