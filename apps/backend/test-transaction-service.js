/**
 * Test Transaction Service with SDK v5
 * Run: node test-transaction-service.js
 */

import { Aptos, AptosConfig, Network, Account, AccountAddress } from '@aptos-labs/ts-sdk';

const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

async function testSDKv5() {
  console.log('🧪 Testing SDK v5 Transaction Flow...\n');

  const config = new AptosConfig({ network: Network.DEVNET });
  const client = new Aptos(config);

  // Derive account
  const account = await Account.fromDerivationPath({
    mnemonic: TEST_MNEMONIC,
    path: "m/44'/637'/0'/0'/0",
    legacy: true,
  });

  console.log('Sender:', account.accountAddress.toString());

  // Build transaction
  console.log('\n1. Building transaction...');
  try {
    const transaction = await client.transaction.build.simple({
      sender: account.accountAddress,
      data: {
        function: '0x1::aptos_account::transfer',
        functionArguments: [AccountAddress.fromString('0x1'), 100], // Send 100 octas to 0x1
      },
    });
    console.log('✅ Transaction built');
    console.log('   Transaction type:', transaction.constructor.name);

    // Simulate
    console.log('\n2. Simulating...');
    const simulationResults = await client.transaction.simulate.simple({
      signerPublicKey: account.publicKey,
      transaction,
    });
    
    if (simulationResults && simulationResults.length > 0) {
      const simulation = simulationResults[0];
      console.log('✅ Simulation result:', simulation.success ? 'SUCCESS' : 'FAILED');
      console.log('   Gas used:', simulation.gas_used);
      console.log('   VM Status:', simulation.vm_status);
    } else {
      console.log('⚠️  No simulation results');
    }

    // Sign
    console.log('\n3. Signing...');
    const senderAuthenticator = client.transaction.sign({
      signer: account,
      transaction,
    });
    console.log('✅ Transaction signed');
    console.log('   Authenticator type:', senderAuthenticator.constructor.name);

    console.log('\n✅ All SDK v5 methods working!');
    console.log('\nNote: Not submitting to network (would require funded account)');
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Phase 3: SDK v5 Transaction API Test');
  console.log('='.repeat(60));
  console.log('\nThis test verifies the SDK v5 API structure\n');

  await testSDKv5();
}

main().catch(console.error);

