import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SaveStatusIndicator } from '@/components/ost/header/SaveStatusIndicator';
import { useOSTStore } from '@/store/ostStore';
import { buildSnapshotPayloadHash } from '@/lib/localSnapshots';

function resetStore() {
  const s = useOSTStore.getState();
  s.setActiveCloudContext(null, false);
  s.resetCloudSync(null);
}

function currentLocalHash() {
  const s = useOSTStore.getState();
  return buildSnapshotPayloadHash({
    name: s.projectName,
    markdown: s.markdown,
    settings: {
      layoutDirection: s.layoutDirection,
      experimentLayout: s.experimentLayout,
      viewDensity: s.viewDensity,
    },
    collapsedIds: s.collapsedCardIds,
  });
}

describe('SaveStatusIndicator', () => {
  beforeEach(() => {
    resetStore();
  });

  it('renders nothing when no active cloud tree', () => {
    const { container } = render(<SaveStatusIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows "Saved" when synced and local matches cloud', () => {
    useOSTStore.getState().setActiveCloudContext('tree-1', true);
    useOSTStore.getState().finishCloudSync(currentLocalHash());

    render(<SaveStatusIndicator />);
    expect(screen.getByTestId('save-status-indicator')).toHaveTextContent(/Saved/i);
  });

  it('shows "Saving…" while syncing', () => {
    useOSTStore.getState().setActiveCloudContext('tree-1', true);
    useOSTStore.getState().beginCloudSync();

    render(<SaveStatusIndicator />);
    expect(screen.getByTestId('save-status-indicator')).toHaveTextContent(/Saving/i);
  });

  it('shows "Save failed" with the error message as title', () => {
    useOSTStore.getState().setActiveCloudContext('tree-1', true);
    useOSTStore.getState().finishCloudSync('seed');
    useOSTStore.getState().beginCloudSync();
    useOSTStore.getState().failCloudSync('Network down');

    render(<SaveStatusIndicator />);
    const el = screen.getByTestId('save-status-indicator');
    expect(el).toHaveTextContent(/Save failed/i);
    expect(el).toHaveAttribute('title', 'Network down');
  });

  it('shows "Unsaved changes" when local hash differs from cloud hash', () => {
    useOSTStore.getState().setActiveCloudContext('tree-1', true);
    useOSTStore.getState().finishCloudSync('a-different-hash');

    render(<SaveStatusIndicator />);
    expect(screen.getByTestId('save-status-indicator')).toHaveTextContent(/Unsaved/i);
  });
});
