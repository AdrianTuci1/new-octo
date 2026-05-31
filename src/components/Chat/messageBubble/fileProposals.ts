import type { FileDiff } from '../../../types/diff';

const SHELL_LANGUAGES = new Set(['bash', 'console', 'fish', 'ps1', 'powershell', 'sh', 'shell', 'terminal', 'zsh']);
const FILE_PATH_PATTERN = /(?:^|[\s"'`=:/])((?:\.{1,2}\/|\/)?(?:[\w.-]+\/)+[\w.-]+\.[A-Za-z0-9]{1,12}|[\w.-]+\.[A-Za-z0-9]{1,12})(?=$|[\s"'`),;])/;

function cleanPossibleFilePath(value: string) {
  return value
    .trim()
    .replace(/^[-*]\s+/, '')
    .replace(/^file(?:name)?\s*[:=]\s*/i, '')
    .replace(/^path\s*[:=]\s*/i, '')
    .replace(/^`+|`+$/g, '')
    .replace(/^\*\*|\*\*$/g, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

function extractFilePathFromFence(info: string, previousLine: string) {
  const infoParts = info.trim().split(/\s+/).filter(Boolean);
  const language = infoParts[0]?.toLowerCase() ?? '';
  if (SHELL_LANGUAGES.has(language)) {
    return null;
  }

  const metadata = infoParts.slice(1).join(' ');
  const metadataMatch = metadata.match(FILE_PATH_PATTERN);
  if (metadataMatch?.[1]) {
    return cleanPossibleFilePath(metadataMatch[1]);
  }

  const previous = cleanPossibleFilePath(previousLine);
  const previousMatch = previous.match(FILE_PATH_PATTERN);
  return previousMatch?.[1] ? cleanPossibleFilePath(previousMatch[1]) : null;
}

// Pulls standalone fenced file snippets out of assistant markdown so the UI can
// show them as native diff/file proposal blocks instead of plain text.
export function extractFileProposalFromMarkdown(body: string) {
  const lines = body.split('\n');
  const fileDiffs: FileDiff[] = [];
  const visibleLines: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const fenceStart = lines[index].match(/^```([^\n`]*)$/);
    if (!fenceStart) {
      visibleLines.push(lines[index]);
      continue;
    }

    const previousVisibleLine = visibleLines[visibleLines.length - 1] ?? '';
    const filePath = extractFilePathFromFence(fenceStart[1] ?? '', previousVisibleLine);
    const codeLines: string[] = [];
    let endIndex = index + 1;

    for (; endIndex < lines.length; endIndex += 1) {
      if (/^```$/.test(lines[endIndex])) {
        break;
      }
      codeLines.push(lines[endIndex]);
    }

    if (endIndex >= lines.length) {
      visibleLines.push(lines[index], ...codeLines);
      break;
    }

    if (!filePath) {
      visibleLines.push(lines[index], ...codeLines, lines[endIndex]);
      index = endIndex;
      continue;
    }

    if (previousVisibleLine && cleanPossibleFilePath(previousVisibleLine).includes(filePath)) {
      visibleLines.pop();
    }

    fileDiffs.push({
      filePath,
      diffType: {
        kind: 'create',
        delta: {
          replacement_line_range: { start: 1, end: 1 },
          insertion: codeLines.join('\n')
        }
      }
    });
    index = endIndex;
  }

  return {
    visibleBody: visibleLines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd(),
    fileDiffs
  };
}
