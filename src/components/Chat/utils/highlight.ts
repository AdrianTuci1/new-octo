export function clearChatHighlights(container: HTMLElement) {
  const existingHighlights = container.querySelectorAll('.chat-search-highlight');
  existingHighlights.forEach((element) => {
    const parent = element.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(element.textContent || ''), element);
    }
  });

  if (existingHighlights.length > 0) {
    container.normalize();
  }
}

export function performChatHighlight(
  container: HTMLElement,
  searchQuery: string,
  caseSensitive: boolean,
  useRegex: boolean,
  wholeWord: boolean
): HTMLSpanElement[] {
  clearChatHighlights(container);

  if (!searchQuery) {
    return [];
  }

  let regex: RegExp;
  try {
    if (useRegex) {
      let pattern = searchQuery;
      if (wholeWord) {
        pattern = `\\b${pattern}\\b`;
      }
      regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
    } else {
      let escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (wholeWord) {
        escaped = `\\b${escaped}\\b`;
      }
      regex = new RegExp(escaped, caseSensitive ? 'g' : 'gi');
    }
  } catch {
    return [];
  }

  const highlightSpans: HTMLSpanElement[] = [];

  function traverse(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue || '';
      if (!text.trim()) {
        return;
      }

      const parentElement = node.parentElement;
      if (parentElement) {
        const tagName = parentElement.tagName.toLowerCase();
        if (
          tagName === 'script'
          || tagName === 'style'
          || parentElement.classList.contains('chat-search-highlight')
          || tagName === 'input'
          || tagName === 'textarea'
          || tagName === 'button'
        ) {
          return;
        }
      }

      regex.lastIndex = 0;
      const matchesList: { start: number; end: number }[] = [];
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        if (match.index === regex.lastIndex) {
          regex.lastIndex += 1;
        }
        matchesList.push({ start: match.index, end: match.index + match[0].length });
        if (!regex.global) {
          break;
        }
      }

      if (matchesList.length > 0 && parentElement) {
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;

        matchesList.forEach(({ start, end }) => {
          if (start > lastIndex) {
            fragment.appendChild(document.createTextNode(text.substring(lastIndex, start)));
          }

          const span = document.createElement('span');
          span.className = 'chat-search-highlight';
          span.textContent = text.substring(start, end);
          fragment.appendChild(span);
          highlightSpans.push(span);

          lastIndex = end;
        });

        if (lastIndex < text.length) {
          fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
        }

        parentElement.replaceChild(fragment, node);
      }
      return;
    }

    Array.from(node.childNodes).forEach(traverse);
  }

  traverse(container);
  return highlightSpans;
}
