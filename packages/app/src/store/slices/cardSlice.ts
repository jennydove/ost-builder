import type { StateCreator } from 'zustand';
import { nanoid } from 'nanoid';
import type { OSTCard, OSTTree, CardType } from '@ost-builder/shared';
import { serializeTreeToMarkdown } from '@ost-builder/shared';
import type { OSTStore } from '../ostStore';

export interface CardSlice {
  tree: OSTTree;
  selectedCardId: string | null;
  editingCardId: string | null;

  addCard: (type: CardType, parentId: string | null, title?: string) => string;
  updateCard: (id: string, updates: Partial<OSTCard>) => void;
  deleteCard: (id: string) => void;
  moveCard: (cardId: string, newParentId: string | null) => void;
  copyCard: (cardId: string) => string | null;
  copyCardWithChildren: (cardId: string) => string | null;
  selectCard: (id: string | null) => void;
  setEditingCard: (id: string | null) => void;
}

export const createCardSlice: StateCreator<OSTStore, [], [], CardSlice> = (set, get) => ({
  tree: { id: '', name: '', cards: {}, rootIds: [] },
  selectedCardId: null,
  editingCardId: null,

  addCard: (type, parentId, title) => {
    const id = nanoid();
    const defaultTitles: Record<CardType, string> = {
      outcome: 'New Outcome',
      opportunity: 'New Opportunity',
      solution: 'New Solution',
      experiment: 'New Experiment',
    };

    set((state) => {
      const newCard: OSTCard = {
        id,
        type,
        title: title || defaultTitles[type],
        status: 'none',
        parentId,
        children: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const cards = { ...state.tree.cards, [id]: newCard };

      if (parentId && state.tree.cards[parentId]) {
        cards[parentId] = {
          ...state.tree.cards[parentId],
          children: [...state.tree.cards[parentId].children, id],
        };
      }

      const rootIds = parentId ? state.tree.rootIds : [...state.tree.rootIds, id];
      const newTree = { ...state.tree, cards, rootIds };

      return {
        tree: newTree,
        markdown: serializeTreeToMarkdown(newTree, state.projectName),
        editingCardId: id,
      };
    });

    return id;
  },

  updateCard: (id, updates) => {
    set((state) => {
      const newTree = {
        ...state.tree,
        cards: {
          ...state.tree.cards,
          [id]: { ...state.tree.cards[id], ...updates, updatedAt: new Date() },
        },
      };
      return {
        tree: newTree,
        markdown: serializeTreeToMarkdown(newTree, state.projectName),
      };
    });
  },

  deleteCard: (id) => {
    set((state) => {
      const card = state.tree.cards[id];
      if (!card) return state;

      const getDescendants = (cardId: string): string[] => {
        const c = state.tree.cards[cardId];
        if (!c) return [];
        return [cardId, ...c.children.flatMap(getDescendants)];
      };

      const toDelete = new Set(getDescendants(id));
      const cards = { ...state.tree.cards };

      if (card.parentId && cards[card.parentId]) {
        cards[card.parentId] = {
          ...cards[card.parentId],
          children: cards[card.parentId].children.filter((cid) => cid !== id),
        };
      }

      toDelete.forEach((cid) => delete cards[cid]);
      const rootIds = state.tree.rootIds.filter((rid) => !toDelete.has(rid));
      const newTree = { ...state.tree, cards, rootIds };

      return {
        tree: newTree,
        markdown: serializeTreeToMarkdown(newTree, state.projectName),
        selectedCardId:
          state.selectedCardId && toDelete.has(state.selectedCardId) ? null : state.selectedCardId,
      };
    });
  },

  moveCard: (cardId, newParentId) => {
    set((state) => {
      const card = state.tree.cards[cardId];
      if (!card) return state;

      const isDescendant = (parentId: string, childId: string): boolean => {
        const parent = state.tree.cards[parentId];
        if (!parent) return false;
        if (parent.children.includes(childId)) return true;
        return parent.children.some((cid) => isDescendant(cid, childId));
      };

      if (newParentId && (newParentId === cardId || isDescendant(cardId, newParentId))) {
        return state;
      }

      const cards = { ...state.tree.cards };

      if (card.parentId && cards[card.parentId]) {
        cards[card.parentId] = {
          ...cards[card.parentId],
          children: cards[card.parentId].children.filter((cid) => cid !== cardId),
        };
      }

      if (newParentId && cards[newParentId]) {
        cards[newParentId] = {
          ...cards[newParentId],
          children: [...cards[newParentId].children, cardId],
        };
      }

      cards[cardId] = { ...cards[cardId], parentId: newParentId, updatedAt: new Date() };

      let rootIds = state.tree.rootIds.filter((rid) => rid !== cardId);
      if (!newParentId) rootIds = [...rootIds, cardId];

      const newTree = { ...state.tree, cards, rootIds };

      return {
        tree: newTree,
        markdown: serializeTreeToMarkdown(newTree, state.projectName),
      };
    });
  },

  copyCard: (cardId) => {
    const state = get();
    const original = state.tree.cards[cardId];
    if (!original) return null;

    const id = nanoid();
    const copied: OSTCard = {
      ...original,
      id,
      children: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const cards = { ...state.tree.cards, [id]: copied };
    let rootIds = [...state.tree.rootIds];

    if (original.parentId && cards[original.parentId]) {
      const siblings = cards[original.parentId].children;
      const insertIndex = Math.max(0, siblings.indexOf(original.id) + 1);
      const nextChildren = [...siblings];
      nextChildren.splice(insertIndex, 0, id);
      cards[original.parentId] = { ...cards[original.parentId], children: nextChildren };
    } else {
      const insertIndex = Math.max(0, rootIds.indexOf(original.id) + 1);
      rootIds.splice(insertIndex, 0, id);
    }

    const newTree = { ...state.tree, cards, rootIds };
    set({ tree: newTree, markdown: serializeTreeToMarkdown(newTree, state.projectName) });
    return id;
  },

  copyCardWithChildren: (cardId) => {
    const state = get();
    const original = state.tree.cards[cardId];
    if (!original) return null;

    const cards = { ...state.tree.cards };

    const cloneSubtree = (sourceId: string, parentId: string | null): string => {
      const source = state.tree.cards[sourceId];
      const id = nanoid();
      const cloned: OSTCard = {
        ...source,
        id,
        parentId,
        children: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      cards[id] = cloned;
      cloned.children = source.children.map((childId) => cloneSubtree(childId, id));
      return id;
    };

    const newRootId = cloneSubtree(original.id, original.parentId);
    let rootIds = [...state.tree.rootIds];

    if (original.parentId && cards[original.parentId]) {
      const siblings = cards[original.parentId].children;
      const insertIndex = Math.max(0, siblings.indexOf(original.id) + 1);
      const nextChildren = [...siblings];
      nextChildren.splice(insertIndex, 0, newRootId);
      cards[original.parentId] = { ...cards[original.parentId], children: nextChildren };
    } else {
      const insertIndex = Math.max(0, rootIds.indexOf(original.id) + 1);
      rootIds.splice(insertIndex, 0, newRootId);
    }

    const newTree = { ...state.tree, cards, rootIds };
    set({ tree: newTree, markdown: serializeTreeToMarkdown(newTree, state.projectName) });
    return newRootId;
  },

  selectCard: (id) => set({ selectedCardId: id }),
  setEditingCard: (id) => set({ editingCardId: id }),
});
