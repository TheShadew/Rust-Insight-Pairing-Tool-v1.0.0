/**
 * Rust Insight Pairing Tool - Main Process
 * Minimal app for Steam pairing + cloud sync only
 */

import { app, BrowserWindow, ipcMain, shell, session } from 'electron';
import { join } from 'path';
import Store from 'electron-store';
import { RustPlusPairing } from '@rust-insight/core';

// Store for paired servers, entities, and session
interface PairedEntity {
  entityId: number;
  entityType: string;
  entityName: string;
  serverId: string;
  serverName: string;
  pairedAt: number;
}

interface StoreSchema {
  servers: Record<string, unknown>;
  entities: Record<string, PairedEntity>;
  cloudSession: { 
    access_token: string; 
    refresh_token: string;
    expires_at: number;
    web_app_url: string;
  } | null;
}

const store = new Store<StoreSchema>({
  name: 'rust-insight-pairing',
  defaults: {
    servers: {},
    entities: {},
    cloudSession: null,
  },
});

let mainWindow: BrowserWindow | null = null;
let pairingClient: RustPlusPairing | null = null;

const WEB_APP_URL = 'https://www.rustinsight.net';

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 650,
    minWidth: 400,
    minHeight: 500,
    resizable: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#1a1a1a',
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function setupIPC(): void {
  // Window controls
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:close', () => mainWindow?.close());

  // Open web app in browser
  ipcMain.handle('openWebApp', () => {
    shell.openExternal(WEB_APP_URL);
  });

  // ============= Auth Handlers =============

  ipcMain.handle('auth:login', async () => {
    try {
      // Clear all auth-related cookies to allow switching accounts
      const ses = session.defaultSession;
      await ses.clearStorageData({
        storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage'],
        origin: 'https://accounts.google.com',
      });
      await ses.clearStorageData({
        storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage'],
        origin: 'https://ubnvzmntccuimglacdnr.supabase.co',
      });
      await ses.clearStorageData({
        storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage'],
        origin: 'https://www.rustinsight.net',
      });
      
      const authWindow = new BrowserWindow({
        width: 500,
        height: 700,
        parent: mainWindow || undefined,
        modal: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      authWindow.loadURL(`${WEB_APP_URL}/auth/desktop-callback`);

      return new Promise((resolve) => {
        let resolved = false;

        const pollInterval = setInterval(async () => {
          if (resolved || authWindow.isDestroyed()) {
            clearInterval(pollInterval);
            return;
          }

          try {
            const authData = await authWindow.webContents.executeJavaScript('window.__DESKTOP_AUTH_DATA__');
            
            if (authData && authData.success) {
              resolved = true;
              clearInterval(pollInterval);

              store.set('cloudSession', {
                access_token: authData.accessToken,
                refresh_token: authData.refreshToken,
                expires_at: authData.expiresAt || Math.floor(Date.now() / 1000) + 3600,
                web_app_url: WEB_APP_URL,
              });

              authWindow.close();

              resolve({
                success: true,
                user: {
                  id: authData.userId,
                  email: authData.email,
                  name: authData.name || undefined,
                },
              });
            }
          } catch {
            // Script execution error
          }
        }, 500);

        authWindow.on('closed', () => {
          clearInterval(pollInterval);
          if (!resolved) {
            resolve({ success: false, error: 'Login cancelled' });
          }
        });
      });
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('auth:logout', () => {
    store.set('cloudSession', null);
    return { success: true };
  });

  ipcMain.handle('auth:getSession', () => {
    return store.get('cloudSession');
  });

  // ============= Pairing Handlers =============

  ipcMain.handle('pairing:start', async () => {
    try {
      if (pairingClient) {
        pairingClient.destroy();
        pairingClient = null;
      }

      pairingClient = new RustPlusPairing();

      pairingClient.on('status', (message) => {
        mainWindow?.webContents.send('pairing:status', message);
      });

      pairingClient.on('server:paired', (serverData) => {
        mainWindow?.webContents.send('pairing:server', serverData);
        
        const servers = store.get('servers') || {};
        const serverId = `${serverData.ip}:${serverData.port}`;
        servers[serverId] = {
          ...serverData,
          pairedAt: Date.now(),
        };
        store.set('servers', servers);
      });

      // Handle entity pairing (Smart Switches, Alarms, etc.)
      pairingClient.on('entity:paired', (entityData: any) => {
        console.log('[Pairing] Entity paired:', entityData);
        mainWindow?.webContents.send('pairing:entity', entityData);
        
        const entities = store.get('entities') || {};
        const entityId = String(entityData.entityId);
        entities[entityId] = {
          entityId: Number(entityData.entityId),
          entityType: entityData.entityType || 'switch',
          entityName: entityData.entityName || `Device #${entityData.entityId}`,
          serverId: `${entityData.ip}:${entityData.port}`,
          serverName: entityData.name || 'Unknown Server',
          pairedAt: Date.now(),
        };
        store.set('entities', entities);
      });

      pairingClient.on('error', (error) => {
        mainWindow?.webContents.send('pairing:error', error.message);
      });

      // Get Steam auth token via Electron BrowserWindow (no Playwright needed)
      mainWindow?.webContents.send('pairing:status', 'Opening Steam login...');
      const steamToken = await getSteamAuthToken();
      
      if (!steamToken) {
        throw new Error('Steam login was cancelled');
      }

      // Register with the token we got from the browser
      await pairingClient.registerWithToken(steamToken);
      await pairingClient.startListening();

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Steam login via Electron BrowserWindow
  async function getSteamAuthToken(): Promise<string | null> {
    return new Promise((resolve) => {
      const steamWindow = new BrowserWindow({
        width: 500,
        height: 700,
        parent: mainWindow || undefined,
        modal: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      let tokenCaptured = false;

      // Inject script to capture the auth token
      steamWindow.webContents.on('did-finish-load', async () => {
        try {
          await steamWindow.webContents.executeJavaScript(`
            // Suppress alerts
            window.alert = function(msg) { console.log('Alert:', msg); };
            
            // Capture ReactNativeWebView.postMessage calls
            window.ReactNativeWebView = {
              postMessage: function(data) {
                console.log('[RustInsight] postMessage:', data);
                try {
                  var parsed = JSON.parse(data);
                  var token = parsed.token || parsed.Token || parsed.authToken || parsed.AuthToken;
                  if (token) {
                    window.__STEAM_TOKEN__ = token;
                  }
                } catch (e) {
                  // Try to extract JWT from raw string
                  if (typeof data === 'string' && data.includes('eyJ')) {
                    var match = data.match(/eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+/);
                    if (match) {
                      window.__STEAM_TOKEN__ = match[0];
                    }
                  }
                }
              }
            };
          `);
        } catch {
          // Page might be navigating
        }
      });

      // Poll for token
      const pollInterval = setInterval(async () => {
        if (tokenCaptured || steamWindow.isDestroyed()) {
          clearInterval(pollInterval);
          return;
        }

        try {
          const token = await steamWindow.webContents.executeJavaScript('window.__STEAM_TOKEN__');
          if (token) {
            tokenCaptured = true;
            clearInterval(pollInterval);
            
            // Show success message briefly
            try {
              await steamWindow.webContents.executeJavaScript(`
                document.body.innerHTML = '<div style="font-family: sans-serif; background: linear-gradient(135deg, #1a1a1a, #2d1a1a); color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;"><div style="text-align: center; padding: 40px; background: rgba(30,30,30,0.9); border-radius: 16px; border: 1px solid rgba(46,204,113,0.3);"><div style="font-size: 48px; margin-bottom: 16px;">✓</div><h2 style="color: #2ecc71; margin: 0 0 8px 0;">Steam Linked!</h2><p style="color: #888; margin: 0;">This window will close automatically.</p></div></div>';
              `);
            } catch {}
            
            setTimeout(() => {
              if (!steamWindow.isDestroyed()) {
                steamWindow.close();
              }
              resolve(token);
            }, 1500);
          }
        } catch {
          // Script execution error, window might be navigating
        }
      }, 500);

      // Handle window close
      steamWindow.on('closed', () => {
        clearInterval(pollInterval);
        if (!tokenCaptured) {
          resolve(null);
        }
      });

      // Load the Rust+ login page
      steamWindow.loadURL('https://companion-rust.facepunch.com/login');

      // Timeout after 5 minutes
      setTimeout(() => {
        if (!tokenCaptured && !steamWindow.isDestroyed()) {
          clearInterval(pollInterval);
          steamWindow.close();
          resolve(null);
        }
      }, 300000);
    });
  }

  ipcMain.handle('pairing:stop', () => {
    if (pairingClient) {
      pairingClient.destroy();
      pairingClient = null;
    }
    return { success: true };
  });

  ipcMain.handle('pairing:getServers', () => {
    return store.get('servers') || {};
  });

  ipcMain.handle('pairing:getEntities', () => {
    return store.get('entities') || {};
  });

  ipcMain.handle('pairing:deleteServer', (_event, serverId: string) => {
    try {
      const servers = store.get('servers') || {};
      if (servers[serverId]) {
        delete servers[serverId];
        store.set('servers', servers);
        return { success: true };
      }
      return { success: false, error: 'Server not found' };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('pairing:deleteEntity', (_event, entityId: string) => {
    try {
      const entities = store.get('entities') || {};
      if (entities[entityId]) {
        delete entities[entityId];
        store.set('entities', entities);
        return { success: true };
      }
      return { success: false, error: 'Entity not found' };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ============= Cloud Sync =============

  // Helper to refresh access token if expired
  async function refreshTokenIfNeeded(): Promise<string | null> {
    const session = store.get('cloudSession');
    if (!session) return null;

    const now = Math.floor(Date.now() / 1000);
    // Refresh if token expires in less than 5 minutes
    if (session.expires_at && session.expires_at > now + 300) {
      return session.access_token;
    }

    // Token expired or expiring soon, try to refresh
    if (!session.refresh_token) {
      return null; // No refresh token, user needs to re-login
    }

    try {
      // Call Supabase to refresh the token
      const response = await fetch(`${process.env.SUPABASE_URL || 'https://your-project.supabase.co'}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_ANON_KEY || '',
        },
        body: JSON.stringify({
          refresh_token: session.refresh_token,
        }),
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      
      // Update stored session with new tokens
      store.set('cloudSession', {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
        web_app_url: session.web_app_url,
      });

      return data.access_token;
    } catch {
      return null;
    }
  }

  ipcMain.handle('sync:toCloud', async () => {
    try {
      const session = store.get('cloudSession');

      if (!session?.web_app_url || !session?.access_token) {
        return { success: false, error: 'Not logged in to cloud' };
      }

      // Check if token is expired
      const now = Math.floor(Date.now() / 1000);
      if (session.expires_at && session.expires_at < now) {
        // Token expired, user needs to re-login
        return { success: false, error: 'Session expired. Please log out and log back in.' };
      }

      const response = await fetch(`${session.web_app_url}/api/sync/credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          credentials: {},
          servers: store.get('servers') || {},
          entities: store.get('entities') || {},
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // If auth failed, suggest re-login
        if (response.status === 401) {
          return { success: false, error: 'Session expired. Please log out and log back in.' };
        }
        throw new Error(errorData.error || `Sync failed: ${response.statusText}`);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });
}

app.whenReady().then(() => {
  setupIPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (pairingClient) {
    pairingClient.destroy();
  }
});
