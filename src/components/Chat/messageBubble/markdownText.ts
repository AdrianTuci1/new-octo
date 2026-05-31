const LOCAL_PATH_INLINE_PATTERN = /^(?:\/(?:[^/\0]+\/)*[^/\0]*|\.\.?(?:\/[^/\0]+)*\/?|~\/(?:[^/\0]+\/?)*|[A-Za-z]:[\\/](?:[^\\/\0]+[\\/])*[^\\/\0]*)$/;
const CSV_BLOCK_MIN_ROWS = 2;
const TABLE_DELIMITERS = [',', ';', '\t'] as const;
const ROMANIAN_OR_LATIN_UPPERCASE = 'A-ZĂÂÎȘȚ';
const ROMANIAN_OR_LATIN_LETTER = `${ROMANIAN_OR_LATIN_UPPERCASE}a-zăâîșț`;
const UNICODE_BULLET_PATTERN = '[•‣◦▪▫‒–—]';
const PROTECTED_BLOCK_PREFIX = '\uE000OCTOMUS_MD_BLOCK_';
const PROTECTED_BLOCK_SUFFIX = '\uE001';

export function looksLikeLocalPath(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('\n')) {
    return false;
  }

  return LOCAL_PATH_INLINE_PATTERN.test(trimmed);
}

export function normalizeLocalInlinePath(value: string) {
  return value.trim().replace(/\/+$/, (match, offset, source) => {
    return source.length > 1 ? '' : match;
  });
}

export function highlightSlashCommandsInMarkdown(text: string): string {
  const parts = text.split(/(`{1,3}[\s\S]*?`{1,3})/g);

  return parts.map((part, index) => {
    if (index % 2 === 1) {
      return part;
    }

    return part.replace(/(^|\s)(\/[a-zA-Z0-9-_]+)(?=$|\s|[.,!?;:])/g, (match, space, cmd) => {
      return `${space}[${cmd}](slash-cmd://${cmd.slice(1)})`;
    });
  }).join('');
}

export function annotateLocalPathsInMarkdown(text: string): string {
  const parts = text.split(/(`{1,3}[\s\S]*?`{1,3})/g);

  return parts.map((part, index) => {
    if (index % 2 === 1) {
      return part;
    }

    return part.replace(
      /(^|[\s(])((?:~\/[^\s`)<>,;]+|\.{1,2}\/[^\s`)<>,;]+|\/[^\s/`)<>,;]+\/[^\s`)<>,;]*))/g,
      (match, prefix, candidate) => {
        const normalizedCandidate = candidate.replace(/[.,;:!?]+$/, '');
        const trailing = candidate.slice(normalizedCandidate.length);
        if (!looksLikeLocalPath(normalizedCandidate)) {
          return match;
        }

        return `${prefix}\`${normalizedCandidate}\`${trailing}`;
      }
    );
  }).join('');
}

function splitAroundCode(text: string) {
  return text.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
}

