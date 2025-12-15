// lib/tempwallets-analytics.ts
// Centralized analytics helper for Tempwallets.com

import {
  trackEvent,
  identifyUser,
  aliasUser,
  resetMixpanel,
} from "./mixpanel";

// Re-export Mixpanel functions for direct use
export { identifyUser, aliasUser, resetMixpanel };

/**
 * Track guest vs registered user visits
 */
export const trackUserVisit = (
  isAuthenticated: boolean,
  userId?: string,
) => {
  if (isAuthenticated && userId) {
    trackEvent("registered_user_visit", {
      userId,
      userType: "registered",
    });
  } else {
    trackEvent("guest_visit", {
      userType: "guest",
    });
  }
};

/**
 * Track wallet generation with success/failure
 */
export const trackWalletGeneration = {
  initiated: () => {
    trackEvent("wallet_generation_initiated");
  },
  success: (walletAddress: string, network: string, duration: number) => {
    trackEvent("wallet_generated", {
      walletAddress,
      network,
      duration,
    });
  },
  failed: (error: string, errorCode?: string) => {
    trackEvent("wallet_generation_failed", {
      error,
      errorCode,
    });
  },
};

/**
 * Track button interactions
 */
export const trackButtonClick = {
  send: () => trackEvent("send_button_clicked"),
  receive: () => trackEvent("receive_button_clicked"),
  change: () => trackEvent("change_button_clicked"),
  signin: () => trackEvent("signin_button_clicked"),
  signup: () => trackEvent("signup_button_clicked"),
};

/**
 * Track transaction events
 */
export const trackTransaction = {
  sendClicked: () => trackEvent("send_button_clicked"),
  sendCompleted: (
    txHash: string,
    amount: string,
    token: string,
    chain?: string,
  ) => {
    trackEvent("send_transaction_completed", {
      txHash,
      amount,
      token,
      chain,
    });
  },
  sendFailed: (error: string, errorCode?: string | number) => {
    trackEvent("send_transaction_failed", {
      error,
      errorCode,
    });
  },
};

/**
 * Track authentication events
 */
export const trackAuth = {
  signupClicked: () => trackEvent("signup_button_clicked"),
  signupSuccess: (userId: string, email?: string) => {
    trackEvent("user_signup", { userId, email });
    aliasUser(userId);
    identifyUser(userId, { email });
  },
  signupFailed: (error: string) => {
    trackEvent("user_signup_failed", { error });
  },
  signinClicked: () => trackEvent("signin_button_clicked"),
  signinSuccess: (userId: string, method?: string) => {
    trackEvent("user_login", { userId, method });
  },
  signinFailed: (error: string, errorCode?: string) => {
    trackEvent("user_login_failed", { error, errorCode });
  },
  logout: () => {
    trackEvent("user_logout");
  },
};

/**
 * Track change button events
 */
export const trackChangeButton = {
  clicked: () => trackEvent("change_button_clicked"),
  failed: (error: string, errorCode?: string) => {
    trackEvent("change_button_failed", { error, errorCode });
  },
};

/**
 * Track user journey events
 */
export const trackUserJourney = {
  walletViewed: (chainId?: string) => {
    trackEvent("wallet_viewed", { chainId });
  },
  balanceChecked: (chainId?: string) => {
    trackEvent("balance_checked", { chainId });
  },
  transactionHistoryViewed: () => {
    trackEvent("transaction_history_viewed");
  },
};

/**
 * Track page visits (simple, no auth state needed)
 */
export const trackPageVisit = {
  about: () => {
    trackEvent("about_page_visited");
  },
};

