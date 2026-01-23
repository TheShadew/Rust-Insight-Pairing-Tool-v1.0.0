import { useState, useEffect } from 'react';
import { Minus, X, Zap, Cloud, Server, CheckCircle, AlertCircle, ExternalLink, Loader2, Trash2, Power } from 'lucide-react';

interface PairedServer {
  name: string;
  ip: string;
  port: number;
  playerId: string;
  playerToken: number;
  pairedAt: number;
}

interface PairedEntity {
  entityId: number;
  entityType: string;
  entityName: string;
  serverId: string;
  serverName: string;
  pairedAt: number;
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<{ email: string; name?: string } | null>(null);
  const [isPairing, setIsPairing] = useState(false);
  const [pairingStatus, setPairingStatus] = useState('');
  const [servers, setServers] = useState<Record<string, PairedServer>>({});
  const [entities, setEntities] = useState<Record<string, PairedEntity>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    // Check if already logged in
    checkAuth();
    loadServers();
    loadEntities();

    // Set up event listeners
    const unsubStatus = window.electronAPI.on.pairingStatus((message) => {
      setPairingStatus(message);
    });

    const unsubServer = window.electronAPI.on.pairingServer((serverData) => {
      const server = serverData as PairedServer;
      setServers((prev) => ({
        ...prev,
        [`${server.ip}:${server.port}`]: server,
      }));
    });

    const unsubEntity = window.electronAPI.on.pairingEntity((entityData) => {
      const entity = entityData as PairedEntity;
      setEntities((prev) => ({
        ...prev,
        [String(entity.entityId)]: entity,
      }));
    });

    const unsubError = window.electronAPI.on.pairingError((err) => {
      setError(err);
      setIsPairing(false);
    });