function repairCompactMarkdownChunk(text: string) {
  return text
    .replace(/\r\n?/g, '\n')
    // Some model outputs arrive as one long paragraph with headings glued in:
    // "text###1. TitleBody". Markdown needs a block break and a space after #.
    .replace(new RegExp(`([^#\\n])\\s*(#{2,6})(?=[0-9${ROMANIAN_OR_LATIN_UPPERCASE}])`, 'g'), '$1\n\n$2')
    .replace(/(^|\n)(#{2,6})(?!#)(?=\S)/g, '$1$2 ')
    .replace(
      new RegExp(`(^|\\n)(#{2,6}\\s+\\d+[.)]\\s+[^\\n]*?\\))(?=[${ROMANIAN_OR_LATIN_UPPERCASE}])`, 'g'),
      '$1$2\n\n'
    )
    .replace(new RegExp(`(^|\\n)\\s*${UNICODE_BULLET_PATTERN}\\s+`, 'g'), '$1- ')
    .replace(new RegExp(`([:;.!?])\\s+${UNICODE_BULLET_PATTERN}\\s+`, 'g'), '$1\n\n- ')
    .replace(new RegExp(`([^\\n])\\s+${UNICODE_BULLET_PATTERN}\\s+`, 'g'), '$1\n- ')
    // Repair common bold headings glued to prose, e.g. ".***Serverless:**Dacă".
    .replace(/([.!?])(\*{2,3})(?=\S)/g, '$1\n\n$2')
    .replace(/\*{3}([^*\n]+?)\*{2}(?=\S|$)/g, '**$1**')
    .replace(new RegExp(`(\\*{2,3}[^*\\n]+?\\*{2,3})(?=[${ROMANIAN_OR_LATIN_UPPERCASE}])`, 'g'), '$1\n\n')
    // Lists also need block boundaries; compact output can glue them after prose.
    .replace(/([:;.!?])\s+((?:[-*+]|\d+[.)])\s+)(?=\S)/g, '$1\n\n$2')
    .replace(new RegExp(`([^#\\n])\\s+(\\d{1,2}[.)]\\s+)(?=[${ROMANIAN_OR_LATIN_LETTER}\`])`, 'g'), '$1\n$2')
    .replace(new RegExp(`([^\\n])\\s+([-*+]\\s+)(?=[${ROMANIAN_OR_LATIN_LETTER}\`])`, 'g'), '$1\n$2')
    // Some compact streams use "|" as a pseudo-line break before emphasis labels.
    .replace(/([.!?])\|\s*(\*{1,3})(?=\S)/g, '$1\n\n$2')
    .replace(/([.!?])(?=\*[^*\n]{2,80}:\*)/g, '$1\n\n');
}

export function repairCompactMarkdown(text: string) {
  return splitAroundCode(text).map((part, index) => (
    index % 2 === 1 ? part : repairCompactMarkdownChunk(part)
  )).join('');
}

function parseDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (inQuotes) {
      if (character === '"') {
        if (line[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else if (line[index + 1] === delimiter || line[index + 1] === undefined) {
          inQuotes = false;
        } else {
          cell += character;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') {
      if (cell.trim().length === 0) {
        inQuotes = true;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === delimiter) {
      cells.push(cell.trim());
      cell = '';
      continue;
    }

    cell += character;
  }

  if (inQuotes) {
    return null;
  }

  cells.push(cell.trim());
  return cells;
}

function escapeMarkdownTableCell(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function parseDelimitedTableRows(lines: string[]) {
  for (const delimiter of TABLE_DELIMITERS) {
    if (!lines[0]?.includes(delimiter)) {
      continue;
    }

    const parsedRows = lines.map((line) => parseDelimitedLine(line, delimiter));
    if (parsedRows.some((row): row is null => row === null || row.length < 2)) {
      continue;
    }

    const normalizedRows = parsedRows as string[][];
    const columnCount = normalizedRows[0]?.length ?? 0;
    if (columnCount >= 2 && normalizedRows.every((row) => row.length === columnCount)) {
      return normalizedRows;
    }
  }

  return null;
}

function buildMarkdownTableFromRows(normalizedRows: string[][]) {
  const [headerRow, ...dataRows] = normalizedRows;
  const header = headerRow.map(escapeMarkdownTableCell);
  const separator = header.map(() => '---');
  const bodyRows = dataRows.map((row) => row.map(escapeMarkdownTableCell));

  return [
    `| ${header.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...bodyRows.map((row) => `| ${row.join(' | ')} |`)
  ].join('\n');
}

function parsedPipeRowColumnCount(line: string) {
  return splitPipeTableRow(line).length;
}

function isPipeTableSeparatorLine(line: string) {
  const cells = splitPipeTableRow(line);
  return cells.length >= 2 && cells.every(isMarkdownTableSeparatorCell);
}

function normalizeMarkdownPipeTableRows(lines: string[], startIndex: number) {
  const headerCells = splitPipeTableRow(lines[startIndex]);
  const columnCount = headerCells.length;
  if (columnCount < 2 || !isPipeTableSeparatorLine(lines[startIndex + 1] ?? '')) {
    return null;
  }

  const tableRows: string[] = [
    `| ${headerCells.map(escapeMarkdownTableCell).join(' | ')} |`,
    `| ${headerCells.map(() => '---').join(' | ')} |`
  ];

  let index = startIndex + 2;
  let pendingRow = '';

  const flushPendingRow = () => {
    const trimmed = pendingRow.trim();
    if (!trimmed) return false;

    const cells = splitPipeTableRow(trimmed);
    if (cells.length !== columnCount) {
      return false;
    }

    tableRows.push(`| ${cells.map(escapeMarkdownTableCell).join(' | ')} |`);
    pendingRow = '';
    return true;
  };

  const appendTableContinuation = (left: string, right: string) => {
    if (!left) return right;
    if (/[*_`(/-]$/.test(left) || /^[,.;:!?%)]/.test(right)) {
      return `${left}${right}`;
    }

    return `${left} ${right}`;
  };

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      break;
    }

    if (!trimmed.includes('|') && !pendingRow) {
      break;
    }

    const candidate = pendingRow ? appendTableContinuation(pendingRow, trimmed) : trimmed;
    const candidateColumns = parsedPipeRowColumnCount(candidate);

    if (!pendingRow && candidateColumns > columnCount) {
      break;
    }

    pendingRow = candidate;
    if (candidateColumns >= columnCount && !flushPendingRow()) {
      break;
    }

    index += 1;
  }

  if (pendingRow.trim() && !flushPendingRow()) {
    return null;
  }

  if (tableRows.length <= 2) {
    return null;
  }

  return {
    endIndex: index,
    table: tableRows.join('\n')
  };
}

function normalizeMarkdownPipeTablesInMarkdown(text: string) {
  const parts = splitAroundCode(text);

  return parts.map((part, partIndex) => {
    if (partIndex % 2 === 1) {
      return part;
    }

    const lines = part.split('\n');
    const output: string[] = [];
    let index = 0;

    while (index < lines.length) {
      const currentLine = lines[index] ?? '';
      const nextLine = lines[index + 1] ?? '';
      if (currentLine.includes('|') && isPipeTableSeparatorLine(nextLine)) {
        const normalized = normalizeMarkdownPipeTableRows(lines, index);
        if (normalized) {
          output.push(normalized.table);
          index = normalized.endIndex;
          continue;
        }
      }

      output.push(currentLine);
      index += 1;
    }

    return output.join('\n');
  }).join('');
}

function convertDelimitedLinesToMarkdownTable(lines: string[]) {
  const trimmedLines = lines
    .map((line) => line.trim())
    .filter(Boolean);

  if (trimmedLines.length < CSV_BLOCK_MIN_ROWS) return null;
  if (trimmedLines.some((line) => /^(?:[-*+]\s+|\d+[.)]\s+|>|```|\|)/.test(line))) {
    return null;
  }

  const normalizedRows = parseDelimitedTableRows(trimmedLines);
  if (!normalizedRows) return null;

  const columnCount = normalizedRows[0]?.length ?? 0;
  if (columnCount < 2 || normalizedRows.some((row) => row.length !== columnCount)) {
    return null;
  }

  return buildMarkdownTableFromRows(normalizedRows);
}

function convertCompactDelimitedRows(block: string) {
  if (!block.includes('||')) return null;
  const lines = block
    .split(/\s*\|\|\s*/)
    .map((line) => line.trim())
    .filter(Boolean);

  return convertDelimitedLinesToMarkdownTable(lines);
}

function lineCanBeDelimitedTableRow(line: string) {
  const trimmed = line.trim();
  if (!trimmed || /^(?:[-*+]\s+|\d+[.)]\s+|>|```|\|)/.test(trimmed)) {
    return false;
  }

  return TABLE_DELIMITERS.some((delimiter) => trimmed.includes(delimiter));
}

function convertDelimitedTableRuns(text: string) {
  const lines = text.split('\n');
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    if (!lineCanBeDelimitedTableRow(lines[index])) {
      output.push(lines[index]);
      index += 1;
      continue;
    }

    let endIndex = index;
    while (endIndex < lines.length && lineCanBeDelimitedTableRow(lines[endIndex])) {
      endIndex += 1;
    }

    const run = lines.slice(index, endIndex);
    const table = convertDelimitedLinesToMarkdownTable(run);
    if (table) {
      output.push(table);
    } else {
      output.push(...run);
    }
    index = endIndex;
  }

  return output.join('\n');
}

