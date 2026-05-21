export * from './TerminalBlockCard';
export * from './WebSearchBlock';
export * from './ThinkingBlock';
export * from './WorkspaceExplorationBlock';
export { ImplementationPlanBlock } from './ImplementationPlanBlock';
export { CodeDisplayBlock } from './CodeDisplayBlock';
export { MultiAgentBlock } from './MultiAgentBlock';

export function CodeDiffBlock() {
  return <div className="chat-block code-diff-block">Code Diff Block Placeholder</div>;
}

export function MultiBlock() {
  return <div className="chat-block multi-block">Multi Block Placeholder</div>;
}

export function NewConversationBlock() {
  return (
    <div className="chat-block new-conversation-block-marker">
      <hr className="new-conversation-divider" />
      <span className="new-conversation-text">New conversation started</span>
      <hr className="new-conversation-divider" />
    </div>
  );
}
