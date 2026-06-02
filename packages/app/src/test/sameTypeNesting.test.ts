import { describe, it, expect } from 'vitest';
import { parseMarkdownToTree, serializeTreeToMarkdown } from '@ost-builder/shared';

describe('same-type nesting (sub-opportunities, sub-solutions, etc.)', () => {
  it('serializes an opportunity-under-opportunity with an explicit {^parentId} marker', () => {
    // Build a tree by parsing a flat structure, then move an opportunity
    // under a sibling to create same-type nesting.
    const tree = parseMarkdownToTree(
      [
        '# Tree',
        '',
        '## [Outcome] Goal {#out1}',
        '',
        '### [Opportunity] A {#opp-a}',
        '',
        '### [Opportunity] B {#opp-b}',
        '',
      ].join('\n'),
    );

    // Move B under A in memory (mimics what cardSlice.moveCard does).
    tree.cards['out1'].children = tree.cards['out1'].children.filter((id) => id !== 'opp-b');
    tree.cards['opp-a'].children.push('opp-b');
    tree.cards['opp-b'].parentId = 'opp-a';

    const md = serializeTreeToMarkdown(tree, 'Tree');

    expect(md).toContain('{^opp-a}');
    // A round-trip preserves the structure.
    const reparsed = parseMarkdownToTree(md);
    expect(reparsed.cards['opp-b'].parentId).toBe('opp-a');
    expect(reparsed.cards['opp-a'].children).toContain('opp-b');
    expect(reparsed.cards['out1'].children).not.toContain('opp-b');
  });

  it('does NOT emit {^parentId} when the heading-level hierarchy already matches', () => {
    const tree = parseMarkdownToTree(
      [
        '# Tree',
        '',
        '## [Outcome] Goal {#out1}',
        '',
        '### [Opportunity] A {#opp-a}',
        '',
        '#### [Solution] S {#sol-1}',
        '',
      ].join('\n'),
    );
    const md = serializeTreeToMarkdown(tree, 'Tree');
    expect(md).not.toContain('{^');
  });

  it('preserves siblings under a sub-opportunity through a round-trip', () => {
    // Outcome → A → [A1, A2, A3 (all sub-opportunities of A)]
    const md = [
      '# Tree',
      '',
      '## [Outcome] Goal {#out1}',
      '',
      '### [Opportunity] A {#a}',
      '',
      '### [Opportunity] A1 {#a1} {^a}',
      '',
      '### [Opportunity] A2 {#a2} {^a}',
      '',
      '### [Opportunity] A3 {#a3} {^a}',
      '',
    ].join('\n');
    const tree = parseMarkdownToTree(md);

    expect(tree.cards['a'].children).toEqual(['a1', 'a2', 'a3']);
    expect(tree.cards['a1'].parentId).toBe('a');
    expect(tree.cards['a2'].parentId).toBe('a');
    expect(tree.cards['a3'].parentId).toBe('a');

    // Round-trip is stable.
    const md2 = serializeTreeToMarkdown(tree, tree.name);
    const reparsed = parseMarkdownToTree(md2);
    expect(reparsed.cards['a'].children).toEqual(['a1', 'a2', 'a3']);
  });

  it('mixes regular hierarchy with sub-opportunity nesting in one tree', () => {
    // Outcome → A → [Solution S, A1 (sub-opp), A2 (sub-opp)]
    // A1 also has its own solution.
    const md = [
      '# Tree',
      '',
      '## [Outcome] Goal {#out1}',
      '',
      '### [Opportunity] A {#a}',
      '',
      '#### [Solution] S {#s1}',
      '',
      '### [Opportunity] A1 {#a1} {^a}',
      '',
      '#### [Solution] S2 {#s2}',
      '',
      '### [Opportunity] A2 {#a2} {^a}',
      '',
    ].join('\n');
    const tree = parseMarkdownToTree(md);

    expect(tree.cards['a'].children).toEqual(['s1', 'a1', 'a2']);
    expect(tree.cards['a1'].children).toEqual(['s2']);
    expect(tree.cards['a2'].children).toEqual([]);
    expect(tree.cards['s2'].parentId).toBe('a1');

    const reparsed = parseMarkdownToTree(serializeTreeToMarkdown(tree, tree.name));
    expect(reparsed.cards['a'].children).toEqual(['s1', 'a1', 'a2']);
    expect(reparsed.cards['s2'].parentId).toBe('a1');
  });

  it('falls back to heading-level inference when {^parentId} references an unknown card', () => {
    const md = [
      '# Tree',
      '',
      '## [Outcome] Goal {#out1}',
      '',
      '### [Opportunity] A {#a} {^nonexistent}',
      '',
    ].join('\n');
    const tree = parseMarkdownToTree(md);
    // Should fall back to the outcome as parent rather than orphaning.
    expect(tree.cards['a'].parentId).toBe('out1');
  });
});
