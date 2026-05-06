export type KeyboardShortcutKey = {
  label: string;
  accent?: boolean;
};

export type KeyboardShortcutBinding = {
  keys: KeyboardShortcutKey[];
};

export type KeyboardShortcutRow = {
  command: string;
  bindings: KeyboardShortcutBinding[];
};

export const keyboardShortcutRows: KeyboardShortcutRow[] = [
  // First Batch
  {
    command: 'Attach Selected Block as Agent Context',
    bindings: [
      {
        keys: [{ label: '^', accent: true }, { label: '⇧', accent: true }, { label: 'Space', accent: true }]
      }
    ]
  },
  {
    command: 'Attach Selected Text as Agent Context',
    bindings: [
      {
        keys: [{ label: '^', accent: true }, { label: '⇧', accent: true }, { label: 'Space', accent: true }]
      }
    ]
  },
  {
    command: 'Backward Tabulation Within an Executing Command',
    bindings: [
      {
        keys: [{ label: '⇧' }, { label: 'Tab' }]
      }
    ]
  },
  {
    command: 'Bookmark Selected Block',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: 'B', accent: true }]
      }
    ]
  },
  {
    command: 'Cancel Active Process',
    bindings: [
      {
        keys: [{ label: '^', accent: true }, { label: 'C', accent: true }]
      }
    ]
  },
  {
    command: 'Check for Updates',
    bindings: []
  },
  {
    command: 'Clear Blocks',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: 'K', accent: true }]
      }
    ]
  },
  {
    command: 'Clear Command Editor',
    bindings: [
      {
        keys: [{ label: '^', accent: true }, { label: 'C', accent: true }]
      }
    ]
  },
  {
    command: 'Clear Screen',
    bindings: [
      {
        keys: [{ label: '^' }, { label: 'L' }]
      }
    ]
  },
  {
    command: 'Clear Selected Lines',
    bindings: [
      {
        keys: [{ label: '⇧' }, { label: '⌘' }, { label: 'K' }]
      }
    ]
  },
  {
    command: 'Clear and Reset AI Context Menu Query',
    bindings: [
      {
        keys: [{ label: '⇧' }, { label: '⌘' }, { label: '⌫' }]
      }
    ]
  },
  {
    command: 'Close',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: 'W', accent: true }]
      }
    ]
  },
  {
    command: 'Close All Tabs',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: 'R', accent: true }]
      }
    ]
  },
  {
    command: 'Close Current Session',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: 'W', accent: true }]
      }
    ]
  },
  {
    command: 'Close Focused Panel',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: 'W', accent: true }]
      }
    ]
  },
  {
    command: 'Close Other Tabs',
    bindings: []
  },
  {
    command: 'Close Saved Tabs',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: 'R', accent: true }]
      }
    ]
  },
  {
    command: 'Close Tabs to the Right',
    bindings: []
  },
  {
    command: 'Close Window',
    bindings: [
      {
        keys: [{ label: '⇧' }, { label: '⌘' }, { label: 'W' }]
      }
    ]
  },
  {
    command: 'Close the Current Tab',
    bindings: []
  },
  {
    command: 'Command Search',
    bindings: [
      {
        keys: [{ label: '^' }, { label: 'R' }]
      }
    ]
  },
  {
    command: 'Copy',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: 'C', accent: true }]
      }
    ]
  },
  {
    command: 'Copy Command',
    bindings: [
      {
        keys: [{ label: '⇧', accent: true }, { label: '⌘', accent: true }, { label: 'C', accent: true }]
      }
    ]
  },
  {
    command: 'Copy Command Output',
    bindings: [
      {
        keys: [{ label: '⇧' }, { label: '⌥' }, { label: '⌘' }, { label: 'C' }]
      }
    ]
  },
  {
    command: 'Copy Command and Output',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: 'C', accent: true }]
      }
    ]
  },
  {
    command: 'Copy Git Branch',
    bindings: []
  },
  {
    command: 'Copy and Clear Selected Lines',
    bindings: [
      {
        keys: [{ label: '^' }, { label: 'U' }]
      }
    ]
  },
  {
    command: 'Create New Personal Environment Variables',
    bindings: []
  },
  {
    command: 'Create New Project',
    bindings: [
      {
        keys: [{ label: '⇧', accent: true }, { label: '⌘', accent: true }, { label: 'N', accent: true }]
      }
    ]
  },
  {
    command: 'Create New Tab',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: 'T', accent: true }]
      }
    ]
  },
  {
    command: 'Create New Team Environment Variables',
    bindings: []
  },
  {
    command: 'Create a New Personal Folder',
    bindings: []
  },
  {
    command: 'Create a New Personal Notebook',
    bindings: []
  },
  {
    command: 'Create a New Personal Prompt',
    bindings: []
  },
  {
    command: 'Create a New Personal Workflow',
    bindings: []
  },
  {
    command: 'Create a New Team Folder',
    bindings: []
  },
  {
    command: 'Create a New Team Notebook',
    bindings: []
  },
  {
    command: 'Create a New Team Prompt',
    bindings: []
  },
  {
    command: 'Create a New Team Workflow',
    bindings: []
  },
  {
    command: 'Create or Edit Link',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: 'K', accent: true }]
      }
    ]
  },
  {
    command: 'Cursor at Buffer End',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: '↓', accent: true }]
      }
    ]
  },
  {
    command: 'Cursor at Buffer Start',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: '↑', accent: true }]
      }
    ]
  },
  {
    command: 'Cut All Left',
    bindings: []
  },
  {
    command: 'Cut All Right',
    bindings: [
      {
        keys: [{ label: '^' }, { label: 'K' }]
      }
    ]
  },
  {
    command: 'Cut Word Left',
    bindings: [
      {
        keys: [{ label: '^' }, { label: 'W' }]
      }
    ]
  },
  {
    command: 'Cut Word Right',
    bindings: [
      {
        keys: [{ label: '⌥' }, { label: 'D' }]
      }
    ]
  },
  {
    command: 'De-Select Shell Commands',
    bindings: [
      {
        keys: [{ label: 'ESC', accent: true }]
      }
    ]
  },
  {
    command: 'Decrease Font Size',
    bindings: [
      {
        keys: [{ label: '^' }, { label: '⇧' }, { label: '<' }]
      }
    ]
  },

  // Second Batch
  {
    command: 'Decrease Notebook Font Size',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: '-', accent: true }]
      }
    ]
  },
  {
    command: 'Decrease Zoom Level',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: '-', accent: true }]
      }
    ]
  },
  {
    command: 'Delete',
    bindings: [
      {
        keys: [{ label: '^' }, { label: 'D' }]
      }
    ]
  },
  {
    command: 'Delete All Left',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: '⌫', accent: true }]
      }
    ]
  },
  {
    command: 'Delete All Right',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: 'Delete', accent: true }]
      }
    ]
  },
  {
    command: 'Delete Word Left',
    bindings: [
      {
        keys: [{ label: '⌥', accent: true }, { label: '⌫', accent: true }]
      }
    ]
  },
  {
    command: 'Delete Word Left Within an Executing Command',
    bindings: [
      {
        keys: [{ label: '⌥', accent: true }, { label: '⌫', accent: true }]
      }
    ]
  },
  {
    command: 'Delete Word Right',
    bindings: [
      {
        keys: [{ label: '⌥' }, { label: 'Delete' }]
      }
    ]
  },
  {
    command: 'Delete to Line End Within an Executing Command',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: 'Delete', accent: true }]
      }
    ]
  },
  {
    command: 'Delete to Line Start Within an Executing Command',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: '⌫', accent: true }]
      }
    ]
  },
  {
    command: 'Edit Code Diff',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: 'E', accent: true }]
      }
    ]
  },
  {
    command: 'Edit Prompt',
    bindings: []
  },
  {
    command: 'Edit Requested Command',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: 'E', accent: true }]
      }
    ]
  },
  {
    command: 'End',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: '→', accent: true }]
      }
    ]
  },
  {
    command: 'Exit Vim Insert Mode',
    bindings: [
      {
        keys: [{ label: '^' }, { label: '[' }]
      }
    ]
  },
  {
    command: 'Expand Selected Blocks Above',
    bindings: [
      {
        keys: [{ label: '⇧' }, { label: '↑' }]
      }
    ]
  },
  {
    command: 'Expand Selected Blocks Below',
    bindings: [
      {
        keys: [{ label: '⇧' }, { label: '↓' }]
      }
    ]
  },
  {
    command: 'Export All Warp Drive Objects',
    bindings: []
  },
  {
    command: 'Find Within Selected Block',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: 'F', accent: true }]
      }
    ]
  },
  {
    command: 'Find in Code Editor',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: 'F', accent: true }]
      }
    ]
  },
  {
    command: 'Find in Notebook',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: 'F', accent: true }]
      }
    ]
  },
  {
    command: 'Find in Terminal',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: 'F', accent: true }]
      }
    ]
  },
  {
    command: 'Find the Next Occurrence of Your Search Query',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: 'G', accent: true }]
      }
    ]
  },
  {
    command: 'Find the Previous Occurrence of Your Search Query',
    bindings: [
      {
        keys: [{ label: '⇧', accent: true }, { label: '⌘', accent: true }, { label: 'G', accent: true }]
      }
    ]
  },
  {
    command: 'Focus Next Match',
    bindings: []
  },
  {
    command: 'Focus Previous Match',
    bindings: []
  },
  {
    command: 'Focus Terminal Input',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: 'L', accent: true }]
      }
    ]
  },
  {
    command: 'Focus Terminal Input From File',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: 'L', accent: true }]
      }
    ]
  },
  {
    command: 'Focus Terminal Input From Notebook',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: 'L', accent: true }]
      }
    ]
  },
  {
    command: 'Focus Terminal Input From Warp AI',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: 'L', accent: true }]
      }
    ]
  },
  {
    command: 'Fold',
    bindings: [
      {
        keys: [{ label: '⌥' }, { label: '⌘' }, { label: '[' }]
      }
    ]
  },
  {
    command: 'Fold Selected Ranges',
    bindings: [
      {
        keys: [{ label: '⌥' }, { label: '⌘' }, { label: 'F' }]
      }
    ]
  },
  {
    command: 'Go to Line',
    bindings: [
      {
        keys: [{ label: '^', accent: true }, { label: 'G', accent: true }]
      }
    ]
  },
  {
    command: 'History Search',
    bindings: []
  },
  {
    command: 'Home',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: '←', accent: true }]
      }
    ]
  },
  {
    command: 'Import External Settings',
    bindings: []
  },
  {
    command: 'Import To Personal Drive',
    bindings: []
  },
  {
    command: 'Import To Team Drive',
    bindings: []
  },
  {
    command: 'Increase Font Size',
    bindings: [
      {
        keys: [{ label: '^' }, { label: '⇧' }, { label: '>' }]
      }
    ]
  },
  {
    command: 'Increase Notebook Font Size',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: '=', accent: true }]
      }
    ]
  },
  {
    command: 'Increase Zoom Level',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: '=', accent: true }]
      }
    ]
  },
  {
    command: 'Initiate Project for Warp',
    bindings: []
  },
  {
    command: 'Insert Command Correction',
    bindings: []
  },
  {
    command: 'Insert Last Word of Previous Command',
    bindings: [
      {
        keys: [{ label: 'Meta' }, { label: '.' }]
      }
    ]
  },
  {
    command: 'Insert Newline',
    bindings: [
      {
        keys: [{ label: '^' }, { label: 'J' }]
      }
    ]
  },
  {
    command: 'Insert Non-Expanding Space',
    bindings: [
      {
        keys: [{ label: '⌥' }, { label: 'Space' }]
      }
    ]
  },
  {
    command: 'Inspect Command',
    bindings: []
  },
  {
    command: 'Install Oz CLI Command',
    bindings: []
  },
  {
    command: 'Install Update and Relaunch',
    bindings: []
  },
  {
    command: 'Invite People...',
    bindings: []
  },

  // Third Batch
  {
    command: 'Join Our Slack Community (Opens External Link)',
    bindings: []
  },
  {
    command: 'Jump to Latest Agent Task',
    bindings: [
      {
        keys: [{ label: '⇧', accent: true }, { label: '⌘', accent: true }, { label: 'G', accent: true }]
      }
    ]
  },
  {
    command: 'Launch Configuration Palette',
    bindings: [
      {
        keys: [{ label: '^' }, { label: '⌘' }, { label: 'L' }]
      }
    ]
  },
  {
    command: 'Left Panel: Agent Conversations',
    bindings: [
      {
        keys: [{ label: '^' }, { label: '1' }]
      }
    ]
  },
  {
    command: 'Left Panel: Global Search',
    bindings: [
      {
        keys: [{ label: '^' }, { label: '3' }]
      }
    ]
  },
  {
    command: 'Left Panel: Project Explorer',
    bindings: [
      {
        keys: [{ label: '^' }, { label: '2' }]
      }
    ]
  },
  {
    command: 'Left Panel: Warp Drive',
    bindings: [
      {
        keys: [{ label: '^' }, { label: '4' }]
      }
    ]
  },
  {
    command: 'Log Out',
    bindings: []
  },
  {
    command: 'Move Backward One Subword',
    bindings: [
      {
        keys: [{ label: '^' }, { label: '⌥' }, { label: '←' }]
      }
    ]
  },
  {
    command: 'Move Backward One Word',
    bindings: [
      {
        keys: [{ label: '⌥', accent: true }, { label: '←', accent: true }]
      }
    ]
  },
  {
    command: 'Move Cursor Down',
    bindings: [
      {
        keys: [{ label: '^' }, { label: 'N' }]
      }
    ]
  },
  {
    command: 'Move Cursor End Within an Executing Command',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: '→', accent: true }]
      }
    ]
  },
  {
    command: 'Move Cursor Home Within an Executing Command',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: '←', accent: true }]
      }
    ]
  },
  {
    command: 'Move Cursor Left',
    bindings: [
      {
        keys: [{ label: '^' }, { label: 'B' }]
      }
    ]
  },
  {
    command: 'Move Cursor One Word to the Left Within an Executing Command',
    bindings: [
      {
        keys: [{ label: '⌥', accent: true }, { label: '←', accent: true }]
      }
    ]
  },
  {
    command: 'Move Cursor One Word to the Right Within an Executing Command',
    bindings: [
      {
        keys: [{ label: '⌥', accent: true }, { label: '→', accent: true }]
      }
    ]
  },
  {
    command: 'Move Cursor Right',
    bindings: [
      {
        keys: [{ label: '^' }, { label: 'F' }]
      }
    ]
  },
  {
    command: 'Move Cursor Up',
    bindings: [
      {
        keys: [{ label: '^' }, { label: 'P' }]
      }
    ]
  },
  {
    command: 'Move Cursor to the Bottom',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: '↓', accent: true }]
      }
    ]
  },
  {
    command: 'Move Cursor to the Top',
    bindings: [
      {
        keys: [{ label: '⌘', accent: true }, { label: '↑', accent: true }]
      }
    ]
  },
  {
    command: 'Move Forward One Subword',
    bindings: [
      {
        keys: [{ label: '^' }, { label: '⌥' }, { label: '→' }]
      }
    ]
  },
  {
    command: 'Move Forward One Word',
    bindings: [
      {
        keys: [{ label: '⌥', accent: true }, { label: '→', accent: true }]
      }
    ]
  },
  {
    command: 'Move Tab Left',
    bindings: [
      {
        keys: [{ label: '^' }, { label: '⇧' }, { label: '←' }]
      }
    ]
  },
  {
    command: 'Move Tab Right',
    bindings: [
      {
        keys: [{ label: '^' }, { label: '⇧' }, { label: '→' }]
      }
    ]
  },
  {
    command: 'Move to End of Line',
    bindings: [
      {
        keys: [{ label: '^', accent: true }, { label: 'E', accent: true }]
      }
    ]
  },
  {
    command: 'Move to End of Paragraph',
    bindings: [
      {
        keys: [{ label: '^', accent: true }, { label: 'E', accent: true }]
      }
    ]
  },
  {
    command: 'Move to Line End',
    bindings: [
      {
        keys: [{ label: '^', accent: true }, { label: 'E', accent: true }]
      }
    ]
  },
  {
    command: 'Move to Line Start',
    bindings: [
      {
        keys: [{ label: '^', accent: true }, { label: 'A', accent: true }]
      }
    ]
  },
  {
    command: 'Move to Start of Line',
    bindings: [
      {
        keys: [{ label: '^', accent: true }, { label: 'A', accent: true }]
      }
    ]
  },
  {
    command: 'Move to Start of Paragraph',
    bindings: [
      {
        keys: [{ label: '^', accent: true }, { label: 'A', accent: true }]
      }
    ]
  },
  {
    command: 'Move to the End of the Buffer',
    bindings: [
      {
        keys: [{ label: '⇧' }, { label: 'Meta' }, { label: '>' }]
      }
    ]
  },
  {
    command: 'Move to the End of the Paragraph',
    bindings: [
      {
        keys: [{ label: 'Meta' }, { label: 'E' }]
      }
    ]
  },
  {
    command: 'Move to the Start of the Buffer',
    bindings: [
      {
        keys: [{ label: '⇧' }, { label: 'Meta' }, { label: '<' }]
      }
    ]
  },
  {
    command: 'Move to the Start of the Paragraph',
    bindings: [
      {
        keys: [{ label: 'Meta' }, { label: 'A' }]
      }
    ]
  },
  {
    command: 'New Agent Pane',
    bindings: [
      {
        keys: [{ label: '^' }, { label: 'Space' }]
      }
    ]
  },
  {
    command: 'New Agent Tab',
    bindings: []
  }
];