function convertCsvCodeFencesInMarkdown(text: string) {
  return text.replace(/```(?:csv|tsv|table|markdown|md)\s*\n([\s\S]*?)```/gi, (match, body) => {
    const table = convertFencedTableBodyToMarkdown(body);
    return table ?? match;
  });
}

export function convertCsvTablesInMarkdown(text: string) {
  const parts = splitAroundCode(text);

  return parts.map((part, index) => {
    if (index % 2 === 1) {
      return part;
    }

    return convertDelimitedTableRuns(
      part
        .split(/\n{2,}/)
        .map((block) => convertCompactDelimitedRows(block) ?? block)
        .join('\n\n')
    );
  }).join('');
}

function splitPipeTableRow(row: string) {
  const cells = row.split('|').map((cell) => cell.trim());

  if (cells[0] === '') {
    cells.shift();
  }

  if (cells[cells.length - 1] === '') {
    cells.pop();
  }

  return cells;
}

function classifyMarkdownLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return 'blank';
  }
  if (/^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line)) {
    return 'list';
  }
  if (/^\s*\|.*\|\s*$/.test(line) || trimmed.split('|').length >= 3) {
    return 'table';
  }
  if (/^\s*>/.test(line)) {
    return 'quote';
  }
  if (/^\s{0,3}#{1,6}\s+/.test(line) || /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
    return 'block';
  }
  return 'plain';
}

