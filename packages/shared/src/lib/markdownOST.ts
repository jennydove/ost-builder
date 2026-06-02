import { nanoid } from 'nanoid';
import type { OSTCard, OSTTree, CardType, CardStatus } from '../types/ost.js';
import { DEFAULT_OST_TEMPLATE } from './ostExamples.js';
import { encodeStringToUrlFragment, decodeStringFromUrlFragment } from './urlEncoding.js';

/**
 * Markdown OST Format:
 *
 * ## [Outcome] Title @status
 * Description text here
 * - start: 0
 * - current: 28
 * - target: 40
 *
 * ### [Opportunity] Title @status
 * Description text here
 *
 * #### [Solution] Title @status
 * Description text here
 *
 * ##### [Experiment] Title @status
 * Description text here
 */

const TYPE_PREFIXES: Record<CardType, string> = {
  outcome: '[Outcome]',
  opportunity: '[Opportunity]',
  solution: '[Solution]',
  experiment: '[Experiment]',
};

const HEADING_LEVELS: Record<CardType, number> = {
  outcome: 2,
  opportunity: 3,
  solution: 4,
  experiment: 5,
};

const LEVEL_TYPES: Record<number, CardType> = {
  2: 'outcome',
  3: 'opportunity',
  4: 'solution',
  5: 'experiment',
};

const STATUS_MAP: Record<string, CardStatus> = {
  'on-track': 'on-track',
  'at-risk': 'at-risk',
  achieved: 'achieved',
  exploring: 'exploring',
  validated: 'validated',
  prioritized: 'prioritized',
  deprioritized: 'deprioritized',
  ideating: 'ideating',
  testing: 'testing',
  dropped: 'dropped',
  planned: 'planned',
  running: 'running',
  complete: 'complete',
  next: 'next',
  done: 'done',
  none: 'none',
};

interface ParsedCard {
  id: string;
  explicitId: string | null;
  explicitParentId: string | null;
  type: CardType;
  title: string;
  description?: string;
  status: CardStatus;
  metrics?: {
    start: number;
    current: number;
    target: number;
  };
  level: number;
}

