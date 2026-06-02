import type { StateCreator } from 'zustand';
import type { OSTStore } from '../ostStore';

export type CloudSyncStatus = 'idle' | 'dirty' | 'syncing' | 'saved' | 'error';

export interface SyncSlice {
  cloudPayloadHash: string | null;
  cloudSyncedAt: number;
  cloudSyncing: boolean;
  cloudSyncError: string | null;

  beginCloudSync: () => void;
  finishCloudSync: (payloadHash: string) => void;
  failCloudSync: (error: string) => void;
  resetCloudSync: (payloadHash: string | null) => void;
}

export const createSyncSlice: StateCreator<OSTStore, [], [], SyncSlice> = (set) => ({
  cloudPayloadHash: null,
  cloudSyncedAt: 0,
  cloudSyncing: false,
  cloudSyncError: null,

  beginCloudSync: () => set({ cloudSyncing: true, cloudSyncError: null }),

  finishCloudSync: (payloadHash) =>
    set({
      cloudSyncing: false,
      cloudSyncError: null,
      cloudPayloadHash: payloadHash,
      cloudSyncedAt: Date.now(),
    }),

  failCloudSync: (error) => set({ cloudSyncing: false, cloudSyncError: error }),

  resetCloudSync: (payloadHash) =>
    set({
      cloudPayloadHash: payloadHash,
      cloudSyncedAt: payloadHash ? Date.now() : 0,
      cloudSyncing: false,
      cloudSyncError: null,
    }),
});
