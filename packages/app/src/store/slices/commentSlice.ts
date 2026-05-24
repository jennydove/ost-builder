import type { StateCreator } from 'zustand';
import type { OSTStore } from '../ostStore';

export interface CommentSlice {
  activeCloudShareId: string | null;
  activeIsOwner: boolean;
  commentCountsByCardId: Record<string, number>;

  setActiveCloudContext: (shareId: string | null, isOwner: boolean) => void;
  setCommentCounts: (counts: Record<string, number>) => void;
  incrementCommentCount: (cardId: string) => void;
  decrementCommentCount: (cardId: string) => void;
}

export const createCommentSlice: StateCreator<OSTStore, [], [], CommentSlice> = (set) => ({
  activeCloudShareId: null,
  activeIsOwner: false,
  commentCountsByCardId: {},

  setActiveCloudContext: (shareId, isOwner) => {
    set((state) => {
      if (state.activeCloudShareId === shareId && state.activeIsOwner === isOwner) {
        return state;
      }
      return {
        activeCloudShareId: shareId,
        activeIsOwner: isOwner,
        commentCountsByCardId: shareId === state.activeCloudShareId ? state.commentCountsByCardId : {},
      };
    });
  },

  setCommentCounts: (counts) => set({ commentCountsByCardId: counts }),

  incrementCommentCount: (cardId) =>
    set((state) => ({
      commentCountsByCardId: {
        ...state.commentCountsByCardId,
        [cardId]: (state.commentCountsByCardId[cardId] ?? 0) + 1,
      },
    })),

  decrementCommentCount: (cardId) =>
    set((state) => {
      const next = Math.max(0, (state.commentCountsByCardId[cardId] ?? 0) - 1);
      const updated = { ...state.commentCountsByCardId };
      if (next === 0) delete updated[cardId];
      else updated[cardId] = next;
      return { commentCountsByCardId: updated };
    }),
});
