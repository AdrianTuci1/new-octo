import type { WorkspaceChromeTab, WorkspacePaneDirection, WorkspacePaneLayout, WorkspacePaneNode } from '../chrome';
import type { TerminalSessionTarget } from '../../../types/terminal';

type TabConfigParamDefinition = {
  type?: 'text' | 'branch' | 'repo';
  description?: string;
  default?: string;
};

type TabConfigPaneDefinition = {
  id: string;
  type?: 'terminal' | 'agent' | 'cloud';
  split?: WorkspacePaneDirection;
  children?: string[];
  directory?: string;
  commands?: string[];
  isFocused?: boolean;
  shell?: string;
};

export type ParsedTabConfig = {
  name: string;
  title: string | null;
  color: 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white' | null;
  panes: TabConfigPaneDefinition[];
  params: Record<string, TabConfigParamDefinition>;
};

export type TabConfigPaneRuntimeState = {
  workingDirectory: string | null;
  initialComposerSurface: 'agent' | 'terminal';
  terminalTarget: TerminalSessionTarget | null;
  agentTerminalTarget: TerminalSessionTarget | null;
  startupCommands: string[];
};

export type TabConfigLaunchPlan = {
  tab: WorkspaceChromeTab;
  paneLayout: WorkspacePaneLayout;
  paneStateByPaneId: Record<string, TabConfigPaneRuntimeState>;
  activePaneId: string;
};

const TAB_COLOR_TO_TINT: Record<NonNullable<ParsedTabConfig['color']>, string> = {
  black: '#1f2937',
  red: '#7c2d12',
  green: '#365314',
  yellow: '#854d0e',
  blue: '#1d4ed8',
  magenta: '#6b21a8',
  cyan: '#0f766e',
  white: '#6b7280'
};

type RawTabConfigPane = {
  id: string;
  type?: 'terminal' | 'agent' | 'cloud';
  split?: WorkspacePaneDirection;
  children?: string[];
  directory?: string;
  commands?: string[];
  isFocused?: boolean;
  shell?: string;
};

type RawTabConfigParam = {
  type?: 'text' | 'branch' | 'repo';
  description?: string;
  default?: string;
};

function stripInlineComment(line: string) {
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  let output = '';

  for (const char of line) {
    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      output += char;
      escaped = true;
      continue;
    }

    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      output += char;
      continue;
    }

    if (char === '\'' && !inDouble) {
      inSingle = !inSingle;
      output += char;
      continue;
    }

    if (char === '#' && !inSingle && !inDouble) {
      break;
    }

    output += char;
  }

  return output.trim();
}

function parseQuotedString(value: string) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote !== '"' && quote !== '\'') || trimmed[trimmed.length - 1] !== quote) {
    return null;
  }

  const body = trimmed.slice(1, -1);
  if (quote === '\'') {
    return body.replace(/\\'/g, '\'').replace(/\\\\/g, '\\');
  }

  return body
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t');
}

function parseStringArray(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return null;
  }

  const body = trimmed.slice(1, -1).trim();
  if (!body) {
    return [];
  }

  const values: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (const char of body) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      current += char;
      escaped = true;
      continue;
    }

    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      current += char;
      continue;
    }

    if (char === '\'' && !inDouble) {
      inSingle = !inSingle;
      current += char;
      continue;
    }

    if (char === ',' && !inSingle && !inDouble) {
      const parsed = parseQuotedString(current.trim());
      if (parsed === null) {
        return null;
      }
      values.push(parsed);
      current = '';
      continue;
    }

    current += char;
  }

  const finalValue = parseQuotedString(current.trim());
  if (finalValue === null) {
    return null;
  }
  values.push(finalValue);

  return values;
}

function parseBoolean(value: string) {
  if (value.trim() === 'true') return true;
  if (value.trim() === 'false') return false;
  return null;
}

