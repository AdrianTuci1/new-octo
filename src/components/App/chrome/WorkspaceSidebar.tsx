import './WorkspaceSidebar.css';
import { 
  MessageSquare, 
  Layers, 
  Search, 
  History, 
  X, 
  Plus, 
  ChevronDown, 
  Circle, 
  CheckCircle2 
} from 'lucide-react';

interface WorkspaceSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WorkspaceSidebar({ isOpen, onClose }: WorkspaceSidebarProps) {
  if (!isOpen) return null;

  return (
    <div className="workspace-sidebar">
      <div className="workspace-sidebar-header">
        <div className="workspace-sidebar-nav">
          <button className="workspace-sidebar-nav-btn active">
            <MessageSquare size={18} strokeWidth={1.8} />
          </button>
          <button className="workspace-sidebar-nav-btn">
            <Layers size={18} strokeWidth={1.8} />
          </button>
          <button className="workspace-sidebar-nav-btn">
            <Search size={18} strokeWidth={1.8} />
          </button>
          <button className="workspace-sidebar-nav-btn">
            <History size={18} strokeWidth={1.8} />
          </button>
        </div>
        <button className="workspace-sidebar-close" onClick={onClose}>
          <X size={18} strokeWidth={1.8} />
        </button>
      </div>

      <div className="workspace-sidebar-search">
        <div className="workspace-sidebar-search-container">
          <input type="text" placeholder="Search" className="workspace-sidebar-search-input" />
        </div>
      </div>

      <div className="workspace-sidebar-content">
        <div className="workspace-sidebar-group">
          <div className="workspace-sidebar-group-header">
            <ChevronDown size={14} className="group-chevron" />
            <span>ACTIVE</span>
          </div>
          
          <div className="workspace-sidebar-item active">
            <div className="item-icon-container">
              <Circle size={14} fill="#c084fc" color="#c084fc" />
            </div>
            <div className="item-details">
              <span className="item-title">Untitled conversation</span>
              <div className="item-meta">
                <span className="item-prefix">~</span>
                <span className="item-time">just now</span>
              </div>
            </div>
          </div>

          <button className="workspace-sidebar-new-btn">
            <Plus size={16} />
            <span>New conversation</span>
          </button>
        </div>

        <div className="workspace-sidebar-group">
          <div className="workspace-sidebar-group-header">
            <ChevronDown size={14} className="group-chevron" />
            <span>PAST</span>
          </div>

          <div className="workspace-sidebar-item">
            <div className="item-icon-container">
              <CheckCircle2 size={14} color="#5ef1a1" />
            </div>
            <div className="item-details">
              <span className="item-title">Initial Developer Assistance Offer</span>
              <div className="item-meta">
                <span className="item-prefix">~</span>
                <span className="item-time">5 hours ago</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