function normalizeLooseParagraphBreaks(text: string) {
  const parts = text.split(/(`{1,3}[\s\S]*?`{1,3})/g);

  return parts.map((part, index) => {
    if (index % 2 === 1) {
      return part;
    }

    const blocks: string[] = [];
    let currentBlock: string[] = [];
    let currentKind: ReturnType<typeof classifyMarkdownLine> | null = null;

    const flushBlock = () => {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n'));
        currentBlock = [];
        currentKind = null;
      }
    };

    for (const line of part.split('\n')) {
      const kind = classifyMarkdownLine(line);

      if (kind === 'blank') {
        flushBlock();
        continue;
      }

      if (currentBlock.length === 0) {
        currentBlock.push(line);
        currentKind = kind;
        continue;
      }

      const shouldContinueBlock = currentKind === kind && (kind === 'list' || kind === 'table' || kind === 'quote');
      if (shouldContinueBlock) {
        currentBlock.push(line);
        continue;
      }

      flushBlock();
      currentBlock.push(line);
      currentKind = kind;
    }

    flushBlock();
    return blocks.join('\n\n');
  }).join('');
}

function isMarkdownTableSeparatorCell(value: string) {
  return /^:?-{3,}:?$/.test(value.trim());
}

function normalizePipeTableLinesToMarkdownTable(lines: string[]) {
  const trimmedLines = lines
    .map((line) => line.trim())
    .filter(Boolean);

  if (trimmedLines.length < 2) {
    return null;
  }

  const parsedRows = trimmedLines.map(splitPipeTableRow);
  const columnCount = parsedRows[0]?.length ?? 0;
  if (
    columnCount < 2
    || parsedRows.some((row) => row.length !== columnCount)
    || !parsedRows[1]?.every(isMarkdownTableSeparatorCell)
  ) {
    return null;
  }

  const [headerRow, separatorRow, ...bodyRows] = parsedRows;
  return [
    `| ${headerRow.map(escapeMarkdownTableCell).join(' | ')} |`,
    `| ${separatorRow.map(() => '---').join(' | ')} |`,
    ...bodyRows.map((row) => `| ${row.map(escapeMarkdownTableCell).join(' | ')} |`)
  ].join('\n');
}

function convertFencedTableBodyToMarkdown(body: string) {
  const lines = body.split('\n');
  return normalizePipeTableLinesToMarkdownTable(lines)
    ?? convertDelimitedLinesToMarkdownTable(lines);
}

