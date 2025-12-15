import mixpanel from "mixpanel-browser";

let initialized = false;
let cachedToken: string | undefined;
let tokenWarningShown = false; // Prevent repeated warnings

const getToken = () => {
  if (typeof window === "undefined") return undefined;

  if (cachedToken) {
    return cachedToken;
  }

  const token =
    process.env.NEXT_PUBLIC_MIXPANEL_TOKEN ??
    process.env.NEXT_PUBLIC_MIXPANEL_TOKEN_DEV;

  if (!token) {
    // Only warn once
    if (!tokenWarningShown) {
      console.warn("Mixpanel token is not configured.");
      tokenWarningShown = true;
    }
    return undefined;
  }

  cachedToken = token;
  return token;
};

// Initialize Mixpanel ONCE at app startup
export const initMixpanel = () => {
  if (initialized) return;

  const token = getToken();
  if (!token) return;

  mixpanel.init(token, {
    debug: process.env.NODE_ENV === "development",
    track_pageview: false, // DISABLE automatic tracking to prevent duplicates
    persistence: "localStorage",
    batch_size: 50,
    batch_interval: 30000, // Send events every 30 seconds or when batch full
    record_sessions_percent: 10, // Record 10% of sessions for heatmaps (cost optimization)
    opt_track_anonID: false,
  });

  initialized = true;
  const distinctId = mixpanel.get_distinct_id();
  if (process.env.NODE_ENV === "development") {
    console.log("Mixpanel initialized with distinct_id:", distinctId);
  }
};

// Track events with deduplication
export const trackEvent = (
  eventName: string,
  properties?: Record<string, unknown>,
) => {
  if (typeof window === "undefined") return;

  const token = getToken();
  if (!token) return;

  if (!initialized) {
    initMixpanel();
  }

  if (!initialized) {
    // still false when token missing
    return;
  }

  const eventId = `${eventName}_${Date.now()}_${Math.random()}`;

  mixpanel.track(eventName, {
    ...properties,
    $insert_id: eventId, // CRITICAL: Unique ID prevents duplicate events
    timestamp: new Date().toISOString(),
  });

  if (process.env.NODE_ENV === "development") {
    console.log("[Mixpanel Track]", eventName, properties);
  }
};

// Identify user
export const identifyUser = (
  userId: string,
  traits?: Record<string, unknown>,
) => {
  if (typeof window === "undefined") return;

  const token = getToken();
  if (!token) return;

  if (!initialized) {
    initMixpanel();
  }

  if (!initialized) return;

  mixpanel.identify(userId);

  if (traits) {
    mixpanel.people.set({
      $name: traits.name as string,
      $email: traits.email as string,
      ...traits,
    });
  }
};

// Alias for anonymous to identified user transition
export const aliasUser = (userId: string) => {
  if (typeof window === "undefined") return;

  const token = getToken();
  if (!token) return;

  if (!initialized) {
    initMixpanel();
  }

  if (!initialized) return;

  mixpanel.alias(userId);
};

// Reset on logout
export const resetMixpanel = () => {
  if (typeof window === "undefined") return;

  const token = getToken();
  if (!token) return;

  if (!initialized) return;

  mixpanel.reset();
};

// Legacy export for backward compatibility
export const trackMixpanelEvent = trackEvent;

export default mixpanel;
