import { describe, it, expect, beforeEach } from 'vitest';
import { useOSTStore } from '@/store/ostStore';

function resetSync() {
  useOSTStore.getState().resetCloudSync(null);
}

describe('syncSlice', () => {
  beforeEach(() => {
    resetSync();
  });

  it('starts with cloudPayloadHash null and no error', () => {
    const s = useOSTStore.getState();
    expect(s.cloudPayloadHash).toBeNull();
    expect(s.cloudSyncing).toBe(false);
    expect(s.cloudSyncError).toBeNull();
    expect(s.cloudSyncedAt).toBe(0);
  });

  it('beginCloudSync sets syncing=true and clears prior error', () => {
    useOSTStore.getState().failCloudSync('boom');
    expect(useOSTStore.getState().cloudSyncError).toBe('boom');

    useOSTStore.getState().beginCloudSync();
    const s = useOSTStore.getState();
    expect(s.cloudSyncing).toBe(true);
    expect(s.cloudSyncError).toBeNull();
  });

  it('finishCloudSync records the hash and clears syncing', () => {
    useOSTStore.getState().beginCloudSync();
    const before = Date.now();
    useOSTStore.getState().finishCloudSync('abc123');
    const s = useOSTStore.getState();
    expect(s.cloudSyncing).toBe(false);
    expect(s.cloudSyncError).toBeNull();
    expect(s.cloudPayloadHash).toBe('abc123');
    expect(s.cloudSyncedAt).toBeGreaterThanOrEqual(before);
  });

  it('failCloudSync records error and clears syncing without touching hash', () => {
    useOSTStore.getState().finishCloudSync('abc123');
    useOSTStore.getState().beginCloudSync();
    useOSTStore.getState().failCloudSync('network down');
    const s = useOSTStore.getState();
    expect(s.cloudSyncing).toBe(false);
    expect(s.cloudSyncError).toBe('network down');
    expect(s.cloudPayloadHash).toBe('abc123');
  });

  it('resetCloudSync(hash) sets the canonical hash and stamps syncedAt', () => {
    const before = Date.now();
    useOSTStore.getState().resetCloudSync('seed-hash');
    const s = useOSTStore.getState();
    expect(s.cloudPayloadHash).toBe('seed-hash');
    expect(s.cloudSyncing).toBe(false);
    expect(s.cloudSyncError).toBeNull();
    expect(s.cloudSyncedAt).toBeGreaterThanOrEqual(before);
  });

  it('resetCloudSync(null) wipes hash and syncedAt — used when leaving a cloud tree', () => {
    useOSTStore.getState().finishCloudSync('x');
    useOSTStore.getState().resetCloudSync(null);
    const s = useOSTStore.getState();
    expect(s.cloudPayloadHash).toBeNull();
    expect(s.cloudSyncedAt).toBe(0);
  });
});
