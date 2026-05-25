import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { parseMarkdownToTree } from '@ost-builder/shared';
import { createCanvasSlice, type CanvasSlice } from './slices/canvasSlice';
import { createCardSlice, type CardSlice } from './slices/cardSlice';
import { createCommentSlice, type CommentSlice } from './slices/commentSlice';
import { createTreeSlice, type TreeSlice, defaultProjectName } from './slices/treeSlice';

export type OSTStore = CanvasSlice & CardSlice & CommentSlice & TreeSlice;

export const useOSTStore = create<OSTStore>()(
  persist(
    (...a) => ({
      ...createCanvasSlice(...a),
      ...createCardSlice(...a),
      ...createCommentSlice(...a),
      ...createTreeSlice(...a),
    }),
    {
      name: 'ost-storage',
      partialize: (state) => ({
        markdown: state.markdown,
        projectName: state.projectName,
        layoutDirection: state.layoutDirection,
        experimentLayout: state.experimentLayout,
        viewDensity: state.viewDensity,
        collapsedCardIds: state.collapsedCardIds,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && state.markdown) {
          state.tree = parseMarkdownToTree(state.markdown);
        }
        if (state && !state.projectName) {
          state.projectName = defaultProjectName;
        }
      },
    },
  ),
);
