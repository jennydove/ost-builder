import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseMarkdownToTree } from '@ost-builder/shared';
import { useOSTStore } from '@/store/ostStore';

const SIMPLE_MD = `# Test Tree

## [Outcome] First Outcome @on-track
Description of outcome

### [Opportunity] First Opportunity @exploring

#### [Solution] First Solution @ideating
`;

function resetStore(markdown?: string) {
  useOSTStore.setState({
    ...useOSTStore.getState(),
    markdown: markdown ?? SIMPLE_MD,
    tree: parseMarkdownToTree(markdown ?? SIMPLE_MD),
    projectName: 'Test Tree',
    selectedCardId: null,
    editingCardId: null,
    canvasState: { zoom: 1, offset: { x: 0, y: 0 } },
    layoutDirection: 'vertical' as const,
    experimentLayout: 'vertical' as const,
    viewDensity: 'full' as const,
    collapsedCardIds: [],
    activeTreeId: null,
    activeIsOwner: false,
    commentCountsByCardId: {},
  }, true);
}

function getState() {
  return useOSTStore.getState();
}

function getRootCards() {
  const s = getState();
  return s.tree.rootIds.map(id => s.tree.cards[id]);
}

function getCardByTitle(title: string) {
  const s = getState();
  return Object.values(s.tree.cards).find(c => c.title === title) ?? null;
}

// ---------- Tier 1: Task 9 critical ----------

