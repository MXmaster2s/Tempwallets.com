/**
 * Test script following the yellow-sdk-tutorials exactly
 * Run with: npx ts-node scripts/test-create-channel.ts
 * 
 * Make sure to set environment variables:
 * - TEST_SEED_PHRASE or SEED_PHRASE
 * - BASE_RPC_URL (optional)
 */

import { createPublicClient, createWalletClient, http } from 'viem';
import { mnemonicToAccount, generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import pkg from '@erc7824/nitrolite';
const {
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createCreateChannelMessage,
  createEIP712AuthMessageSigner,
  createECDSAMessageSigner,
  NitroliteClient,
  WalletStateSigner,
} = pkg;
import WebSocket from 'ws';

function getBaseContractAddresses() {
  return {
    custody: '0x490fb189DdE3a01B00be9BA5F41e3447FbC838b6' as `0x${string}`,
    adjudicator: '0x7de4A0736Cf5740fD3Ca2F2e9cc85c9AC223eF0C' as `0x${string}`,
  };
}

const USDC_TOKEN_BASE = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const BASE_CHAIN_ID = base.id;

// Generate session key
function generateSessionKey() {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return { privateKey, address: account.address };
}

async function main() {
  // Load seed phrase from environment
  const seedPhrase = process.env.TEST_SEED_PHRASE || process.env.SEED_PHRASE;
  if (!seedPhrase) {
    console.error('❌ Please set TEST_SEED_PHRASE or SEED_PHRASE environment variable');
    process.exit(1);
  }

  const wallet = mnemonicToAccount(seedPhrase);
  console.log('👛 Wallet address:', wallet.address);

  const walletClient = createWalletClient({
    account: wallet,
    chain: base,
    transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
  });

  const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
  });

  const sessionKey = generateSessionKey();
  console.log('🔑 Session key:', sessionKey.address);

  const sessionSigner = createECDSAMessageSigner(sessionKey.privateKey);
  const sessionExpireTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600);

  // Connect to Yellow Network
  const ws = new WebSocket('wss://clearnet.yellow.com/ws');

  ws.on('open', async () => {
    console.log('🔌 Connected to Yellow clearnet');

    // Step 1: Request authentication
    const authMessage = await createAuthRequestMessage({
      address: wallet.address,
      session_key: sessionKey.address,
      application: 'Test app',
      allowances: [{ asset: 'usdc', amount: '0.01' }],
      expires_at: sessionExpireTimestamp,
      scope: 'test.app',
    });

    console.log('📤 Sending auth request...');
    ws.send(JSON.stringify(authMessage));
  });

  ws.on('message', async (data: WebSocket.Data) => {
    const message = JSON.parse(data.toString());
    
    // Handle res format: [requestId, method, params, timestamp]
    if (message.res) {
      const [requestId, method, params] = message.res;
      console.log(`\n📩 Response: ${method}`);

      if (method === 'auth_challenge') {
        console.log('🔐 Received auth challenge:', params.challenge);

        const authParams = {
          scope: 'test.app',
          application: wallet.address,
          participant: sessionKey.address,
          expire: sessionExpireTimestamp,
          allowances: [{ asset: 'usdc', amount: '0.01' }],
          session_key: sessionKey.address,
          expires_at: sessionExpireTimestamp,
        };

        const eip712Signer = createEIP712AuthMessageSigner(walletClient, authParams, { name: 'Test app' });
        
        // Build AuthChallengeResponse in expected format
        const authChallengeResponse = {
          method: 'auth_challenge',
          params: { challenge: params.challenge },
        };

        const authVerifyMessage = await createAuthVerifyMessage(eip712Signer, authChallengeResponse as any);

        console.log('📤 Sending auth verify...');
        ws.send(JSON.stringify(authVerifyMessage));
      } 
      else if (method === 'auth_verify') {
        if (params.success) {
          console.log('✅ Authentication successful');

          // Step 2: Create channel
          const createChannelMessage = await createCreateChannelMessage(sessionSigner, {
            chain_id: BASE_CHAIN_ID,
            token: USDC_TOKEN_BASE as `0x${string}`,
          });

          console.log('📤 Creating channel for USDC on Base...');
          ws.send(JSON.stringify(createChannelMessage));
        } else {
          console.error('❌ Authentication failed:', params);
          ws.close();
        }
      } 
      else if (method === 'create_channel') {
        console.log('🧬 Channel response received!');
        console.log('\n📋 Raw response params:');
        console.log(JSON.stringify(params, null, 2));

        // Log field names for debugging
        console.log('\n🔍 Field names in response:');
        console.log('  Top-level keys:', Object.keys(params));
        if (params.state) {
          console.log('  state keys:', Object.keys(params.state));
        }

        // Create NitroliteClient exactly as tutorial
        const nitroliteClient = new NitroliteClient({
          walletClient,
          publicClient: publicClient as any,
          stateSigner: new WalletStateSigner(walletClient),
          addresses: getBaseContractAddresses(),
          chainId: BASE_CHAIN_ID,
          challengeDuration: 3600n,
        });

        // Extract with both camelCase and snake_case fallbacks
        const channel = params.channel;
        const state = params.state;
        const serverSignature = params.serverSignature || params.server_signature;
        const stateData = state?.stateData || state?.state_data || '0x';

        console.log('\n🔧 Creating channel on-chain with:');
        console.log('  channel.participants:', channel?.participants);
        console.log('  channel.challenge:', channel?.challenge);
        console.log('  channel.nonce:', channel?.nonce);
        console.log('  state.intent:', state?.intent);
        console.log('  state.version:', state?.version);
        console.log('  stateData:', stateData);
        console.log('  serverSignature:', serverSignature?.substring(0, 20) + '...');

        try {
          // Call createChannel exactly like tutorial
          const { channelId, txHash } = await nitroliteClient.createChannel({
            channel: channel as any,
            unsignedInitialState: {
              intent: state.intent,
              version: BigInt(state.version),
              data: stateData as `0x${string}`,
              allocations: state.allocations,
            },
            serverSignature: serverSignature as `0x${string}`,
          });

          console.log(`\n✅ SUCCESS! Channel created:`);
          console.log(`  Channel ID: ${channelId}`);
          console.log(`  TX Hash: ${txHash}`);
        } catch (error: any) {
          console.error('\n❌ Error creating channel on-chain:');
          console.error('  Message:', error.message);
          if (error.cause?.shortMessage) {
            console.error('  Cause:', error.cause.shortMessage);
          }
          if (error.details) {
            console.error('  Details:', JSON.stringify(error.details, null, 2));
          }
        }

        ws.close();
      } 
      else if (method === 'error') {
        console.error('❌ Yellow Network error:', params);
        ws.close();
      }
    }
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });

  ws.on('close', () => {
    console.log('\n🔌 Disconnected');
  });
}

main().catch(console.error);
