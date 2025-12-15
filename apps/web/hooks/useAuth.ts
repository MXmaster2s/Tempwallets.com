'use client';

import { useState, useEffect, useCallback } from 'react';
import { useBrowserFingerprint } from './useBrowserFingerprint';
import { trackAuth, identifyUser, aliasUser, resetMixpanel } from '@/lib/tempwallets-analytics';

export interface User {
  id: string;
  email: string | null;
  name: string | null;
  picture: string | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5005';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { fingerprint } = useBrowserFingerprint();

  useEffect(() => {
    // Load from localStorage on mount
    const storedToken = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('auth_user');

    if (storedToken && storedUser) {
      setToken(storedToken);
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error('Failed to parse stored user:', e);
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(() => {
    if (!fingerprint) {
      console.error('Fingerprint not available');
      return;
    }

    // Track sign-in button click
    trackAuth.signinClicked();

    const width = 500;
    const height = 600;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    // Store current auth state to detect changes
    const initialToken = localStorage.getItem('auth_token');
    const initialUser = localStorage.getItem('auth_user');

    // Mark that we're opening a popup (for the callback page to detect)
    localStorage.setItem('auth_popup_open', 'true');

    // Open OAuth popup
    const popup = window.open(
      `${API_URL}/auth/google?state=${encodeURIComponent(fingerprint)}`,
      'google-oauth',
      `width=${width},height=${height},left=${left},top=${top}`
    );

    if (!popup) {
      console.error('Popup blocked. Please allow popups for this site.');
      localStorage.removeItem('auth_popup_open'); // Clean up marker
      return;
    }

    let authCompleted = false;
    let checkAuthInterval: ReturnType<typeof setInterval>;
    let cleanupTimeout: ReturnType<typeof setTimeout>;

    // Helper function to complete auth process
    const completeAuth = (newToken: string, userData: User) => {
      if (authCompleted) return;
      authCompleted = true;

      setToken(newToken);
      setUser(userData);

      // Track successful login
      trackAuth.signinSuccess(userData.id, 'google');
      
      // Identify user in Mixpanel
      aliasUser(userData.id);
      identifyUser(userData.id, {
        email: userData.email,
        name: userData.name,
        picture: userData.picture,
      });

      // Clean up marker
      localStorage.removeItem('auth_popup_open');

      // Try to close popup - wrap in try-catch due to COOP restrictions
      try {
        if (popup) {
          popup.close();
        }
      } catch {
        // COOP blocks access to popup - that's fine, it will close itself
      }

      // Remove all listeners
      window.removeEventListener('message', messageHandler);
      window.removeEventListener('storage', storageHandler);
      clearInterval(checkAuthInterval);
      clearTimeout(cleanupTimeout);
    };

    // Listen for message from popup (when it redirects to callback page)
    const messageHandler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      if (event.data.type === 'auth_success') {
        const { token, user } = event.data;
        try {
          const userData = typeof user === 'string' ? JSON.parse(user) : user;
          localStorage.setItem('auth_token', token);
          localStorage.setItem('auth_user', JSON.stringify(userData));
          completeAuth(token, userData);
        } catch (e) {
          console.error('Failed to parse user data:', e);
        }
      }
    };

    // Listen for storage changes (fallback when popup redirects and updates localStorage)
    const storageHandler = (event: StorageEvent) => {
      if (event.key === 'auth_token' || event.key === 'auth_user') {
        const newToken = localStorage.getItem('auth_token');
        const newUser = localStorage.getItem('auth_user');

        if (newToken && newUser && (newToken !== initialToken || newUser !== initialUser)) {
          try {
            const userData = JSON.parse(newUser);
            completeAuth(newToken, userData);
          } catch (e) {
            console.error('Failed to parse user data from storage:', e);
          }
        }
      }
    };

    window.addEventListener('message', messageHandler);
    window.addEventListener('storage', storageHandler);

    // Check for localStorage changes periodically (fallback for COOP restrictions)
    checkAuthInterval = setInterval(() => {
      if (authCompleted) {
        clearInterval(checkAuthInterval);
        return;
      }

      // Note: We cannot check popup.closed due to COOP restrictions
      // Instead, we rely on localStorage polling and the popup_open marker
      // The popup will close itself and we detect auth via localStorage changes

      // Check if localStorage was updated
      const newToken = localStorage.getItem('auth_token');
      const newUser = localStorage.getItem('auth_user');

      if (newToken && newUser && (newToken !== initialToken || newUser !== initialUser)) {
        try {
          const userData = JSON.parse(newUser);
          completeAuth(newToken, userData);
        } catch (e) {
          console.error('Failed to parse user data:', e);
        }
      }
    }, 500); // Check every 500ms for faster response

    // Cleanup after 5 minutes
    cleanupTimeout = setTimeout(() => {
      if (!authCompleted) {
        console.log('Auth timeout - cleaning up');
        localStorage.removeItem('auth_popup_open');
        clearInterval(checkAuthInterval);
        window.removeEventListener('message', messageHandler);
        window.removeEventListener('storage', storageHandler);

        // Try to close popup - wrap in try-catch due to COOP restrictions
        try {
          if (popup) {
            popup.close();
          }
        } catch {
          // COOP blocks access to popup - that's fine
        }
      }
    }, 5 * 60 * 1000);
  }, [fingerprint]);

  const logout = useCallback(async () => {
    // Track logout event
    trackAuth.logout();
    
    // Reset Mixpanel on logout
    resetMixpanel();

    if (token) {
      try {
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {
        console.error('Logout request failed:', e);
      }
    }

    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_popup_open'); // Clean up marker if exists
    setToken(null);
    setUser(null);
  }, [token]);

  // Compute userId directly - use Google user ID when authenticated, otherwise fingerprint
  const userId = user?.id || fingerprint || null;

  return {
    user,
    token,
    loading,
    login,
    logout,
    isAuthenticated: !!user,
    getUserId: () => userId, // Simple getter that returns current userId
    userId, // Also expose userId directly
  };
}