describe('ostStore', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('loadFromStoredShare', () => {
    it('sets markdown, tree, projectName from input', () => {
      const md = `# Loaded Share\n\n## [Outcome] Loaded Outcome @achieved\n`;
      getState().loadFromStoredShare({ markdown: md, name: 'Loaded Share' });
      const s = getState();
      expect(s.projectName).toBe('Loaded Share');
      expect(s.markdown).toContain('Loaded Share');
      expect(Object.values(s.tree.cards)).toHaveLength(1);
      expect(Object.values(s.tree.cards)[0].title).toBe('Loaded Outcome');
    });

    it('applies settings and collapsedIds', () => {
      getState().loadFromStoredShare({
        markdown: SIMPLE_MD,
        name: 'Test',
        settings: { layoutDirection: 'horizontal', experimentLayout: 'horizontal', viewDensity: 'compact' },
        collapsedIds: ['card-1', 'card-2'],
      });
      const s = getState();
      expect(s.layoutDirection).toBe('horizontal');
      expect(s.experimentLayout).toBe('horizontal');
      expect(s.viewDensity).toBe('compact');
      expect(s.collapsedCardIds).toEqual(['card-1', 'card-2']);
    });

    it('resets selection state', () => {
      useOSTStore.setState({ selectedCardId: 'some-id', editingCardId: 'some-id' });
      getState().loadFromStoredShare({ markdown: SIMPLE_MD });
      const s = getState();
      expect(s.selectedCardId).toBeNull();
      expect(s.editingCardId).toBeNull();
    });

    it('preserves selection state when payload matches current state', () => {
      const before = getState();
      const treeBefore = before.tree;
      const firstCardId = Object.keys(treeBefore.cards)[0];
      useOSTStore.setState({ selectedCardId: firstCardId, editingCardId: firstCardId });
      getState().loadFromStoredShare({
        markdown: before.markdown,
        name: before.projectName,
        settings: {
          layoutDirection: before.layoutDirection,
          experimentLayout: before.experimentLayout,
          viewDensity: before.viewDensity,
        },
        collapsedIds: before.collapsedCardIds,
      });
      const after = getState();
      expect(after.selectedCardId).toBe(firstCardId);
      expect(after.editingCardId).toBe(firstCardId);
      expect(after.tree).toBe(treeBefore);
    });
  });

  describe('loadFromShareLink', () => {
    it('returns true on valid encoded fragment', () => {
      const link = getState().getShareLink();
      resetStore(`# Empty\n\n## [Outcome] Other\n`);
      const result = getState().loadFromShareLink(link);
      expect(result).toBe(true);
      expect(getState().projectName).toBe('Test Tree');
    });

    it('returns false on empty/invalid input', () => {
      expect(getState().loadFromShareLink('')).toBe(false);
      expect(getState().loadFromShareLink('not-valid')).toBe(false);
    });
  });

  describe('getSharePayload', () => {
    it('returns current state as payload', () => {
      useOSTStore.setState({ collapsedCardIds: ['c1'] });
      const payload = getState().getSharePayload();
      expect(payload.markdown).toBe(getState().markdown);
      expect(payload.name).toBe('Test Tree');
      expect(payload.settings.layoutDirection).toBe('vertical');
      expect(payload.collapsedIds).toEqual(['c1']);
    });
  });

  describe('setMarkdown', () => {
    it('re-parses tree and extracts project name', () => {
      const md = `# New Name\n\n## [Outcome] New Outcome\n`;
      getState().setMarkdown(md);
      const s = getState();
      expect(s.projectName).toBe('New Name');
      expect(Object.values(s.tree.cards)).toHaveLength(1);
      expect(s.selectedCardId).toBeNull();
      expect(s.collapsedCardIds).toEqual([]);
    });
  });

  describe('setActiveCloudContext', () => {
    it('clears comment counts when share changes', () => {
      useOSTStore.setState({ activeTreeId: 'share-1', commentCountsByCardId: { c1: 5 } });
      getState().setActiveCloudContext('share-2', false);
      expect(getState().commentCountsByCardId).toEqual({});
      expect(getState().activeTreeId).toBe('share-2');
    });

    it('preserves comment counts when same share', () => {
      useOSTStore.setState({ activeTreeId: 'share-1', commentCountsByCardId: { c1: 5 } });
      getState().setActiveCloudContext('share-1', true);
      expect(getState().commentCountsByCardId).toEqual({ c1: 5 });
    });

    it('no-ops when share and owner unchanged', () => {
      useOSTStore.setState({ activeTreeId: 'share-1', activeIsOwner: true });
      const before = getState();
      getState().setActiveCloudContext('share-1', true);
      // Should return same reference (no state change)
      expect(getState().activeTreeId).toBe('share-1');
    });
  });

  // ---------- Tier 2: tree mutations ----------

  describe('addCard', () => {
    it('adds a root card with default title', () => {
      const before = Object.keys(getState().tree.cards).length;
      const id = getState().addCard('outcome', null);
      const s = getState();
      expect(Object.keys(s.tree.cards).length).toBe(before + 1);
      expect(s.tree.cards[id].type).toBe('outcome');
      expect(s.tree.cards[id].title).toBe('New Outcome');
      expect(s.tree.cards[id].parentId).toBeNull();
      expect(s.tree.rootIds).toContain(id);
      expect(s.editingCardId).toBe(id);
    });

    it('adds a child card to a parent', () => {
      const outcome = getCardByTitle('First Outcome')!;
      const id = getState().addCard('opportunity', outcome.id, 'Child Opp');
      const s = getState();
      expect(s.tree.cards[id].parentId).toBe(outcome.id);
      expect(s.tree.cards[outcome.id].children).toContain(id);
      expect(s.tree.cards[id].title).toBe('Child Opp');
    });
  });

  describe('updateCard', () => {
    it('updates title and re-serializes markdown', () => {
      const outcome = getCardByTitle('First Outcome')!;
      getState().updateCard(outcome.id, { title: 'Updated Outcome' });
      const s = getState();
      expect(s.tree.cards[outcome.id].title).toBe('Updated Outcome');
      expect(s.markdown).toContain('Updated Outcome');
      expect(s.markdown).not.toContain('First Outcome');
    });

    it('updates status', () => {
      const outcome = getCardByTitle('First Outcome')!;
      getState().updateCard(outcome.id, { status: 'achieved' });
      expect(getState().tree.cards[outcome.id].status).toBe('achieved');
    });
  });

  describe('deleteCard', () => {
    it('removes card and descendants', () => {
      const outcome = getCardByTitle('First Outcome')!;
      const childCount = outcome.children.length;
      const before = Object.keys(getState().tree.cards).length;
      getState().deleteCard(outcome.id);
      const s = getState();
      // outcome + its children + their children all gone
      expect(Object.keys(s.tree.cards).length).toBeLessThan(before);
      expect(s.tree.cards[outcome.id]).toBeUndefined();
      expect(s.tree.rootIds).not.toContain(outcome.id);
    });

    it('clears selectedCardId if deleted card was selected', () => {
      const outcome = getCardByTitle('First Outcome')!;
      useOSTStore.setState({ selectedCardId: outcome.id });
      getState().deleteCard(outcome.id);
      expect(getState().selectedCardId).toBeNull();
    });

    it('preserves selectedCardId if different card deleted', () => {
      const outcome = getCardByTitle('First Outcome')!;
      const opp = getCardByTitle('First Opportunity')!;
      useOSTStore.setState({ selectedCardId: outcome.id });
      getState().deleteCard(opp.id);
      expect(getState().selectedCardId).toBe(outcome.id);
    });
  });

  describe('moveCard', () => {
    it('moves card to a new parent', () => {
      const opp = getCardByTitle('First Opportunity')!;
      const outcome = getCardByTitle('First Outcome')!;
      // Add a second outcome to move the opportunity to
      const newParentId = getState().addCard('outcome', null, 'Second Outcome');
      getState().moveCard(opp.id, newParentId);
      const s = getState();
      expect(s.tree.cards[opp.id].parentId).toBe(newParentId);
      expect(s.tree.cards[newParentId].children).toContain(opp.id);
      expect(s.tree.cards[outcome.id].children).not.toContain(opp.id);
    });

    it('prevents moving card to itself', () => {
      const outcome = getCardByTitle('First Outcome')!;
      const before = getState().tree;
      getState().moveCard(outcome.id, outcome.id);
      expect(getState().tree.rootIds).toEqual(before.rootIds);
    });

    it('prevents moving card to its own descendant', () => {
      const outcome = getCardByTitle('First Outcome')!;
      const sol = getCardByTitle('First Solution')!;
      const before = getState().tree;
      getState().moveCard(outcome.id, sol.id);
      // Should be unchanged
      expect(getState().tree.cards[outcome.id].parentId).toBe(before.cards[outcome.id].parentId);
    });

    it('moves card to root', () => {
      const opp = getCardByTitle('First Opportunity')!;
      getState().moveCard(opp.id, null);
      const s = getState();
      expect(s.tree.cards[opp.id].parentId).toBeNull();
      expect(s.tree.rootIds).toContain(opp.id);
    });
  });

  describe('copyCard', () => {
    it('creates shallow copy with no children', () => {
      const outcome = getCardByTitle('First Outcome')!;
      const copyId = getState().copyCard(outcome.id);
      expect(copyId).not.toBeNull();
      const s = getState();
      const copy = s.tree.cards[copyId!];
      expect(copy.title).toBe(outcome.title);
      expect(copy.type).toBe(outcome.type);
      expect(copy.children).toEqual([]);
      expect(copy.id).not.toBe(outcome.id);
    });

    it('inserts after original in parent children', () => {
      const outcome = getCardByTitle('First Outcome')!;
      const copyId = getState().copyCard(outcome.id)!;
      const s = getState();
      const origIdx = s.tree.rootIds.indexOf(outcome.id);
      const copyIdx = s.tree.rootIds.indexOf(copyId);
      expect(copyIdx).toBe(origIdx + 1);
    });

    it('returns null for nonexistent card', () => {
      expect(getState().copyCard('nonexistent')).toBeNull();
    });
  });

  describe('copyCardWithChildren', () => {
    it('deep copies entire subtree with new IDs', () => {
      const outcome = getCardByTitle('First Outcome')!;
      const before = Object.keys(getState().tree.cards).length;
      const copyId = getState().copyCardWithChildren(outcome.id)!;
      const s = getState();

      // Should have cloned outcome + its descendants
      const descendantCount = 1 + outcome.children.length; // outcome + opp (sol is child of opp)
      expect(Object.keys(s.tree.cards).length).toBeGreaterThan(before);
      expect(s.tree.cards[copyId].title).toBe(outcome.title);
      expect(s.tree.cards[copyId].id).not.toBe(outcome.id);
      // Children should also have new IDs
      expect(s.tree.cards[copyId].children.length).toBe(outcome.children.length);
      for (const childId of s.tree.cards[copyId].children) {
        expect(outcome.children).not.toContain(childId);
      }
    });

    it('returns null for nonexistent card', () => {
      expect(getState().copyCardWithChildren('nonexistent')).toBeNull();
    });
  });

  // ---------- Tier 3: canvas/UI state ----------

  describe('setZoom', () => {
    it('clamps zoom to minimum 0.25', () => {
      getState().setZoom(0.1);
      expect(getState().canvasState.zoom).toBe(0.25);
    });

    it('clamps zoom to maximum 2', () => {
      getState().setZoom(5);
      expect(getState().canvasState.zoom).toBe(2);
    });

    it('accepts values in range', () => {
      getState().setZoom(1.5);
      expect(getState().canvasState.zoom).toBe(1.5);
    });
  });

  describe('setOffset', () => {
    it('updates canvas offset', () => {
      getState().setOffset(100, 200);
      expect(getState().canvasState.offset).toEqual({ x: 100, y: 200 });
    });
  });

  describe('resetTree', () => {
    it('resets all state to defaults', () => {
      // Dirty state
      useOSTStore.setState({
        selectedCardId: 'some-id',
        editingCardId: 'some-id',
        collapsedCardIds: ['c1'],
        canvasState: { zoom: 0.5, offset: { x: 100, y: 200 } },
      });
      getState().resetTree();
      const s = getState();
      expect(s.selectedCardId).toBeNull();
      expect(s.editingCardId).toBeNull();
      expect(s.collapsedCardIds).toEqual([]);
      expect(s.canvasState.zoom).toBe(1);
      expect(s.canvasState.offset).toEqual({ x: 0, y: 0 });
      expect(s.projectName).toBe('My Opportunity Solution Tree');
    });
  });

  describe('createNewTree', () => {
    it('replaces tree with provided markdown', () => {
      const md = `## [Outcome] Brand New\n`;
      getState().createNewTree(md, 'New Project');
      const s = getState();
      expect(s.projectName).toBe('New Project');
      expect(Object.values(s.tree.cards)).toHaveLength(1);
      expect(s.selectedCardId).toBeNull();
    });
  });

  describe('setProjectName', () => {
    it('updates H1 in markdown', () => {
      getState().setProjectName('Renamed Project');
      expect(getState().projectName).toBe('Renamed Project');
      expect(getState().markdown.startsWith('# Renamed Project')).toBe(true);
    });

    it('falls back to default on empty name', () => {
      getState().setProjectName('');
      expect(getState().projectName).toBe('My Opportunity Solution Tree');
    });
  });

  describe('toggleCollapsedCard', () => {
    it('adds card to collapsed list', () => {
      getState().toggleCollapsedCard('c1');
      expect(getState().collapsedCardIds).toContain('c1');
    });

    it('removes card from collapsed list on second toggle', () => {
      getState().toggleCollapsedCard('c1');
      getState().toggleCollapsedCard('c1');
      expect(getState().collapsedCardIds).not.toContain('c1');
    });
  });

  describe('comment counts', () => {
    it('setCommentCounts replaces all counts', () => {
      getState().setCommentCounts({ a: 3, b: 5 });
      expect(getState().commentCountsByCardId).toEqual({ a: 3, b: 5 });
    });

    it('incrementCommentCount adds 1', () => {
      getState().setCommentCounts({ a: 3 });
      getState().incrementCommentCount('a');
      expect(getState().commentCountsByCardId.a).toBe(4);
    });

    it('incrementCommentCount starts from 0 for new card', () => {
      getState().incrementCommentCount('new-card');
      expect(getState().commentCountsByCardId['new-card']).toBe(1);
    });

    it('decrementCommentCount subtracts 1', () => {
      getState().setCommentCounts({ a: 3 });
      getState().decrementCommentCount('a');
      expect(getState().commentCountsByCardId.a).toBe(2);
    });

    it('decrementCommentCount removes key at 0', () => {
      getState().setCommentCounts({ a: 1 });
      getState().decrementCommentCount('a');
      expect(getState().commentCountsByCardId.a).toBeUndefined();
    });

    it('decrementCommentCount does not go below 0', () => {
      getState().decrementCommentCount('nonexistent');
      expect(getState().commentCountsByCardId['nonexistent']).toBeUndefined();
    });
  });
});
