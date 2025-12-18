'use client';

/**
 * EVM WalletConnect Modal Component
 * 
 * Modal dialog for connecting to EVM dapps via WalletConnect/Reown
 * Features a prominent QR scanner that starts automatically
 */

import { useState, useEffect, useRef } from 'react';
import { useEvmWalletConnect } from '@/hooks/useEvmWalletConnect';
import { useBrowserFingerprint } from '@/hooks/useBrowserFingerprint';
import { Loader2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@repo/ui/components/ui/dialog';
import { Html5Qrcode } from 'html5-qrcode';

interface EvmWalletConnectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EvmWalletConnectModal({ open, onOpenChange }: EvmWalletConnectModalProps) {
  const { fingerprint } = useBrowserFingerprint();
  const { 
    isInitializing, 
    sessions, 
    pair, 
    disconnect,
    initialize
  } = useEvmWalletConnect(fingerprint);
  
  const [uriInput, setUriInput] = useState('');
  const [isPairing, setIsPairing] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);

  // Initialize WalletConnect when modal opens (runs in background)
  useEffect(() => {
    if (open && fingerprint && !isInitializing) {
      initialize().catch((err) => {
        console.error('Failed to initialize EVM WalletConnect:', err);
      });
    }
  }, [open, fingerprint, initialize, isInitializing]);

  // Cleanup scanner on unmount or when modal closes
  useEffect(() => {
    if (!open) {
      stopScanner();
      setUriInput('');
      setPairError(null);
      setCameraError(null);
      setShowScanner(false);
    }
  }, [open]);

  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current
        .stop()
        .then(() => {
          scannerRef.current = null;
          setIsScanning(false);
        })
        .catch((err) => {
          console.error('Failed to stop scanner:', err);
          scannerRef.current = null;
          setIsScanning(false);
        });
    }
  };

  // Start scanner when user clicks the button
  const handleStartScanner = () => {
    // Only start scanner if WalletConnect is ready
    if (isInitializing) {
      console.warn('WalletConnect is still initializing, please wait...');
      return;
    }
    
    setShowScanner(true);
    setCameraError(null);
    // Small delay to ensure DOM element exists
    setTimeout(() => {
      startScanner();
    }, 50);
  };

  const startScanner = async () => {
    if (!scannerContainerRef.current || scannerRef.current) return;

    try {
      setCameraError(null);
      setIsScanning(false);
      
      const html5QrCode = new Html5Qrcode('evm-walletconnect-scanner', {
        verbose: false,
      });
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 15,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          if (decodedText.startsWith('wc:')) {
            setUriInput(decodedText);
            stopScanner();
            handleConnect(decodedText);
          }
        },
        () => {}
      );
      
      setIsScanning(true);
      setCameraError(null);
    } catch (err: any) {
      console.error('Scanner error:', err);
      scannerRef.current = null;
      setIsScanning(false);
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera access denied. Please allow camera permissions or paste a URL below.');
      } else if (err.name === 'NotFoundError') {
        setCameraError('No camera found. Please paste a WalletConnect URL below.');
      } else {
        setCameraError('Failed to access camera. Please paste a URL below.');
      }
    }
  };

  const handleConnect = async (uri?: string) => {
    const uriToUse = uri || uriInput.trim();
    
    if (!uriToUse) {
      setPairError('Please enter a WalletConnect URI');
      return;
    }

    if (!uriToUse.startsWith('wc:')) {
      setPairError('Invalid WalletConnect URI');
      return;
    }

    setIsPairing(true);
    setPairError(null);

    try {
      await pair(uriToUse);
      setUriInput('');
      onOpenChange(false);
    } catch (err) {
      console.error('Pairing failed:', err);
      setPairError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setIsPairing(false);
    }
  };

  const handleDisconnect = async (topic: string) => {
    try {
      await disconnect(topic);
    } catch (err) {
      console.error('Disconnect failed:', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-[400px] p-0 rounded-3xl bg-[#1a1a1a] border border-gray-800 text-white shadow-2xl overflow-hidden"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Connect EVM DApp via WalletConnect</DialogTitle>
        {isInitializing ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col">
            {/* Header */}
            <div className="text-center pt-6 pb-4">
              <h2 className="text-xl font-semibold text-white">Connect DApp</h2>
            </div>

            {/* QR Scanner */}
            <div className="relative mx-4 mb-4">
              {showScanner ? (
                <>
                  <div
                    id="evm-walletconnect-scanner"
                    ref={scannerContainerRef}
                    className="w-full aspect-square rounded-2xl overflow-hidden bg-black"
                  />
                  {/* Loading state while scanner starts */}
                  {!isScanning && !cameraError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 rounded-2xl">
                      <Loader2 className="h-8 w-8 animate-spin text-white mb-3" />
                      <p className="text-white text-sm">Starting camera...</p>
                    </div>
                  )}
                  {/* Error state if camera fails */}
                  {cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/90 rounded-2xl p-6">
                      <p className="text-gray-400 text-center text-sm">{cameraError}</p>
                    </div>
                  )}
                </>
              ) : (
                /* Start Camera Button */
                <button
                  onClick={handleStartScanner}
                  disabled={isInitializing}
                  className="w-full aspect-square rounded-2xl bg-gray-800/30 border border-gray-700 hover:bg-gray-800/50 disabled:bg-gray-800/20 disabled:cursor-not-allowed transition-all flex items-center justify-center"
                >
                  <span className="text-gray-400 text-sm">
                    {isInitializing ? 'Initializing...' : 'Tap to scan QR code'}
                  </span>
                </button>
              )}
            </div>

            {/* Scan instruction */}
            {showScanner && <p className="text-center text-gray-400 text-sm py-4">Scan QR to connect</p>}

            {/* URL Input */}
            <div className="px-4 pb-6">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Or paste WalletConnect URL"
                  value={uriInput}
                  onChange={(e) => {
                    setUriInput(e.target.value);
                    setPairError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && uriInput) {
                      handleConnect();
                    }
                  }}
                  className="w-full px-4 py-3 pr-24 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
                <button
                  onClick={() => handleConnect()}
                  disabled={isPairing || !uriInput.trim() || !fingerprint}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors text-sm font-medium text-white"
                >
                  {isPairing ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Connecting
                    </span>
                  ) : (
                    "Connect"
                  )}
                </button>
              </div>
              {pairError && (
                <p className="text-sm text-red-400 mt-2 text-center">{pairError}</p>
              )}
            </div>
          </div>
        ) : (
          /* Connected Sessions View */
          <div className="p-6 space-y-4">
            <h2 className="text-xl font-semibold text-white text-center">Connected DApps</h2>
            
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3">
              <p className="text-green-400 font-medium text-sm text-center">
                ✅ {sessions.length} active connection{sessions.length > 1 ? 's' : ''}
              </p>
            </div>

            {sessions
              .filter((session) => session && session.topic)
              .map((session) => (
                <div key={session.topic} className="border border-gray-700 rounded-xl p-4 bg-gray-800/50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white truncate">
                        {session.peer?.metadata?.name || 'Unknown DApp'}
                      </h3>
                      {session.peer?.metadata?.url && (
                        <p className="text-sm text-gray-400 truncate">
                          {session.peer.metadata.url}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDisconnect(session.topic)}
                      className="ml-3 p-2 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors flex-shrink-0"
                      title="Disconnect"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

