'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Loader2 } from 'lucide-react';

interface QRScannerProps {
  onScan: (result: string) => void;
  onClose: () => void;
}

export function QRScanner({ onScan, onClose }: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const startScanning = async () => {
      try {
        setError(null);
        setIsScanning(true);

        const html5QrCode = new Html5Qrcode('qr-reader');
        scannerRef.current = html5QrCode;

        // Try to get available cameras
        const devices = await Html5Qrcode.getCameras();
        let cameraId: string | { facingMode: string } = { facingMode: 'environment' };
        
        // Prefer back camera on mobile
        if (devices && devices.length > 0) {
          const backCamera = devices.find(device => 
            device.label.toLowerCase().includes('back') || 
            device.label.toLowerCase().includes('rear') ||
            device.label.toLowerCase().includes('environment')
          );
          if (backCamera) {
            cameraId = backCamera.id;
          } else if (devices[0]) {
            cameraId = devices[0].id;
          }
        }

        // Start scanning with camera
        await html5QrCode.start(
          cameraId,
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            disableFlip: false,
          },
          (decodedText) => {
            // Successfully scanned
            if (decodedText.startsWith('wc:')) {
              onScan(decodedText);
              stopScanning();
            } else {
              setError('Invalid QR code. Please scan a WalletConnect QR code.');
            }
          },
          (errorMessage) => {
            // Ignore scanning errors (they're frequent during scanning)
            // Only show errors for actual failures
            if (errorMessage.includes('No MultiFormat Readers')) {
              setError('QR code scanner not supported. Please use a different browser.');
            } else if (errorMessage.includes('Permission denied') || errorMessage.includes('NotAllowedError')) {
              setError('Camera permission denied. Please allow camera access and try again.');
            } else if (errorMessage.includes('NotFoundError') || errorMessage.includes('DevicesNotFoundError')) {
              setError('No camera found. Please ensure your device has a camera.');
            }
          }
        );
      } catch (err) {
        console.error('Error starting QR scanner:', err);
        let errorMessage = 'Failed to start camera';
        
        if (err instanceof Error) {
          if (err.message.includes('Permission denied') || err.message.includes('NotAllowedError')) {
            errorMessage = 'Camera permission denied. Please allow camera access in your browser settings.';
          } else if (err.message.includes('NotFoundError') || err.message.includes('DevicesNotFoundError')) {
            errorMessage = 'No camera found. Please ensure your device has a camera.';
          } else {
            errorMessage = err.message;
          }
        }
        
        setError(errorMessage);
        setIsScanning(false);
      }
    };

    startScanning();

    return () => {
      stopScanning();
    };
  }, [onScan]);

  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  const handleClose = async () => {
    await stopScanning();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Scan QR Code</h3>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        {/* Scanner Container */}
        <div className="p-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="relative">
            <div
              id="qr-reader"
              ref={containerRef}
              className="w-full rounded-lg overflow-hidden bg-black"
              style={{ minHeight: '300px' }}
            />
            
            {isScanning && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="border-2 border-white/50 rounded-lg" style={{ width: '250px', height: '250px' }} />
              </div>
            )}

            {!isScanning && !error && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            )}
          </div>

          <p className="mt-4 text-sm text-gray-600 text-center">
            Point your camera at a WalletConnect QR code
          </p>
        </div>
      </div>
    </div>
  );
}