    return () => {
      unsubStatus();
      unsubServer();
      unsubEntity();
      unsubError();
    };
  }, []);

  const checkAuth = async () => {
    const session = await window.electronAPI.auth.getSession();
    if (session) {
      setIsLoggedIn(true);
    }
  };

  const loadServers = async () => {
    const savedServers = await window.electronAPI.pairing.getServers();
    setServers(savedServers as Record<string, PairedServer>);
  };

  const loadEntities = async () => {
    const savedEntities = await window.electronAPI.pairing.getEntities();
    setEntities(savedEntities as Record<string, PairedEntity>);
  };

  const handleLogin = async () => {
    const result = await window.electronAPI.auth.login();
    if (result.success && result.user) {
      setIsLoggedIn(true);
      setUser(result.user);
    }
  };

  const handleLogout = async () => {
    await window.electronAPI.auth.logout();
    setIsLoggedIn(false);
    setUser(null);
  };

  const handleStartPairing = async () => {
    setError('');
    setIsPairing(true);
    setPairingStatus('Starting Steam login...');
    
    const result = await window.electronAPI.pairing.start();
    if (!result.success) {
      setError(result.error || 'Failed to start pairing');
      setIsPairing(false);
    }
  };

  const handleStopPairing = async () => {
    await window.electronAPI.pairing.stop();
    setIsPairing(false);
    setPairingStatus('');
  };

  const handleSyncToCloud = async () => {
    if (!isLoggedIn) {
      setError('Please log in first');
      return;
    }

    setIsSyncing(true);
    setSyncStatus('idle');
    
    const result = await window.electronAPI.sync.toCloud();
    
    if (result.success) {
      setSyncStatus('success');
    } else {
      setSyncStatus('error');
      setError(result.error || 'Sync failed');
    }
    
    setIsSyncing(false);
    
    // Reset status after 3 seconds
    setTimeout(() => setSyncStatus('idle'), 3000);
  };

  const handleOpenWebApp = () => {
    window.electronAPI.openWebApp();
  };

  const handleDeleteServer = async (serverId: string) => {
    const result = await window.electronAPI.pairing.deleteServer(serverId);
    if (result.success) {
      setServers((prev) => {
        const { [serverId]: _, ...rest } = prev;
        return rest;
      });
    } else {
      setError(result.error || 'Failed to delete server');
    }
  };

  const handleDeleteEntity = async (entityId: string) => {
    const result = await window.electronAPI.pairing.deleteEntity(entityId);
    if (result.success) {
      setEntities((prev) => {
        const { [entityId]: _, ...rest } = prev;
        return rest;
      });
    } else {
      setError(result.error || 'Failed to delete device');
    }
  };

  const serverList = Object.values(servers);
  const entityList = Object.values(entities);

  return (
    <div className="h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white flex flex-col">
      {/* Title Bar */}
      <div className="h-10 bg-black/50 flex items-center justify-between px-4 select-none" style={{ WebkitAppRegion: 'drag' } as any}>
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-orange-500" />
          <span className="font-semibold text-sm">Rust Pulse Pairing</span>
        </div>
        <div className="flex gap-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={() => window.electronAPI.window.minimize()}
            className="p-2 hover:bg-white/10 rounded transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={() => window.electronAPI.window.close()}
            className="p-2 hover:bg-red-500/80 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {/* Cloud Login Section */}
        <div className="bg-gray-800/50 rounded-xl p-4 mb-4 border border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Cloud className={`w-5 h-5 ${isLoggedIn ? 'text-green-500' : 'text-gray-500'}`} />
              <div>
                <p className="font-medium">Cloud Account</p>
                <p className="text-sm text-gray-400">
                  {isLoggedIn ? (user?.email || 'Logged in') : 'Log in to sync servers'}
                </p>
              </div>
            </div>
            {isLoggedIn ? (
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                Logout
              </button>
            ) : (
              <button
                onClick={handleLogin}
                className="px-3 py-1.5 text-sm bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
              >
                Login
              </button>
            )}
          </div>
        </div>

        {/* Pairing Section */}
        <div className="bg-gray-800/50 rounded-xl p-4 mb-4 border border-gray-700">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Server className="w-5 h-5 text-orange-500" />
            Server Pairing
          </h2>
          
          {!isPairing ? (
            <button
              onClick={handleStartPairing}
              className="w-full py-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 rounded-lg font-medium transition-all"
            >
              Start Steam Pairing
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <Loader2 className="w-4 h-4 animate-spin" />
                {pairingStatus || 'Waiting for server pairing...'}
              </div>
              <button
                onClick={handleStopPairing}
                className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
              >
                Stop Pairing
              </button>
            </div>
          )}

          <p className="text-xs text-gray-500 mt-3">
            Open Rust, go to a server, and press "Pair with Rust+"
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <p className="text-sm text-red-300">{error}</p>
            <button onClick={() => setError('')} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Paired Servers */}
        <div className="bg-gray-800/50 rounded-xl p-4 mb-4 border border-gray-700">
          <h2 className="font-semibold mb-3">Paired Servers ({serverList.length})</h2>
          
          {serverList.length === 0 ? (
            <p className="text-sm text-gray-500">No servers paired yet</p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {serverList.map((server) => {
                const serverId = `${server.ip}:${server.port}`;
                return (
                  <div
                    key={serverId}
                    className="flex items-center gap-2 p-2 bg-gray-700/50 rounded-lg group"
                  >
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{server.name}</p>
                      <p className="text-xs text-gray-500">{server.ip}:{server.port}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteServer(serverId)}
                      className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 rounded transition-all"
                      title="Remove server"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Paired Devices */}
        <div className="bg-gray-800/50 rounded-xl p-4 mb-4 border border-gray-700">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Power className="w-5 h-5 text-blue-500" />
            Paired Devices ({entityList.length})
          </h2>
          
          {entityList.length === 0 ? (
            <p className="text-sm text-gray-500">
              No devices paired yet. Pair Smart Switches, Alarms, or Storage Monitors in-game.
            </p>
          ) : (
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {entityList.map((entity) => {
                const entityId = String(entity.entityId);
                return (
                  <div
                    key={entityId}
                    className="flex items-center gap-2 p-2 bg-gray-700/50 rounded-lg group"
                  >
                    <Power className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{entity.entityName}</p>
                      <p className="text-xs text-gray-500">
                        {entity.entityType} • {entity.serverName || entity.serverId}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteEntity(entityId)}
                      className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 rounded transition-all"
                      title="Remove device"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sync to Cloud */}
        <div className="bg-gray-800/50 rounded-xl p-4 mb-4 border border-gray-700">
          <button
            onClick={handleSyncToCloud}
            disabled={!isLoggedIn || (serverList.length === 0 && entityList.length === 0) || isSyncing}
            className={`w-full py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
              isLoggedIn && (serverList.length > 0 || entityList.length > 0)
                ? 'bg-blue-500 hover:bg-blue-600'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isSyncing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Syncing...
              </>
            ) : syncStatus === 'success' ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Synced!
              </>
            ) : (
              <>
                <Cloud className="w-4 h-4" />
                Sync to Cloud
              </>
            )}
          </button>
          <p className="text-xs text-gray-500 mt-2 text-center">
            {!isLoggedIn
              ? 'Log in to sync'
              : serverList.length === 0 && entityList.length === 0
              ? 'Pair a server or device first'
              : `Sync ${serverList.length} server(s) and ${entityList.length} device(s) to web`}
          </p>
        </div>

        {/* Open Web App */}
        <button
          onClick={handleOpenWebApp}
          className="w-full py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
          <ExternalLink className="w-4 h-4" />
          Open Rust Pulse Web
        </button>
        <p className="text-xs text-gray-500 mt-2 text-center">
          Use the web app for full features after syncing
        </p>
      </div>
    </div>
  );
}

export default App;