function parseStringValue(raw: string) {
  const quoted = parseQuotedString(raw);
  if (quoted !== null) {
    return quoted;
  }

  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : '';
}

function parseKeyValue(line: string) {
  const index = line.indexOf('=');
  if (index < 0) return null;
  const key = line.slice(0, index).trim();
  const value = line.slice(index + 1).trim();
  if (!key) return null;
  return { key, value };
}

function parseTabColor(value: string): ParsedTabConfig['color'] {
  switch (value.trim()) {
    case 'black':
    case 'red':
    case 'green':
    case 'yellow':
    case 'blue':
    case 'magenta':
    case 'cyan':
    case 'white':
      return value.trim() as NonNullable<ParsedTabConfig['color']>;
    default:
      return null;
  }
}

function parsePaneKind(value: string): TabConfigPaneDefinition['type'] | null {
  switch (value.trim()) {
    case 'terminal':
    case 'agent':
    case 'cloud':
      return value.trim() as NonNullable<TabConfigPaneDefinition['type']>;
    default:
      return null;
  }
}

function parseSplitDirection(value: string): WorkspacePaneDirection | null {
  switch (value.trim()) {
    case 'horizontal':
    case 'vertical':
      return value.trim() as WorkspacePaneDirection;
    default:
      return null;
  }
}

export function parseTabConfigToml(contents: string, fallbackName = 'Tab config'): ParsedTabConfig {
  const panes: RawTabConfigPane[] = [];
  const params: Record<string, RawTabConfigParam> = {};
  let name: string | null = null;
  let title: string | null = null;
  let color: ParsedTabConfig['color'] = null;
  let currentPane: RawTabConfigPane | null = null;
  let currentParamName: string | null = null;
  let currentSection: 'root' | 'pane' | 'param' | 'other' = 'root';

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = stripInlineComment(rawLine);
    if (!line) {
      continue;
    }

    if (line === '[[panes]]') {
      currentPane = { id: '' };
      panes.push(currentPane);
      currentParamName = null;
      currentSection = 'pane';
      continue;
    }

    const paramSectionMatch = line.match(/^\[params\.([A-Za-z0-9_-]+)\]$/);
    if (paramSectionMatch) {
      currentParamName = paramSectionMatch[1];
      params[currentParamName] = params[currentParamName] ?? {};
      currentPane = null;
      currentSection = 'param';
      continue;
    }

    if (line.startsWith('[') && line.endsWith(']')) {
      currentPane = null;
      currentParamName = null;
      currentSection = 'other';
      continue;
    }

    const keyValue = parseKeyValue(line);
    if (!keyValue) {
      continue;
    }

    const { key, value } = keyValue;

    if (currentSection === 'pane' && currentPane) {
      switch (key) {
        case 'id':
          currentPane.id = parseStringValue(value);
          break;
        case 'type':
          currentPane.type = parsePaneKind(value) ?? undefined;
          break;
        case 'split':
          currentPane.split = parseSplitDirection(value) ?? undefined;
          break;
        case 'children':
          currentPane.children = parseStringArray(value) ?? undefined;
          break;
        case 'directory':
          currentPane.directory = parseStringValue(value);
          break;
        case 'commands':
          currentPane.commands = parseStringArray(value) ?? undefined;
          break;
        case 'is_focused':
          currentPane.isFocused = parseBoolean(value) ?? undefined;
          break;
        case 'shell':
          currentPane.shell = parseStringValue(value);
          break;
        default:
          break;
      }
      continue;
    }

    if (currentSection === 'param' && currentParamName) {
      switch (key) {
        case 'type':
          params[currentParamName].type = value.trim() === 'branch' || value.trim() === 'repo'
            ? value.trim() as NonNullable<RawTabConfigParam['type']>
            : 'text';
          break;
        case 'description':
          params[currentParamName].description = parseStringValue(value);
          break;
        case 'default':
          params[currentParamName].default = parseStringValue(value);
          break;
        default:
          break;
      }
      continue;
    }

    if (currentSection === 'root') {
      switch (key) {
        case 'name':
          name = parseStringValue(value);
          break;
        case 'title':
          title = parseStringValue(value);
          break;
        case 'color':
          color = parseTabColor(parseStringValue(value));
          break;
        default:
          break;
      }
    }
  }

  if (panes.length === 0) {
    throw new Error('Tab config has no panes.');
  }

  const normalizedPanes = panes.map((pane, index) => {
    if (!pane.id) {
      throw new Error(`Pane ${index + 1} is missing an id.`);
    }

    return pane;
  }) as TabConfigPaneDefinition[];

  return {
    name: name?.trim() || fallbackName,
    title: title?.trim() || null,
    color,
    panes: normalizedPanes,
    params
  };
}

