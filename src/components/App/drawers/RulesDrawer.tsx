import { useState } from 'react';
import { 
  X, 
  BookOpen, 
  ArrowLeft, 
  Check, 
  Trash2, 
  Plus 
} from 'lucide-react';
import { useMemoryStore, useUIStore } from '../../../stores';
import { DrawerHeader } from './DrawerHeader';
import { buildAgentSettingsValues, normalizeAgentSettings, type AgentRule } from '../settings/agentSettings';
import './RulesDrawer.css';

export function RulesDrawer() {
  const setIsRulesDrawerOpen = useUIStore((state) => state.setIsRulesDrawerOpen);
  const settings = useMemoryStore((state) => state.settings);
  const saveSettings = useMemoryStore((state) => state.saveSettings);
  const agentSettings = normalizeAgentSettings(settings?.values);
  const rules = agentSettings.knowledge.rules;

  // View States
  const [activeTab, setActiveTab] = useState<'global' | 'project'>('global');
  const [isAddingRule, setIsAddingRule] = useState(false);
  
  // Form State
  const [ruleName, setRuleName] = useState('');
  const [ruleContent, setRuleContent] = useState('');

  const saveRules = (nextRules: AgentRule[]) => {
    void saveSettings(buildAgentSettingsValues({
      ...agentSettings,
      knowledge: {
        ...agentSettings.knowledge,
        rules: nextRules
      }
    }), true);
  };

  const handleSaveRule = () => {
    if (!ruleName.trim() || !ruleContent.trim()) return;

    const newRule: AgentRule = {
      id: Date.now().toString(),
      name: ruleName.trim(),
      content: ruleContent.trim(),
      category: activeTab
    };

    saveRules([newRule, ...rules]);
    setRuleName('');
    setRuleContent('');
    setIsAddingRule(false);
  };

  const handleDeleteRule = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    saveRules(rules.filter(rule => rule.id !== id));
  };

  const filteredRules = rules.filter(rule => rule.category === activeTab);

  return (
    <div className="rules-drawer">
      {/* HEADER */}
      <DrawerHeader
        title="Rules"
        action={(
          <button
            className="drawer-header-action-button"
            onClick={() => setIsRulesDrawerOpen(false)}
            type="button"
            aria-label="Close rules drawer"
          >
            <X size={18} />
          </button>
        )}
      />

      {/* CONTENT */}
      {!isAddingRule ? (
        /* LIST VIEW (PICTURE 1) */
        <div className="rules-drawer-content">
          <div className="rules-heading-container">
            <BookOpen size={20} className="rules-heading-icon" />
            <h2 className="rules-drawer-title">Rules</h2>
          </div>
          
          <p className="rules-drawer-description">
            Rules enhance the agent by providing structured guidelines that help maintain consistency, 
            enforce best practices, and adapt to specific workflows, including codebases or broader tasks.
          </p>

          {/* TAB SELECTOR */}
          <div className="rules-tab-selector">
            <button 
              className={`rules-tab-btn ${activeTab === 'global' ? 'active' : ''}`}
              type="button"
              onClick={() => setActiveTab('global')}
            >
              Global
            </button>
            <button 
              className={`rules-tab-btn ${activeTab === 'project' ? 'active' : ''}`}
              type="button"
              onClick={() => setActiveTab('project')}
            >
              Project based
            </button>
          </div>

          {/* LIST BOX OR EMPTY STATE */}
          <div className="rules-main-container">
            {filteredRules.length === 0 ? (
              <div className="rules-empty-state">
                <p className="empty-text">Once you add a rule, it will be shown here.</p>
                <button 
                  className="btn-add-rule-action"
                  type="button"
                  onClick={() => setIsAddingRule(true)}
                >
                  <Plus size={14} className="mr-4" />
                  Add
                </button>
              </div>
            ) : (
              <div className="rules-list">
                {filteredRules.map((rule) => (
                  <div key={rule.id} className="rules-card-item">
                    <div className="rules-card-item-header">
                      <h4 className="rules-card-item-title">{rule.name}</h4>
                      <button 
                        className="rules-card-delete-btn"
                        type="button"
                        onClick={(e) => handleDeleteRule(rule.id, e)}
                        aria-label="Delete rule"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <p className="rules-card-item-body">{rule.content}</p>
                  </div>
                ))}
                
                <button 
                  className="btn-add-rule-floating"
                  type="button"
                  onClick={() => setIsAddingRule(true)}
                >
                  <Plus size={14} style={{ marginRight: '6px' }} />
                  Add Rule
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ADD RULE FORM VIEW (PICTURE 2) */
        <div className="rules-drawer-content">
          <div className="rules-form-header">
            <button 
              className="rules-back-btn"
              type="button"
              onClick={() => {
                setRuleName('');
                setRuleContent('');
                setIsAddingRule(false);
              }}
              aria-label="Back to rules list"
            >
              <ArrowLeft size={16} />
            </button>
            <h2 className="rules-drawer-title ml-8">Add Rule</h2>
            
            <button 
              className={`rules-save-btn ${(!ruleName.trim() || !ruleContent.trim()) ? 'disabled' : ''}`}
              type="button"
              onClick={handleSaveRule}
              disabled={!ruleName.trim() || !ruleContent.trim()}
            >
              <Check size={14} className="mr-4" />
              Save
            </button>
          </div>

          {/* FORM */}
          <div className="rules-form-body">
            <div className="rules-form-group">
              <label className="rules-field-label">Name</label>
              <input
                type="text"
                placeholder="e.g. Rust rules"
                className="rules-text-input"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="rules-form-group mt-20">
              <label className="rules-field-label">Rule</label>
              <textarea
                placeholder="e.g. Never use unwrap in Rust"
                className="rules-textarea-input"
                value={ruleContent}
                onChange={(e) => setRuleContent(e.target.value)}
                rows={10}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
