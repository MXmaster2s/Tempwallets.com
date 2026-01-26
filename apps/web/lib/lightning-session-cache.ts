/**
 * Lightning Node Session Cache
 * 
 * Caches session keys in localStorage to avoid reconnections
 * Session keys expire after 24 hours
 */

const SESSION_CACHE_KEY_PREFIX = 'lightning_session_';
const SESSION_EXPIRY_HOURS = 24;

interface SessionCacheData {
  userId: string;
  chain: string;
  walletAddress: string;
  sessionKey: string;
  jwtToken: string;
  expiresAt: number; // timestamp in ms
  cachedAt: number; // timestamp when cached
}

/**
 * Get cached session for a user and chain
 */
export function getCachedSession(userId: string, chain: string): SessionCacheData | null {
  try {
    const cacheKey = `${SESSION_CACHE_KEY_PREFIX}${userId}_${chain}`;
    const cached = localStorage.getItem(cacheKey);
    
    if (!cached) {
      return null;
    }

    const data: SessionCacheData = JSON.parse(cached);
    
    // Check if expired
    if (Date.now() >= data.expiresAt) {
      console.log('[SessionCache] Session expired, clearing cache');
      clearCachedSession(userId, chain);
      return null;
    }

    const remainingHours = Math.floor((data.expiresAt - Date.now()) / (60 * 60 * 1000));
    console.log(`[SessionCache] ✅ Found valid session (expires in ${remainingHours}h)`);
    
    return data;
  } catch (err) {
    console.error('[SessionCache] Error reading cache:', err);
    return null;
  }
}

/**
 * Cache session data
 */
export function cacheSession(data: Omit<SessionCacheData, 'cachedAt'>): void {
  try {
    const cacheKey = `${SESSION_CACHE_KEY_PREFIX}${data.userId}_${data.chain}`;
    const cacheData: SessionCacheData = {
      ...data,
      cachedAt: Date.now(),
    };
    
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    
    const expiresInHours = Math.floor((data.expiresAt - Date.now()) / (60 * 60 * 1000));
    console.log(`[SessionCache] ✅ Session cached (expires in ${expiresInHours}h)`);
  } catch (err) {
    console.error('[SessionCache] Error caching session:', err);
  }
}

/**
 * Clear cached session
 */
export function clearCachedSession(userId: string, chain: string): void {
  try {
    const cacheKey = `${SESSION_CACHE_KEY_PREFIX}${userId}_${chain}`;
    localStorage.removeItem(cacheKey);
    console.log('[SessionCache] Session cache cleared');
  } catch (err) {
    console.error('[SessionCache] Error clearing cache:', err);
  }
}

/**
 * Clear all cached sessions for a user
 */
export function clearAllCachedSessions(userId: string): void {
  try {
    const keys = Object.keys(localStorage);
    const userKeys = keys.filter(k => k.startsWith(`${SESSION_CACHE_KEY_PREFIX}${userId}_`));
    
    userKeys.forEach(key => localStorage.removeItem(key));
    console.log(`[SessionCache] Cleared ${userKeys.length} cached session(s)`);
  } catch (err) {
    console.error('[SessionCache] Error clearing all caches:', err);
  }
}
