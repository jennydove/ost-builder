import { describe, it, expect } from 'vitest';
import {
  parseMarkdownToTree,
  serializeTreeToMarkdown,
  OST_EXAMPLES,
  DEFAULT_OST_TEMPLATE,
} from '@ost-builder/shared';
import type { OSTTree } from '@ost-builder/shared';

function getTreeStructure(tree: OSTTree) {
  return {
    cardCount: Object.keys(tree.cards).length,
    rootCount: tree.rootIds.length,
    cards: Object.values(tree.cards).map(c => ({
      type: c.type,
      title: c.title,
      status: c.status,
      childCount: c.children.length,
      hasDescription: !!c.description,
      hasMetrics: !!c.metrics,
    })).sort((a, b) => a.title.localeCompare(b.title)),
  };
}

describe('markdown round-trip', () => {
  describe('OST_EXAMPLES round-trip without data loss', () => {
    for (const example of OST_EXAMPLES) {
      it(`round-trips "${example.name}"`, () => {
        const tree1 = parseMarkdownToTree(example.markdown);
        const md2 = serializeTreeToMarkdown(tree1, tree1.name);
        const tree2 = parseMarkdownToTree(md2);

        const s1 = getTreeStructure(tree1);
        const s2 = getTreeStructure(tree2);

        expect(s2.cardCount).toBe(s1.cardCount);
        expect(s2.rootCount).toBe(s1.rootCount);
        expect(s2.cards).toEqual(s1.cards);
      });
    }
  });

  describe('DEFAULT_OST_TEMPLATE round-trip', () => {
    it('round-trips without data loss', () => {
      const tree1 = parseMarkdownToTree(DEFAULT_OST_TEMPLATE);
      const md2 = serializeTreeToMarkdown(tree1, tree1.name);
      const tree2 = parseMarkdownToTree(md2);

      expect(Object.keys(tree2.cards).length).toBe(Object.keys(tree1.cards).length);
      for (const card of Object.values(tree1.cards)) {
        const match = Object.values(tree2.cards).find(c => c.title === card.title);
        expect(match).toBeTruthy();
        expect(match!.type).toBe(card.type);
        expect(match!.status).toBe(card.status);
      }
    });
  });

  describe('card ID stability', () => {
    it('preserves card IDs across round-trips', () => {
      const tree1 = parseMarkdownToTree(DEFAULT_OST_TEMPLATE);
      const md2 = serializeTreeToMarkdown(tree1, tree1.name);
      const tree2 = parseMarkdownToTree(md2);

      const ids1 = Object.keys(tree1.cards).sort();
      const ids2 = Object.keys(tree2.cards).sort();
      expect(ids2).toEqual(ids1);
    });
  });

  describe('description preservation', () => {
    it('preserves descriptions through round-trip', () => {
      const tree1 = parseMarkdownToTree(DEFAULT_OST_TEMPLATE);
      const md2 = serializeTreeToMarkdown(tree1, tree1.name);
      const tree2 = parseMarkdownToTree(md2);

      for (const [id, card] of Object.entries(tree1.cards)) {
        expect(tree2.cards[id].description).toBe(card.description);
      }
    });
  });

  describe('metrics preservation', () => {
    it('preserves outcome metrics through round-trip', () => {
      const md = `# Test
## [Outcome] Revenue @on-track
- start: 0
- current: 28
- target: 40
`;
      const tree1 = parseMarkdownToTree(md);
      const md2 = serializeTreeToMarkdown(tree1, 'Test');
      const tree2 = parseMarkdownToTree(md2);

      const outcome1 = Object.values(tree1.cards).find(c => c.type === 'outcome')!;
      const outcome2 = Object.values(tree2.cards).find(c => c.type === 'outcome')!;

      expect(outcome2.metrics).toEqual(outcome1.metrics);
      expect(outcome2.metrics).toEqual({ start: 0, current: 28, target: 40 });
    });
  });

  describe('status round-trip for all values', () => {
    const statuses = [
      'on-track', 'at-risk', 'achieved',
      'exploring', 'validated', 'prioritized', 'deprioritized',
      'ideating', 'testing', 'dropped',
      'planned', 'running', 'complete',
      'next', 'done',
    ];

    for (const status of statuses) {
      it(`preserves @${status}`, () => {
        const md = `# Test\n## [Outcome] Test Card @${status}\n`;
        const tree1 = parseMarkdownToTree(md);
        const card1 = Object.values(tree1.cards)[0];
        expect(card1.status).toBe(status);

        const md2 = serializeTreeToMarkdown(tree1, 'Test');
        const tree2 = parseMarkdownToTree(md2);
        const card2 = Object.values(tree2.cards)[0];
        expect(card2.status).toBe(status);
      });
    }
  });

  describe('double round-trip idempotency', () => {
    it('serialize(parse(serialize(parse(md)))) === serialize(parse(md))', () => {
      const tree1 = parseMarkdownToTree(DEFAULT_OST_TEMPLATE);
      const md1 = serializeTreeToMarkdown(tree1, tree1.name);
      const tree2 = parseMarkdownToTree(md1);
      const md2 = serializeTreeToMarkdown(tree2, tree2.name);
      expect(md2).toBe(md1);
    });

    for (const example of OST_EXAMPLES) {
      it(`idempotent for "${example.name}"`, () => {
        const tree1 = parseMarkdownToTree(example.markdown);
        const md1 = serializeTreeToMarkdown(tree1, tree1.name);
        const tree2 = parseMarkdownToTree(md1);
        const md2 = serializeTreeToMarkdown(tree2, tree2.name);
        expect(md2).toBe(md1);
      });
    }
  });
});
