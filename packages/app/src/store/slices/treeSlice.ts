import type { StateCreator } from 'zustand';
import {
  parseMarkdownToTree,
  serializeTreeToMarkdown,
  createDefaultMarkdown,
  encodeMarkdownToUrlFragment,
  decodeMarkdownFromUrlFragment,
} from '@ost-builder/shared';
import type { ShareSettings } from '@ost-builder/shared';
import type { OSTStore } from '../ostStore';

export const defaultProjectName = 'My Opportunity Solution Tree';

export const applyProjectNameToMarkdown = (markdown: string, name: string) => {
  const safeName = name.trim() || defaultProjectName;
  const lines = markdown.split('\n');
  const hasHeading = lines[0]?.startsWith('# ');
  if (hasHeading) {
    lines[0] = `# ${safeName}`;
    return lines.join('\n');
  }
  return [`# ${safeName}`, '', markdown].join('\n').trimStart();
};

const extractProjectNameFromMarkdown = (markdown: string) => {
  const firstLine = markdown.split('\n')[0]?.trim() || '';
  if (firstLine.startsWith('# ')) {
    const name = firstLine.slice(2).trim();
    return name || defaultProjectName;
  }
  return defaultProjectName;
};

export interface TreeSlice {
  markdown: string;
  projectName: string;

  setProjectName: (name: string) => void;
  resetTree: () => void;
  createNewTree: (markdown: string, name?: string) => void;
  getMarkdown: () => string;
  setMarkdown: (markdown: string) => void;
  getShareLink: () => string;
  getSharePayload: () => {
    markdown: string;
    name: string;
    settings: ShareSettings;
    collapsedIds: string[];
  };
  loadFromShareLink: (urlOrFragment: string) => boolean;
  loadFromStoredShare: (input: {
    markdown: string;
    name?: string;
    settings?: ShareSettings;
    collapsedIds?: string[];
  }) => void;
}

export const createTreeSlice: StateCreator<OSTStore, [], [], TreeSlice> = (set, get) => {
  const defaultMarkdown = createDefaultMarkdown();

  return {
    markdown: defaultMarkdown,
    projectName: defaultProjectName,

    setProjectName: (name) =>
      set((state) => {
        const nextName = name.trim() || defaultProjectName;
        const nextMarkdown = applyProjectNameToMarkdown(state.markdown, nextName);
        return {
          projectName: nextName,
          markdown: nextMarkdown,
          tree: parseMarkdownToTree(nextMarkdown),
        };
      }),

    resetTree: () => {
      const newMarkdown = createDefaultMarkdown();
      set({
        markdown: newMarkdown,
        tree: parseMarkdownToTree(newMarkdown),
        selectedCardId: null,
        editingCardId: null,
        canvasState: { zoom: 1, offset: { x: 0, y: 0 } },
        projectName: defaultProjectName,
        collapsedCardIds: [],
      });
    },

    createNewTree: (markdown, name) => {
      const nextName = name?.trim() || defaultProjectName;
      const nextMarkdown = applyProjectNameToMarkdown(markdown, nextName);
      set({
        markdown: nextMarkdown,
        tree: parseMarkdownToTree(nextMarkdown),
        projectName: nextName,
        selectedCardId: null,
        editingCardId: null,
        canvasState: { zoom: 1, offset: { x: 0, y: 0 } },
        collapsedCardIds: [],
      });
    },

    getMarkdown: () => get().markdown,

    getShareLink: () => {
      const fragment = encodeMarkdownToUrlFragment(
        get().markdown,
        get().projectName,
        {
          layoutDirection: get().layoutDirection,
          experimentLayout: get().experimentLayout,
          viewDensity: get().viewDensity,
        },
        get().collapsedCardIds,
      );
      if (typeof window !== 'undefined') {
        const base = `${window.location.origin}${window.location.pathname}`;
        return `${base}#${fragment}`;
      }
      return `#${fragment}`;
    },

    getSharePayload: () => ({
      markdown: get().markdown,
      name: get().projectName,
      settings: {
        layoutDirection: get().layoutDirection,
        experimentLayout: get().experimentLayout,
        viewDensity: get().viewDensity,
      },
      collapsedIds: get().collapsedCardIds,
    }),

    loadFromShareLink: (urlOrFragment: string) => {
      const fragment = (() => {
        const trimmed = (urlOrFragment || '').trim();
        if (!trimmed) return '';
        const hashIdx = trimmed.indexOf('#');
        if (hashIdx >= 0) return trimmed.slice(hashIdx + 1);
        return trimmed;
      })();

      const decoded = decodeMarkdownFromUrlFragment(fragment);
      if (!decoded) return false;

      const rawMarkdown = decoded.markdown;
      const nextName = decoded.name || defaultProjectName;
      const nextMarkdown = applyProjectNameToMarkdown(rawMarkdown, nextName);

      set({
        markdown: nextMarkdown,
        tree: parseMarkdownToTree(nextMarkdown),
        projectName: nextName,
        layoutDirection: decoded.settings?.layoutDirection ?? get().layoutDirection,
        experimentLayout: decoded.settings?.experimentLayout ?? get().experimentLayout,
        viewDensity: decoded.settings?.viewDensity ?? get().viewDensity,
        collapsedCardIds: decoded.collapsedIds ?? [],
        selectedCardId: null,
        editingCardId: null,
      });

      return true;
    },

    loadFromStoredShare: (input) => {
      const rawMarkdown = input.markdown || '';
      const nextName = input.name || defaultProjectName;
      const nextMarkdown = applyProjectNameToMarkdown(rawMarkdown, nextName);

      set({
        markdown: nextMarkdown,
        tree: parseMarkdownToTree(nextMarkdown),
        projectName: nextName,
        layoutDirection: input.settings?.layoutDirection ?? get().layoutDirection,
        experimentLayout: input.settings?.experimentLayout ?? get().experimentLayout,
        viewDensity: input.settings?.viewDensity ?? get().viewDensity,
        collapsedCardIds: input.collapsedIds ?? [],
        selectedCardId: null,
        editingCardId: null,
      });
    },

    setMarkdown: (markdown: string) => {
      set({
        markdown,
        tree: parseMarkdownToTree(markdown),
        projectName: extractProjectNameFromMarkdown(markdown),
        selectedCardId: null,
        editingCardId: null,
        collapsedCardIds: [],
      });
    },
  };
};
