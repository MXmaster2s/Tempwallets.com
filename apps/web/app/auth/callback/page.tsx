'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState('Processing...');

  useEffect(() => {
    const token = searchParams.get('token');
    const user = searchParams.get('user');
    const error = searchParams.get('error');

    // Check if this was opened as a popup by looking at localStorage marker
    // window.opener is null due to COOP restrictions after Google redirect
    const isPopup = localStorage.getItem('auth_popup_open') === 'true';

    if (error) {
      console.error('Authentication error:', error);
      if (isPopup) {
        setStatus('Authentication failed. Closing...');
        // Don't remove the marker here - let the parent window handle cleanup
        setTimeout(() => {
          window.close();
        }, 1000);
      } else {
        router.push('/dashboard?error=auth_failed');
      }
      return;
    }

    if (token && user) {
      try {
        // Store token and user data - parent window will detect via storage event/polling
        localStorage.setItem('auth_token', token);
        localStorage.setItem('auth_user', user);
        
        setStatus('Authentication successful!');

        if (isPopup) {
          // We're in a popup - close it immediately
          // The parent window's localStorage polling will detect the auth and clean up
          setStatus('Closing...');
          window.close();
        } else {
          // Not in a popup, redirect to dashboard
          setStatus('Redirecting to dashboard...');
          router.push('/dashboard');
        }
      } catch (e) {
        console.error('Failed to store auth data:', e);
        router.push('/dashboard?error=auth_failed');
      }
    } else {
      // No token/user, redirect to dashboard or close popup
      if (isPopup) {
        window.close();
      } else {
        router.push('/dashboard');
      }
    }
  }, [searchParams, router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
        <p className="text-white">{status}</p>
        <p className="text-gray-400 text-sm mt-2">This window will close automatically</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-black">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-white">Loading...</p>
          </div>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}