function convertLoosePipeTableBlock(block: string) {
  let trimmed = block.trim();
  if (!trimmed.includes('||') || !trimmed.includes('|')) {
    return null;
  }

  trimmed = trimmed
    .replace(/^["']+/, '')
    .replace(/["']+$/, '')
    .trim();

  const rows = trimmed
    .split(/\s*\|\|\s*/)
    .map((row) => row.trim())
    .filter((row) => row.length > 0);

  if (rows.length < 2) {
    return null;
  }

  const parsedRows = rows.map(splitPipeTableRow);
  if (parsedRows.some((row) => row.length < 2)) {
    return null;
  }

  const columnCount = parsedRows[0]?.length ?? 0;
  if (columnCount < 2 || parsedRows.some((row) => row.length !== columnCount)) {
    return null;
  }

  const [firstRow, secondRow, ...restRows] = parsedRows;
  const header = firstRow.map(escapeMarkdownTableCell);
  const separator = secondRow.every(isMarkdownTableSeparatorCell)
    ? secondRow.map(() => '---')
    : header.map(() => '---');
  const bodyRows = secondRow.every(isMarkdownTableSeparatorCell)
    ? restRows
    : [secondRow, ...restRows];

  return [
    `| ${header.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...bodyRows.map((row) => `| ${row.map(escapeMarkdownTableCell).join(' | ')} |`)
  ].join('\n');
}

export function convertLoosePipeTablesInMarkdown(text: string) {
  const parts = splitAroundCode(text);

  return parts.map((part, index) => {
    if (index % 2 === 1) {
      return part;
    }

    return part
      .split(/\n{2,}/)
      .map((block) => convertLoosePipeTableBlock(block) ?? block)
      .join('\n\n');
  }).join('');
}

function collectProtectedMarkdownBlocks(text: string) {
  const lines = text.split('\n');
  const blocks: string[] = [];
  const output: string[] = [];
  let index = 0;

  const pushProtectedBlock = (blockLines: string[]) => {
    const placeholder = `${PROTECTED_BLOCK_PREFIX}${blocks.length}${PROTECTED_BLOCK_SUFFIX}`;
    blocks.push(blockLines.join('\n'));
    output.push(placeholder);
  };

  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (/^\s*```/.test(line)) {
      const blockLines = [line];
      index += 1;
      while (index < lines.length) {
        blockLines.push(lines[index]);
        if (/^\s*```\s*$/.test(lines[index])) {
          index += 1;
          break;
        }
        index += 1;
      }
      pushProtectedBlock(blockLines);
      continue;
    }

    if (line.includes('|') && isPipeTableSeparatorLine(lines[index + 1] ?? '')) {
      const blockLines = [line, lines[index + 1]];
      index += 2;
      while (index < lines.length && lines[index].trim().includes('|')) {
        blockLines.push(lines[index]);
        index += 1;
      }
      pushProtectedBlock(blockLines);
      continue;
    }

    output.push(line);
    index += 1;
  }

  return {
    text: output.join('\n'),
    blocks
  };
}

function restoreProtectedMarkdownBlocks(text: string, blocks: string[]) {
  return text.replace(
    new RegExp(`${PROTECTED_BLOCK_PREFIX}(\\d+)${PROTECTED_BLOCK_SUFFIX}`, 'g'),
    (match, index) => blocks[Number(index)] ?? match
  );
}

export function prepareMarkdownBody(text: string) {
  const tableNormalized = normalizeMarkdownPipeTablesInMarkdown(convertLoosePipeTablesInMarkdown(
    convertCsvTablesInMarkdown(
      convertCsvCodeFencesInMarkdown(text)
    )
  ));
  const protectedMarkdown = collectProtectedMarkdownBlocks(tableNormalized);

  const formatted = highlightSlashCommandsInMarkdown(
    annotateLocalPathsInMarkdown(
      normalizeLooseParagraphBreaks(
        repairCompactMarkdown(protectedMarkdown.text)
      )
    )
  );

  return restoreProtectedMarkdownBlocks(formatted, protectedMarkdown.blocks);
}
