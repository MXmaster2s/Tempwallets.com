"use client";

import { useEffect, useRef } from "react";
import { trackUserJourney } from "@/lib/tempwallets-analytics";

export function DashboardTracker() {
  const hasTracked = useRef(false);

  useEffect(() => {
    if (!hasTracked.current) {
      // Track wallet viewed when dashboard loads
      trackUserJourney.walletViewed();
      hasTracked.current = true;
    }
  }, []);

  return null;
}