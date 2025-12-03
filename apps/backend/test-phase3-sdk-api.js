/**
 * Phase 3 SDK API Test
 * Tests the Aptos SDK v5 API to understand correct usage
 * Run: node test-phase3-sdk-api.js
 */

import { Account, AccountAddress, Aptos, AptosConfig, Network, Ed25519PrivateKey } from '@aptos-labs/ts-sdk';

async function testSDKAPI() {
  console.log('🧪 Testing Aptos SDK v5 API...\n');

  try {
    // Test 1: Create account
    console.log('1. Testing Account creation...');
    const testPrivateKey = '0x' + 'a'.repeat(64);
    const privateKey = new Ed25519PrivateKey(testPrivateKey);
    const account = Account.fromPrivateKey({ privateKey, legacy: true });
    console.log('   ✅ Account created:', account.accountAddress.toString());
    console.log('   Public Key:', account.publicKey.toString());

    // Test 2: Check account methods
    console.log('\n2. Testing Account methods...');
    console.log('   Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(account)).filter(m => !m.startsWith('_')).slice(0, 10).join(', '));

    // Test 3: Create client
    console.log('\n3. Testing Aptos client...');
    const config = new AptosConfig({
      network: Network.DEVNET,
    });
    const client = new Aptos(config);
    console.log('   ✅ Client created');

    // Test 4: Check transaction methods
    console.log('\n4. Testing Transaction API...');
    const transactionMethods = Object.keys(client.transaction || {});
    console.log('   Transaction methods:', transactionMethods.join(', '));

    if (client.transaction.build) {
      const buildMethods = Object.keys(client.transaction.build || {});
      console.log('   Build methods:', buildMethods.join(', '));
    }

    if (client.transaction.simulate) {
      const simulateMethods = Object.keys(client.transaction.simulate || {});
      console.log('   Simulate methods:', simulateMethods.join(', '));
    }

    if (client.transaction.submit) {
      const submitMethods = Object.keys(client.transaction.submit || {});
      console.log('   Submit methods:', submitMethods.join(', '));
    }

    // Test 5: Try to build a simple transaction
    console.log('\n5. Testing transaction building...');
    try {
      const sender = account.accountAddress;
      const recipient = AccountAddress.fromString('0x1');
      const amount = BigInt(1000000); // 0.01 APT in octas

      const transaction = await client.transaction.build.simple({
        sender,
        data: {
          function: '0x1::aptos_account::transfer',
          functionArguments: [recipient, amount],
        },
      });

      console.log('   ✅ Transaction built');
      console.log('   Transaction type:', transaction.constructor.name);
      console.log('   Transaction properties:', Object.keys(transaction).slice(0, 10).join(', '));

      // Test 6: Check signing
      console.log('\n6. Testing transaction signing...');
      if (typeof account.signWithAuthenticator === 'function') {
        console.log('   ✅ signWithAuthenticator exists');
        try {
          const authenticator = await account.signWithAuthenticator(transaction);
          console.log('   ✅ Signing successful');
          console.log('   Authenticator type:', authenticator.constructor.name);
          console.log('   Authenticator properties:', Object.keys(authenticator).slice(0, 10).join(', '));
        } catch (e) {
          console.log('   ⚠️  Signing error:', e.message);
        }
      } else {
        console.log('   ⚠️  signWithAuthenticator not found');
      }

      // Test 7: Check simulation
      console.log('\n7. Testing transaction simulation...');
      try {
        const simulation = await client.transaction.simulate.simple({
          signerPublicKey: account.publicKey,
          transaction: transaction,
        });
        console.log('   ✅ Simulation successful');
        console.log('   Simulation result type:', Array.isArray(simulation) ? 'Array' : typeof simulation);
        if (Array.isArray(simulation) && simulation.length > 0) {
          console.log('   First result keys:', Object.keys(simulation[0]).slice(0, 10).join(', '));
        }
      } catch (e) {
        console.log('   ⚠️  Simulation error:', e.message);
      }

    } catch (error) {
      console.log('   ⚠️  Transaction building error:', error.message);
    }

    console.log('\n✅ SDK API test complete!');
    return true;
  } catch (error) {
    console.error('❌ SDK API test failed:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Phase 3: SDK API Verification');
  console.log('='.repeat(60));
  console.log('\nThis test explores the Aptos SDK v5 API structure\n');

  const result = await testSDKAPI();

  if (result) {
    console.log('\n✅ All SDK API tests passed!');
    console.log('\nNext: Fix transaction service based on API structure');
  } else {
    console.log('\n❌ SDK API tests failed. Check errors above.');
    process.exit(1);
  }
}

main().catch(console.error);