function parseHeadingLine(line: string): { level: number; content: string } | null {
  const match = line.match(/^(#{1,6})\s+(.+)$/);
  if (!match) return null;
  return { level: match[1].length, content: match[2] };
}

function parseCardHeading(
  content: string,
  level: number,
): Omit<ParsedCard, 'level' | 'description' | 'metrics'> | null {
  // Match: [Type] Title @status or [Type] Title (legacy {#id} is ignored)
  const typeMatch = content.match(/^\[(Outcome|Opportunity|Solution|Experiment)\]\s+/i);
  let type: CardType | null = null;
  let remaining = content;

  if (typeMatch) {
    type = typeMatch[1].toLowerCase() as CardType;
    remaining = content.slice(typeMatch[0].length);
  } else if (LEVEL_TYPES[level]) {
    type = LEVEL_TYPES[level];
  } else {
    return null;
  }

  // Capture explicit stable ID if present (e.g. `{#abc12345}`)
  let explicitId: string | null = null;
  const idMatch = remaining.match(/\{#([a-zA-Z0-9_-]+)\}/);
  if (idMatch) {
    explicitId = idMatch[1];
    remaining = remaining.replace(idMatch[0], '').trim();
  }

  // Capture explicit parent reference if present (e.g. `{^abc12345}`).
  // Used when heading-level inference can't represent the actual hierarchy —
  // e.g. an opportunity nested under another opportunity (both at H3).
  let explicitParentId: string | null = null;
  const parentMatch = remaining.match(/\{\^([a-zA-Z0-9_-]+)\}/);
  if (parentMatch) {
    explicitParentId = parentMatch[1];
    remaining = remaining.replace(parentMatch[0], '').trim();
  }

  // Extract status if present
  let status: CardStatus = 'none';
  const statusMatch = remaining.match(/@(on-track|at-risk|achieved|exploring|validated|prioritized|deprioritized|ideating|testing|dropped|planned|running|complete|next|done|none)$/i);
  if (statusMatch) {
    status = STATUS_MAP[statusMatch[1].toLowerCase()] || 'none';
    remaining = remaining.replace(statusMatch[0], '').trim();
  }

  const title = remaining.trim() || `New ${type.charAt(0).toUpperCase() + type.slice(1)}`;

  return {
    id: '',
    explicitId,
    explicitParentId,
    type,
    title,
    status,
  };
}

function parseMetrics(
  lines: string[],
): { start: number; current: number; target: number } | undefined {
  const metrics: { start?: number; current?: number; target?: number } = {};

  for (const line of lines) {
    const startMatch = line.match(/^-\s*start:\s*(\d+(?:\.\d+)?)/i);
    const currentMatch = line.match(/^-\s*current:\s*(\d+(?:\.\d+)?)/i);
    const targetMatch = line.match(/^-\s*target:\s*(\d+(?:\.\d+)?)/i);

    if (startMatch) metrics.start = parseFloat(startMatch[1]);
    if (currentMatch) metrics.current = parseFloat(currentMatch[1]);
    if (targetMatch) metrics.target = parseFloat(targetMatch[1]);
  }

  if (
    metrics.start !== undefined ||
    metrics.current !== undefined ||
    metrics.target !== undefined
  ) {
    return {
      start: metrics.start ?? 0,
      current: metrics.current ?? 0,
      target: metrics.target ?? 0,
    };
  }

  return undefined;
}

export function parseMarkdownToTree(markdown: string): OSTTree {
  const lines = markdown.split('\n');
  const tree: OSTTree = {
    id: nanoid(),
    name: 'My Opportunity Solution Tree',
    cards: {},
    rootIds: [],
  };

  // Pass 1: collect parsed-card data in source order, with inferred parent
  // (from heading-level stack) and any explicit `{^parentId}` ref.
  type Collected = {
    id: string;
    type: CardType;
    title: string;
    description?: string;
    status: CardStatus;
    metrics?: { start: number; current: number; target: number };
    inferredParentId: string | null;
    explicitParentId: string | null;
  };
  const collected: Collected[] = [];
  const parentStack: { id: string; level: number }[] = [];
  const seenIds = new Set<string>();
  let currentCard: ParsedCard | null = null;
  let contentLines: string[] = [];

  const finalizeCard = () => {
    if (!currentCard) return;

    const descriptionLines = contentLines.filter(
      (line) => !line.match(/^-\s*(start|current|target):/i),
    );
    const metricsLines = contentLines.filter((line) => line.match(/^-\s*(start|current|target):/i));

    const description = descriptionLines.join('\n').trim() || undefined;
    const metrics = currentCard.type === 'outcome' ? parseMetrics(metricsLines) : undefined;

    while (
      parentStack.length > 0 &&
      parentStack[parentStack.length - 1].level >= currentCard.level
    ) {
      parentStack.pop();
    }
    const parentEntry = parentStack.length > 0 ? parentStack[parentStack.length - 1] : null;
    const inferredParentId = parentEntry ? parentEntry.id : null;

    let id = currentCard.explicitId;
    if (!id || seenIds.has(id)) {
      do {
        id = nanoid(8);
      } while (seenIds.has(id));
    }
    seenIds.add(id);

    collected.push({
      id,
      type: currentCard.type,
      title: currentCard.title,
      description,
      status: currentCard.status,
      metrics,
      inferredParentId,
      explicitParentId: currentCard.explicitParentId,
    });

    parentStack.push({ id, level: currentCard.level });
    currentCard = null;
    contentLines = [];
  };

  for (const line of lines) {
    const heading = parseHeadingLine(line);

    if (heading) {
      const cardInfo = parseCardHeading(heading.content, heading.level);
      if (cardInfo) {
        finalizeCard();
        currentCard = { ...cardInfo, level: heading.level };
      }
    } else if (currentCard) {
      contentLines.push(line);
    }
  }
  finalizeCard();

  // Pass 2: build the tree. Explicit `{^...}` ref wins when it points to a
  // known card; otherwise fall back to heading-level inference (also covers
  // forward refs to missing parents — better than orphaning the card).
  const validIds = new Set(collected.map((c) => c.id));
  for (const c of collected) {
    const resolvedParent =
      c.explicitParentId && validIds.has(c.explicitParentId)
        ? c.explicitParentId
        : c.inferredParentId;

    const card: OSTCard = {
      id: c.id,
      type: c.type,
      title: c.title,
      description: c.description,
      status: c.status,
      parentId: resolvedParent,
      children: [],
      metrics: c.metrics,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    tree.cards[c.id] = card;
  }

  for (const c of collected) {
    const card = tree.cards[c.id];
    if (card.parentId && tree.cards[card.parentId]) {
      tree.cards[card.parentId].children.push(card.id);
    } else {
      card.parentId = null;
      tree.rootIds.push(card.id);
    }
  }

  return tree;
}

export function serializeTreeToMarkdown(tree: OSTTree, name?: string): string {
  const lines: string[] = [];
  if (name) {
    lines.push(`# ${name}`);
    lines.push('');
  }

  // Mirror the parser's heading-level inference so we can detect when the
  // tree's actual parent link wouldn't survive a round-trip via heading
  // levels alone. In those cases — typically same-type nesting like an
  // opportunity under another opportunity — emit an explicit `{^parentId}`.
  const inferenceStack: { id: string; level: number }[] = [];

  const serializeCard = (cardId: string) => {
    const card = tree.cards[cardId];
    if (!card) return;

    const level = HEADING_LEVELS[card.type];
    while (
      inferenceStack.length > 0 &&
      inferenceStack[inferenceStack.length - 1].level >= level
    ) {
      inferenceStack.pop();
    }
    const inferredParentId =
      inferenceStack.length > 0 ? inferenceStack[inferenceStack.length - 1].id : null;

    const prefix = TYPE_PREFIXES[card.type];
    const idSuffix = card.id ? ` {#${card.id}}` : '';
    const parentSuffix =
      card.parentId && card.parentId !== inferredParentId ? ` {^${card.parentId}}` : '';
    const statusSuffix = card.status && card.status !== 'none' ? ` @${card.status}` : '';
    const heading = `${'#'.repeat(level)} ${prefix} ${card.title}${idSuffix}${parentSuffix}${statusSuffix}`;

    lines.push(heading);

    if (card.description) {
      lines.push(card.description);
    }

    if (card.type === 'outcome' && card.metrics) {
      lines.push(`- start: ${card.metrics.start}`);
      lines.push(`- current: ${card.metrics.current}`);
      lines.push(`- target: ${card.metrics.target}`);
    }

    lines.push('');

    inferenceStack.push({ id: card.id, level });

    for (const childId of card.children) {
      serializeCard(childId);
    }
  };

  for (const rootId of tree.rootIds) {
    serializeCard(rootId);
  }

  return lines.join('\n');
}

export function createDefaultMarkdown(): string {
  return DEFAULT_OST_TEMPLATE;
}

/**
 * Share-link helpers
 *
 * Encodes markdown into a URL-safe fragment string.
 * We use base64url over UTF-8. (No compression; keeps deps at zero.)
 *
 * Typical use: `${location.pathname}#${encodeMarkdownToUrlFragment(markdown, name)}`
 */
export type ShareSettings = {
  layoutDirection?: 'vertical' | 'horizontal';
  experimentLayout?: 'horizontal' | 'vertical';
  viewDensity?: 'full' | 'compact';
};

type EncodedSettings = string;

const encodeCollapsedIds = (ids?: string[]): string | undefined => {
  if (!ids || ids.length === 0) return undefined;
  return ids.join('.');
};

const decodeCollapsedIds = (value?: string): string[] | undefined => {
  if (!value || typeof value !== 'string') return undefined;
  const ids = value
    .split('.')
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length ? ids : undefined;
};

const encodeSettings = (settings?: ShareSettings): EncodedSettings | undefined => {
  if (!settings) return undefined;
  const layout =
    settings.layoutDirection === 'horizontal'
      ? 'h'
      : settings.layoutDirection === 'vertical'
        ? 'v'
        : '';
  const experiment =
    settings.experimentLayout === 'horizontal'
      ? 'h'
      : settings.experimentLayout === 'vertical'
        ? 'v'
        : '';
  const density =
    settings.viewDensity === 'compact' ? 'c' : settings.viewDensity === 'full' ? 'f' : '';
  const encoded = `${layout}${experiment}${density}`;
  return encoded.length ? encoded : undefined;
};

const decodeSettings = (value?: EncodedSettings): ShareSettings | undefined => {
  if (!value || typeof value !== 'string') return undefined;
  const [layoutChar, experimentChar, densityChar] = value.split('');
  const settings: ShareSettings = {};

  if (layoutChar === 'h') settings.layoutDirection = 'horizontal';
  if (layoutChar === 'v') settings.layoutDirection = 'vertical';

  if (experimentChar === 'h') settings.experimentLayout = 'horizontal';
  if (experimentChar === 'v') settings.experimentLayout = 'vertical';

  if (densityChar === 'c') settings.viewDensity = 'compact';
  if (densityChar === 'f') settings.viewDensity = 'full';

  return Object.keys(settings).length ? settings : undefined;
};

export function encodeMarkdownToUrlFragment(
  markdown: string,
  name?: string,
  settings?: ShareSettings,
  collapsedIds?: string[],
): string {
  const payload = JSON.stringify({
    v: 2,
    m: markdown,
    n: name || '',
    s: encodeSettings(settings),
    c: encodeCollapsedIds(collapsedIds),
  });
  return encodeStringToUrlFragment(payload);
}

/**
 * Decodes a URL fragment produced by `encodeMarkdownToUrlFragment`.
 * Returns `null` when decoding fails.
 */
export function decodeMarkdownFromUrlFragment(
  fragment: string,
): { markdown: string; name?: string; settings?: ShareSettings; collapsedIds?: string[] } | null {
  try {
    if (!fragment) return null;

    const decoded = decodeStringFromUrlFragment(fragment);
    if (!decoded) return null;

    try {
      const parsed = JSON.parse(decoded) as {
        v?: number;
        m?: string;
        n?: string;
        s?: ShareSettings | EncodedSettings;
        c?: string;
      };
      if (typeof parsed?.m === 'string') {
        const settings =
          parsed && typeof parsed.s === 'string'
            ? decodeSettings(parsed.s)
            : parsed && typeof parsed.s === 'object'
              ? parsed.s
              : undefined;
        const collapsedIds = decodeCollapsedIds(parsed.c);
        return { markdown: parsed.m, name: parsed.n || undefined, settings, collapsedIds };
      }
    } catch {
      // Fall through to legacy format.
    }

    return { markdown: decoded };
  } catch {
    return null;
  }
}
