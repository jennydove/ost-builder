import { useEffect, useState } from 'react';
import { AlertCircle, Check, Cloud, RefreshCw } from 'lucide-react';
import { useOSTStore } from '@/store/ostStore';
import { buildSnapshotPayloadHash } from '@/lib/localSnapshots';

function formatRelativeTime(ts: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - ts) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ts).toLocaleString();
}

export function SaveStatusIndicator() {
  const activeTreeId = useOSTStore((s) => s.activeTreeId);
  const cloudPayloadHash = useOSTStore((s) => s.cloudPayloadHash);
  const cloudSyncedAt = useOSTStore((s) => s.cloudSyncedAt);
  const cloudSyncing = useOSTStore((s) => s.cloudSyncing);
  const cloudSyncError = useOSTStore((s) => s.cloudSyncError);
  const projectName = useOSTStore((s) => s.projectName);
  const markdown = useOSTStore((s) => s.markdown);
  const layoutDirection = useOSTStore((s) => s.layoutDirection);
  const experimentLayout = useOSTStore((s) => s.experimentLayout);
  const viewDensity = useOSTStore((s) => s.viewDensity);
  const collapsedCardIds = useOSTStore((s) => s.collapsedCardIds);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!cloudSyncedAt || cloudSyncing || cloudSyncError) return;
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, [cloudSyncedAt, cloudSyncing, cloudSyncError]);

  if (!activeTreeId) return null;

  const localHash = buildSnapshotPayloadHash({
    name: projectName,
    markdown,
    settings: { layoutDirection, experimentLayout, viewDensity },
    collapsedIds: collapsedCardIds,
  });

  const isDirty = cloudPayloadHash !== null && localHash !== cloudPayloadHash;

  let icon: React.ReactNode;
  let label: string;
  let className = 'text-muted-foreground';
  let title: string | undefined;

  if (cloudSyncError) {
    icon = <AlertCircle className="w-3 h-3" />;
    label = 'Save failed';
    className = 'text-destructive';
    title = cloudSyncError;
  } else if (cloudSyncing) {
    icon = <RefreshCw className="w-3 h-3 animate-spin" />;
    label = 'Saving…';
  } else if (isDirty) {
    icon = <Cloud className="w-3 h-3" />;
    label = 'Unsaved changes';
    className = 'text-amber-600';
  } else if (cloudSyncedAt) {
    icon = <Check className="w-3 h-3" />;
    label = `Saved · ${formatRelativeTime(cloudSyncedAt, now)}`;
    className = 'text-emerald-600';
  } else {
    return null;
  }

  return (
    <div
      data-testid="save-status-indicator"
      className={`flex items-center gap-1 text-xs ${className}`}
      title={title}
      aria-live="polite"
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}
