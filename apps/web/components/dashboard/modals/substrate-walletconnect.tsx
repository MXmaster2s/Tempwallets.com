'use client';

/**
 * Substrate WalletConnect Component
 * 
 * Simple UI for connecting to Polkadot dapps via WalletConnect/Reown
 * Only shows Substrate wallets - EVM wallets are excluded
 */

import { useState } from 'react';
import { useSubstrateWalletConnect } from '@/hooks/useSubstrateWalletConnect';
import { useBrowserFingerprint } from '@/hooks/useBrowserFingerprint';
import { Loader2, Link, Copy, X } from 'lucide-react';

export function SubstrateWalletConnect() {
  const { fingerprint } = useBrowserFingerprint();
  const { 
    isInitializing, 
    error,
    sessions, 
    pair, 
    disconnect 
  } = useSubstrateWalletConnect(fingerprint);
  
  const [uriInput, setUriInput] = useState('');
  const [isPairing, setIsPairing] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);

  const handlePasteAndConnect = async () => {
    if (!uriInput.trim()) {
      setPairError('Please enter a WalletConnect URI');
      return;
    }

    if (!uriInput.startsWith('wc:')) {
      setPairError('Invalid WalletConnect URI. Must start with "wc:"');
      return;
    }

    setIsPairing(true);
    setPairError(null);

    try {
      await pair(uriInput);
      setUriInput(''); // Clear input on success
    } catch (err) {
      console.error('Pairing failed:', err);
      setPairError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setIsPairing(false);
    }
  };

  const handleAutoPaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.startsWith('wc:')) {
        setUriInput(text);
        setPairError(null);
      } else {
        setPairError('Clipboard does not contain a valid WalletConnect URI');
      }
    } catch {
      setPairError('Failed to read clipboard. Please paste manually.');
    }
  };

  const handleDisconnect = async (topic: string) => {
    try {
      await disconnect(topic);
    } catch (err) {
      console.error('Disconnect failed:', err);
    }
  };

  if (isInitializing) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600">Initializing WalletConnect...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">🔗 Connect to Polkadot DApp</h2>
        <p className="text-gray-600">
          Connect to Polkadot ecosystem dapps like Hydration, Unique Network, Bifrost, and more.
          Only your Substrate wallets will be used for these connections.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>How to Connect:</strong>
            </p>
            <ol className="list-decimal list-inside mt-2 space-y-1 text-sm text-blue-700">
              <li>Visit a Polkadot dapp (e.g., <a href="https://app.hydration.net" target="_blank" rel="noopener noreferrer" className="underline">Hydration</a>)</li>
              <li>Click &quot;Connect Wallet&quot; → &quot;WalletConnect&quot;</li>
              <li>Click &quot;Copy Link&quot; or &quot;Copy to Clipboard&quot;</li>
              <li>Return here and paste the URI below</li>
              <li>Click &quot;Connect&quot; and approve the connection</li>
            </ol>
          </div>

          <div className="space-y-2">
            <label htmlFor="wc-uri" className="block text-sm font-medium text-gray-700">
              WalletConnect URI
            </label>
            <div className="flex gap-2">
              <input
                id="wc-uri"
                type="text"
                placeholder="wc:abc123...@2?relay-protocol=irn&symKey=..."
                value={uriInput}
                onChange={(e) => {
                  setUriInput(e.target.value);
                  setPairError(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={handleAutoPaste}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                title="Paste from clipboard"
              >
                <Copy className="h-5 w-5" />
              </button>
            </div>
            {pairError && (
              <p className="text-sm text-red-600">{pairError}</p>
            )}
          </div>

          <button
            onClick={handlePasteAndConnect}
            disabled={isPairing || !uriInput || !fingerprint}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {isPairing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <Link className="h-5 w-5" />
                <span>Connect</span>
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800 font-medium">
              ✅ Connected to {sessions.length} dapp{sessions.length > 1 ? 's' : ''}
            </p>
          </div>

          {sessions
            .filter((session) => session && session.topic) // Filter out invalid sessions
            .map((session) => (
              <div key={session.topic} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">
                      {session.peer?.metadata?.name || 'Unknown DApp'}
                    </h3>
                    {session.peer?.metadata?.url && (
                      <p className="text-sm text-gray-600 mt-1">
                        <a 
                          href={session.peer.metadata.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {session.peer.metadata.url}
                        </a>
                      </p>
                    )}
                    {session.peer?.metadata?.description && (
                      <p className="text-sm text-gray-500 mt-1">
                        {session.peer.metadata.description}
                      </p>
                    )}
                    {session.namespaces?.polkadot && (
                      <div className="mt-2">
                        <p className="text-xs text-gray-500">
                          Accounts: {session.namespaces.polkadot.accounts?.length || 0}
                        </p>
                        <p className="text-xs text-gray-500">
                          Chains: {session.namespaces.polkadot.chains?.length || 0}
                        </p>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDisconnect(session.topic)}
                    className="ml-4 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Disconnect"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

