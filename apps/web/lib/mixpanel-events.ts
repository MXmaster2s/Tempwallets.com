/**
 * Mixpanel Event Tracking for Lightning Node and WalletConnect
 *
 * This file contains centralized tracking functions for key user actions.
 * Only tracks important events - not every single user action.
 */

import { trackEvent } from './mixpanel';

// ==========================================
// LIGHTNING NODE EVENTS
// ==========================================

/**
 * Track when a user successfully authenticates their wallet with Clearnode
 */
export const trackLightningWalletConnected = (params: {
  userId: string;
  walletAddress: string;
  chain: string;
  timestamp: number;
}) => {
  trackEvent('clearnode_connected', {
    user_id: params.userId,
    wallet_address: params.walletAddress,
    chain: params.chain,
    authenticated_at: new Date(params.timestamp).toISOString(),
    platform: 'web',
  });
};

/**
 * Track when a Lightning session is created (not discovered - only new ones)
 */
export const trackLightningSessionCreated = (params: {
  userId: string;
  sessionId: string;
  chain: string;
}) => {
  trackEvent('lightning_session_created', {
    user_id: params.userId,
    session_id: params.sessionId,
    chain: params.chain,
    created_at: new Date().toISOString(),
  });
};

/**
 * Track when a user joins an existing Lightning session
 */
export const trackLightningSessionJoined = (params: {
  userId: string;
  sessionId: string;
  chain: string;
}) => {
  trackEvent('lightning_session_joined', {
    user_id: params.userId,
    session_id: params.sessionId,
    chain: params.chain,
    joined_at: new Date().toISOString(),
  });
};

/**
 * Track sessions discovery results (only when sessions are found)
 */
export const trackLightningSessionsDiscovered = (params: {
  userId: string;
  chain: string;
  totalSessions: number;
  activeSessions: number;
  invitations: number;
}) => {
  // Only track if user has sessions (not empty results)
  if (params.totalSessions > 0) {
    trackEvent('lightning_sessions_discovered', {
      user_id: params.userId,
      chain: params.chain,
      total_sessions: params.totalSessions,
      active_sessions: params.activeSessions,
      invitations: params.invitations,
      discovered_at: new Date().toISOString(),
    });
  }
};

/**
 * Track authentication failures (important for debugging)
 */
export const trackLightningAuthFailed = (params: {
  userId: string;
  chain: string;
  errorMessage: string;
}) => {
  trackEvent('lightning_auth_failed', {
    user_id: params.userId,
    chain: params.chain,
    error_message: params.errorMessage,
    failed_at: new Date().toISOString(),
  });
};

// ==========================================
// WALLETCONNECT EVENTS
// ==========================================

/**
 * Track WalletConnect initialization (only on first successful init)
 */
export const trackWalletConnectInitialized = (params: {
  userId: string;
}) => {
  trackEvent('walletconnect_initialized', {
    user_id: params.userId,
    initialized_at: new Date().toISOString(),
    platform: 'web',
  });
};

/**
 * Track when a session proposal is received from a dApp
 */
export const trackWalletConnectProposalReceived = (params: {
  userId: string;
  proposalId: number;
  dappName: string;
  dappUrl: string;
  requiredChains: string[];
  optionalChains: string[];
}) => {
  trackEvent('walletconnect_proposal_received', {
    user_id: params.userId,
    proposal_id: params.proposalId,
    dapp_name: params.dappName,
    dapp_url: params.dappUrl,
    required_chains: params.requiredChains,
    optional_chains: params.optionalChains,
    total_chains: params.requiredChains.length + params.optionalChains.length,
    received_at: new Date().toISOString(),
  });
};

/**
 * Track when a user approves a WalletConnect session
 */
export const trackWalletConnectSessionApproved = (params: {
  userId: string;
  proposalId: number;
  dappName: string;
  dappUrl: string;
  approvedChains: number[];
  accountCount: number;
  hasEip7702: boolean;
}) => {
  trackEvent('walletconnect_session_approved', {
    user_id: params.userId,
    proposal_id: params.proposalId,
    dapp_name: params.dappName,
    dapp_url: params.dappUrl,
    approved_chains: params.approvedChains,
    chain_count: params.approvedChains.length,
    account_count: params.accountCount,
    has_eip7702: params.hasEip7702,
    approved_at: new Date().toISOString(),
  });
};