export function collectTabConfigTemplateVariables(config: ParsedTabConfig) {
  const values = new Set<string>();
  const collectFromString = (value?: string | null) => {
    if (!value) return;
    const matches = value.match(/\{\{([A-Za-z0-9_]+)\}\}/g);
    matches?.forEach((match) => {
      const key = match.slice(2, -2);
      if (key) {
        values.add(key);
      }
    });
  };

  collectFromString(config.name);
  collectFromString(config.title);
  config.panes.forEach((pane) => {
    collectFromString(pane.directory);
    pane.commands?.forEach((command) => collectFromString(command));
    collectFromString(pane.shell);
  });

  Object.values(config.params).forEach((param) => collectFromString(param.default));

  return Array.from(values);
}

export function resolveTabConfigTemplates(value: string, variables: Record<string, string>) {
  return value.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : match
  ));
}

function normalizePath(path: string, homeDir: string | null) {
  const trimmed = path.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('~')) {
    return homeDir ? trimmed.replace(/^~(?=\/|$)/, homeDir) : trimmed;
  }

  return trimmed;
}

function sanitizePaneId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || 'pane';
}

function remapPaneId(tabId: string, paneId: string, usedIds: Set<string>) {
  const base = `${tabId}-pane-${sanitizePaneId(paneId)}`;
  let next = base;
  let suffix = 2;

  while (usedIds.has(next)) {
    next = `${base}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(next);
  return next;
}

type BuildNodeResult = {
  node: WorkspacePaneNode;
  firstLeafPaneId: string;
  focusedLeafPaneId: string | null;
  paneStateByPaneId: Record<string, TabConfigPaneRuntimeState>;
};

function buildNodeFromConfig(
  configPanesById: Map<string, TabConfigPaneDefinition>,
  pane: TabConfigPaneDefinition,
  options: {
    tabId: string;
    homeDir: string | null;
    cloudTarget: TerminalSessionTarget | null;
    resolvedVariables: Record<string, string>;
    usedPaneIds: Set<string>;
    seenConfigIds: Set<string>;
    stack: string[];
  }
): BuildNodeResult {
  if (options.stack.includes(pane.id)) {
    throw new Error(`Tab config contains a cycle involving pane "${pane.id}".`);
  }

  if (options.seenConfigIds.has(pane.id)) {
    throw new Error(`Tab config reuses pane "${pane.id}" more than once.`);
  }
  options.seenConfigIds.add(pane.id);

  const remappedPaneId = remapPaneId(options.tabId, pane.id, options.usedPaneIds);
  const resolvedDirectory = normalizePath(
    resolveTabConfigTemplates(pane.directory ?? '', options.resolvedVariables),
    options.homeDir
  );
  const resolvedCommands = (pane.commands ?? []).map((command) => resolveTabConfigTemplates(command, options.resolvedVariables));
  const defaultState: TabConfigPaneRuntimeState = {
    workingDirectory: resolvedDirectory ?? options.homeDir,
    initialComposerSurface: pane.type === 'agent' ? 'agent' : 'terminal',
    terminalTarget: pane.type === 'cloud' ? options.cloudTarget : null,
    agentTerminalTarget: pane.type === 'cloud' ? options.cloudTarget : null,
    startupCommands: resolvedCommands
  };

  if (pane.split) {
    if (pane.type) {
      throw new Error(`Split pane "${pane.id}" cannot declare a type.`);
    }

    if (!pane.children || pane.children.length < 2) {
      throw new Error(`Split pane "${pane.id}" must declare at least two children.`);
    }

    const nextStack = [...options.stack, pane.id];
    const childResults = pane.children.map((childId) => {
      const child = configPanesById.get(childId);
      if (!child) {
        throw new Error(`Pane "${pane.id}" references missing child "${childId}".`);
      }
      return buildNodeFromConfig(configPanesById, child, { ...options, stack: nextStack });
    });

    const childNodes = childResults.map((result) => result.node);
    const childState = Object.assign({}, ...childResults.map((result) => result.paneStateByPaneId));
    const focusedLeafPaneId = childResults.find((result) => result.focusedLeafPaneId)?.focusedLeafPaneId ?? null;
    const firstLeafPaneId = childResults[0]?.firstLeafPaneId;
    if (!firstLeafPaneId) {
      throw new Error(`Split pane "${pane.id}" must contain at least one leaf descendant.`);
    }

    return {
      node: {
        type: 'split',
        direction: pane.split,
        children: childNodes
      },
      firstLeafPaneId,
      focusedLeafPaneId,
      paneStateByPaneId: childState
    };
  }

  if (!pane.type) {
    throw new Error(`Leaf pane "${pane.id}" is missing a type.`);
  }

  if (pane.children || pane.split) {
    throw new Error(`Leaf pane "${pane.id}" cannot declare split children.`);
  }

  const nextState = {
    [remappedPaneId]: defaultState
  };

  return {
    node: {
      type: 'leaf',
      paneId: remappedPaneId
    },
    firstLeafPaneId: remappedPaneId,
    focusedLeafPaneId: pane.isFocused ? remappedPaneId : null,
    paneStateByPaneId: nextState
  };
}

export function buildTabConfigLaunchPlan(
  config: ParsedTabConfig,
  options: {
    tabId: string;
    homeDir: string | null;
    cloudTarget: TerminalSessionTarget | null;
    resolvedVariables: Record<string, string>;
  }
): TabConfigLaunchPlan {
  const configPanesById = new Map(config.panes.map((pane) => [pane.id, pane]));
  const root = config.panes[0];
  const usedPaneIds = new Set<string>();
  const rootResult = buildNodeFromConfig(configPanesById, root, {
    tabId: options.tabId,
    homeDir: options.homeDir,
    cloudTarget: options.cloudTarget,
    resolvedVariables: options.resolvedVariables,
    usedPaneIds,
    seenConfigIds: new Set<string>(),
    stack: []
  });
  if (rootResult && config.panes.length !== 0 && rootResult.paneStateByPaneId && Object.keys(rootResult.paneStateByPaneId).length === 0) {
    throw new Error('Tab config does not contain any leaf panes.');
  }
  if (Object.keys(rootResult.paneStateByPaneId).length !== config.panes.filter((pane) => !pane.split).length) {
    throw new Error('Tab config contains unreachable or duplicated leaf panes.');
  }
  const activePaneId = rootResult.focusedLeafPaneId ?? rootResult.firstLeafPaneId;
  const tabLabel = resolveTabConfigTemplates(config.title?.trim() || config.name, options.resolvedVariables).trim() || config.name;

  return {
    tab: {
      id: options.tabId,
      label: tabLabel,
      kind: 'terminal',
      tintColor: config.color ? TAB_COLOR_TO_TINT[config.color] : undefined
    },
    paneLayout: {
      activePaneId,
      root: rootResult.node
    },
    paneStateByPaneId: rootResult.paneStateByPaneId,
    activePaneId
  };
}
