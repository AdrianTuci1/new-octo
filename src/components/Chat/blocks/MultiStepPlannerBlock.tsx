import { CheckCircle2, Circle } from 'lucide-react';
import './MultiStepPlannerBlock.css';

export type MultiStepPlannerBlockProps = {
  steps?: { id: string; label: string; completed: boolean }[];
};

export function MultiStepPlannerBlock({ 
  steps = [
    { id: '1', label: 'Analyze current repository structure', completed: true },
    { id: '2', label: 'Search for multi-provider patterns', completed: true },
    { id: '3', label: 'Draft implementation plan', completed: false },
    { id: '4', label: 'Apply code modifications', completed: false }
  ] 
}: MultiStepPlannerBlockProps) {
  return (
    <div className="multi-step-planner-block">
      <div className="multi-step-planner-header">
        Execution Plan
      </div>
      {steps.map(step => (
        <div key={step.id} className="multi-step-planner-row">
          <div className={`multi-step-planner-icon ${step.completed ? 'completed' : 'pending'}`}>
            {step.completed ? <CheckCircle2 size={15} /> : <Circle size={15} />}
          </div>
          <div className={`multi-step-planner-text ${step.completed ? 'completed' : 'pending'}`}>
            {step.label}
          </div>
        </div>
      ))}
    </div>
  );
}
