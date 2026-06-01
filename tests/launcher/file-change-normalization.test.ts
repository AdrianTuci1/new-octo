import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeFileChangeApproval } from '../../src/hooks/useChat/toolCalls/fileChange.ts';

test('file change normalization prefers real workspace paths over code-property lookalikes', () => {
  const approval = normalizeFileChangeApproval({
    fileDiffs: [{
      diffType: {
        kind: 'create',
        delta: {
          replacement_line_range: { start: 1, end: 1 },
          insertion: [
            'class Product {',
            '  constructor(id) {',
            '    this.id = id;',
            '  }',
            '}'
          ].join('\n')
        }
      },
      'filePath:"ecommerce-api/src/models/Product.js"': true
    }]
  });

  assert.equal(approval?.fileDiffs.length, 1);
  assert.equal(approval?.fileDiffs[0]?.filePath, 'ecommerce-api/src/models/Product.js');
});

test('file change normalization rejects pseudo-paths like this.id when no real path exists', () => {
  const approval = normalizeFileChangeApproval({
    fileDiffs: [{
      diffType: {
        kind: 'create',
        delta: {
          replacement_line_range: { start: 1, end: 1 },
          insertion: [
            'class ProductService {',
            '  constructor() {',
            '    this.products = [];',
            '  }',
            '}'
          ].join('\n')
        }
      }
    }]
  });

  assert.equal(approval, undefined);
});
