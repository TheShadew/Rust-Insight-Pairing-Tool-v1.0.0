/**
 * Rust Insight Pairing Tool - Preload Script
 * Minimal API for pairing and cloud sync
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    close: () => ipcRenderer.invoke('window:close'),
  },

  // Open web app
  openWebApp: () => ipcRenderer.invoke('openWebApp'),

  // Auth API
  auth: {
    login: () => ipcRenderer.invoke('auth:login'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getSession: () => ipcRenderer.invoke('auth:getSession'),
  },

  // Sync API
  sync: {
    toCloud: () => ipcRenderer.invoke('sync:toCloud'),
  },

  // Pairing API
  pairing: {
    start: () => ipcRenderer.invoke('pairing:start'),
    stop: () => ipcRenderer.invoke('pairing:stop'),
    getServers: () => ipcRenderer.invoke('pairing:getServers'),
    deleteServer: (serverId: string) => ipcRenderer.invoke('pairing:deleteServer', serverId),
    getEntities: () => ipcRenderer.invoke('pairing:getEntities'),
    deleteEntity: (entityId: string) => ipcRenderer.invoke('pairing:deleteEntity', entityId),
  },

  // Event listeners
  on: {
    pairingStatus: (callback: (message: string) => void) => {
      const handler = (_: unknown, message: string) => callback(message);
      ipcRenderer.on('pairing:status', handler);
      return () => ipcRenderer.removeListener('pairing:status', handler);
    },
    pairingServer: (callback: (serverData: unknown) => void) => {
      const handler = (_: unknown, serverData: unknown) => callback(serverData);
      ipcRenderer.on('pairing:server', handler);
      return () => ipcRenderer.removeListener('pairing:server', handler);
    },
    pairingEntity: (callback: (entityData: unknown) => void) => {
      const handler = (_: unknown, entityData: unknown) => callback(entityData);
      ipcRenderer.on('pairing:entity', handler);
      return () => ipcRenderer.removeListener('pairing:entity', handler);
    },
    pairingError: (callback: (error: string) => void) => {
      const handler = (_: unknown, error: string) => callback(error);
      ipcRenderer.on('pairing:error', handler);
      return () => ipcRenderer.removeListener('pairing:error', handler);
    },
  },
});

export interface ElectronAPI {
  window: {
    minimize: () => Promise<void>;
    close: () => Promise<void>;
  };
  openWebApp: () => Promise<void>;
  auth: {
    login: () => Promise<{ success: boolean; user?: { id: string; email: string; name?: string }; error?: string }>;
    logout: () => Promise<{ success: boolean }>;
    getSession: () => Promise<{ access_token: string; web_app_url: string } | null>;
  };
  sync: {
    toCloud: () => Promise<{ success: boolean; error?: string }>;
  };
  pairing: {
    start: () => Promise<{ success: boolean; error?: string }>;
    stop: () => Promise<{ success: boolean }>;
    getServers: () => Promise<Record<string, unknown>>;
    deleteServer: (serverId: string) => Promise<{ success: boolean; error?: string }>;
    getEntities: () => Promise<Record<string, unknown>>;
    deleteEntity: (entityId: string) => Promise<{ success: boolean; error?: string }>;
  };
  on: {
    pairingStatus: (callback: (message: string) => void) => () => void;
    pairingServer: (callback: (serverData: unknown) => void) => () => void;
    pairingEntity: (callback: (entityData: unknown) => void) => () => void;
    pairingError: (callback: (error: string) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
