"use client";

import { useEffect, useRef } from "react";
import { initMixpanel } from "@/lib/mixpanel";
import { trackUserVisit } from "@/lib/tempwallets-analytics";
import { useAuth } from "@/hooks/useAuth";

export function MixpanelProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, userId, loading } = useAuth();
  const hasTrackedVisit = useRef(false);
  const hasInitialized = useRef(false);

  // Initialize Mixpanel ONCE when app mounts
  useEffect(() => {
    if (!hasInitialized.current) {
      initMixpanel();
      hasInitialized.current = true;
    }
  }, []);

  // Track user type on first meaningful visit (after auth state is determined)
  useEffect(() => {
    if (!loading && !hasTrackedVisit.current) {
      if (isAuthenticated && userId) {
        trackUserVisit(true, userId);
      } else {
        trackUserVisit(false);
      }
      hasTrackedVisit.current = true;
    }
  }, [isAuthenticated, userId, loading]);

  return <>{children}</>;
}

