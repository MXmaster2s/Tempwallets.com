"use client";

import { useEffect, useRef } from "react";
import { trackPageVisit } from "@/lib/tempwallets-analytics";

export function LandingPageTracker() {
  const hasTracked = useRef(false);

  useEffect(() => {
    if (!hasTracked.current) {
      // Track about page visit (simple, no auth state needed)
      trackPageVisit.about();
      hasTracked.current = true;
    }
  }, []);

  return null;
}
