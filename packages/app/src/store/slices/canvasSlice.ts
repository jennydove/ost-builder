import type { StateCreator } from 'zustand';
import type { CanvasState, LayoutDirection } from '@ost-builder/shared';
import type { OSTStore } from '../ostStore';

export interface CanvasSlice {
  canvasState: CanvasState;
  layoutDirection: LayoutDirection;
  experimentLayout: 'horizontal' | 'vertical';
  viewDensity: 'full' | 'compact';
  collapsedCardIds: string[];

  setZoom: (zoom: number) => void;
  setOffset: (x: number, y: number) => void;
  setLayoutDirection: (direction: LayoutDirection) => void;
  toggleLayoutDirection: () => void;
  setExperimentLayout: (layout: 'horizontal' | 'vertical') => void;
  setViewDensity: (density: 'full' | 'compact') => void;
  toggleCollapsedCard: (cardId: string) => void;
  setCollapsedCards: (cardIds: string[]) => void;
}

export const createCanvasSlice: StateCreator<OSTStore, [], [], CanvasSlice> = (set) => ({
  canvasState: { zoom: 1, offset: { x: 0, y: 0 } },
  layoutDirection: 'vertical',
  experimentLayout: 'vertical',
  viewDensity: 'full',
  collapsedCardIds: [],

  setZoom: (zoom) =>
    set((state) => ({
      canvasState: { ...state.canvasState, zoom: Math.max(0.25, Math.min(2, zoom)) },
    })),

  setOffset: (x, y) =>
    set((state) => ({
      canvasState: { ...state.canvasState, offset: { x, y } },
    })),

  setLayoutDirection: (direction) => set({ layoutDirection: direction }),

  toggleLayoutDirection: () =>
    set((state) => ({
      layoutDirection: state.layoutDirection === 'vertical' ? 'horizontal' : 'vertical',
    })),

  setExperimentLayout: (layout) => set({ experimentLayout: layout }),
  setViewDensity: (density) => set({ viewDensity: density }),

  toggleCollapsedCard: (cardId) =>
    set((state) => {
      const exists = state.collapsedCardIds.includes(cardId);
      return {
        collapsedCardIds: exists
          ? state.collapsedCardIds.filter((id) => id !== cardId)
          : [...state.collapsedCardIds, cardId],
      };
    }),

  setCollapsedCards: (cardIds) => set({ collapsedCardIds: cardIds }),
});
