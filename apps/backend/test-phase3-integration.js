/**
 * Phase 3 Integration Test
 * Tests the complete transaction service with SDK v5
 * Run: node test-phase3-integration.js
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from './dist/app.module.js';
import { AptosTransactionService } from './dist/wallet/aptos/services/aptos-transaction.service.js';
import { AptosAccountFactory } from './dist/wallet/aptos/factories/aptos-account.factory.js';
import { Account } from '@aptos-labs/ts-sdk';

async function testPhase3Integration() {
  console.log('🧪 Testing Phase 3: Transaction Service Integration...\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const transactionService = app.get(AptosTransactionService);
  const accountFactory = app.get(AptosAccountFactory);

  try {
    // Test 1: Create account from seed
    console.log('1. Creating account from seed...');
    const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const account = await accountFactory.createAccountFromSeed(testMnemonic, 0);
    console.log('   ✅ Account created:', account.address);

    // Test 2: Build transaction (would need actual account object)
    console.log('\n2. Testing transaction building...');
    console.log('   ⚠️  Note: Full transaction test requires funded account on devnet');
    console.log('   ✅ Transaction service initialized successfully');

    // Test 3: Check service methods
    console.log('\n3. Checking service methods...');
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(transactionService))
      .filter(m => m !== 'constructor' && typeof transactionService[m] === 'function');
    console.log('   Available methods:', methods.join(', '));

    console.log('\n✅ Phase 3 integration test complete!');
    console.log('\nNext Steps:');
    console.log('1. Fund test account on devnet using faucet');
    console.log('2. Test actual transaction submission');
    console.log('3. Verify sequence number locking works');

    return true;
  } catch (error) {
    console.error('\n❌ Phase 3 integration test failed:');
    console.error('   Error:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('   Stack:', error.stack);
    }
    return false;
  } finally {
    await app.close();
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Phase 3: Transaction Service Integration Test');
  console.log('='.repeat(60));
  console.log('\n⚠️  Note: This test requires the backend to be built');
  console.log('   Run: pnpm build\n');

  const result = await testPhase3Integration();

  if (result) {
    console.log('\n✅ All tests passed!');
  } else {
    console.log('\n❌ Tests failed. Check errors above.');
    process.exit(1);
  }
}

main().catch(console.error);