/**
 * Track when a user rejects a WalletConnect session proposal
 */
export const trackWalletConnectSessionRejected = (params: {
  userId: string;
  proposalId: number;
  dappName: string;
  reason: string;
}) => {
  trackEvent('walletconnect_session_rejected', {
    user_id: params.userId,
    proposal_id: params.proposalId,
    dapp_name: params.dappName,
    rejection_reason: params.reason,
    rejected_at: new Date().toISOString(),
  });
};

/**
 * Track when a signing request is received from a dApp
 */
export const trackWalletConnectRequestReceived = (params: {
  userId: string;
  requestId: number;
  dappName: string;
  method: string;
  chainId: string;
}) => {
  trackEvent('walletconnect_request_received', {
    user_id: params.userId,
    request_id: params.requestId,
    dapp_name: params.dappName,
    method: params.method,
    chain_id: params.chainId,
    received_at: new Date().toISOString(),
  });
};

/**
 * Track when a user successfully signs a request
 */
export const trackWalletConnectRequestSigned = (params: {
  userId: string;
  requestId: number;
  dappName: string;
  method: string;
  chainId: string;
  signatureDuration?: number; // milliseconds
}) => {
  trackEvent('walletconnect_request_signed', {
    user_id: params.userId,
    request_id: params.requestId,
    dapp_name: params.dappName,
    method: params.method,
    chain_id: params.chainId,
    signature_duration_ms: params.signatureDuration,
    signed_at: new Date().toISOString(),
  });
};

/**
 * Track when a user rejects a signing request
 */
export const trackWalletConnectRequestRejected = (params: {
  userId: string;
  requestId: number;
  dappName: string;
  method: string;
  reason: string;
}) => {
  trackEvent('walletconnect_request_rejected', {
    user_id: params.userId,
    request_id: params.requestId,
    dapp_name: params.dappName,
    method: params.method,
    rejection_reason: params.reason,
    rejected_at: new Date().toISOString(),
  });
};

/**
 * Track when a WalletConnect session is disconnected
 */
export const trackWalletConnectSessionDisconnected = (params: {
  userId: string;
  topic: string;
  dappName: string;
  initiatedBy: 'user' | 'dapp';
}) => {
  trackEvent('walletconnect_session_disconnected', {
    user_id: params.userId,
    topic: params.topic,
    dapp_name: params.dappName,
    initiated_by: params.initiatedBy,
    disconnected_at: new Date().toISOString(),
  });
};

/**
 * Track when pairing (QR/URI) is successful
 */
export const trackWalletConnectPairingSuccess = (params: {
  userId: string;
  method: 'qr' | 'uri';
}) => {
  trackEvent('walletconnect_pairing_success', {
    user_id: params.userId,
    pairing_method: params.method,
    paired_at: new Date().toISOString(),
  });
};

/**
 * Track errors during session approval
 */
export const trackWalletConnectApprovalFailed = (params: {
  userId: string;
  proposalId: number;
  dappName: string;
  errorMessage: string;
}) => {
  trackEvent('walletconnect_approval_failed', {
    user_id: params.userId,
    proposal_id: params.proposalId,
    dapp_name: params.dappName,
    error_message: params.errorMessage,
    failed_at: new Date().toISOString(),
  });
};

/**
 * Track errors during request signing
 */
export const trackWalletConnectSigningFailed = (params: {
  userId: string;
  requestId: number;
  dappName: string;
  method: string;
  errorMessage: string;
}) => {
  trackEvent('walletconnect_signing_failed', {
    user_id: params.userId,
    request_id: params.requestId,
    dapp_name: params.dappName,
    method: params.method,
    error_message: params.errorMessage,
    failed_at: new Date().toISOString(),
  });
};
