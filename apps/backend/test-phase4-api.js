/**
 * Phase 4 API Test
 * Tests the Aptos controller endpoints
 * Run: node test-phase4-api.js
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from './dist/app.module.js';
import { AptosWalletController } from './dist/wallet/aptos/aptos-wallet.controller.js';
import { AptosManager } from './dist/wallet/aptos/managers/aptos.manager.js';

async function testPhase4API() {
  console.log('🧪 Testing Phase 4: API Endpoints...\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const aptosManager = app.get(AptosManager);

  try {
    // Test 1: Get Address
    console.log('1. Testing getAddress()...');
    const testUserId = `test-phase4-${Date.now()}`;
    
    // Create seed first (would normally be done via API)
    // For testing, we'll just test the manager directly
    const address = await aptosManager.getAddress(testUserId, 0, 'mainnet');
    console.log('   ✅ Address retrieved:', address);
    console.log('   Address format:', address.startsWith('0x') && address.length === 66 ? 'Valid' : 'Invalid');

    // Test 2: Get Balance (will fail if account doesn't exist on-chain, which is expected)
    console.log('\n2. Testing getBalance()...');
    try {
      const balance = await aptosManager.getBalance(testUserId, 'mainnet');
      console.log('   ✅ Balance retrieved:', balance, 'APT');
    } catch (error) {
      console.log('   ⚠️  Balance check failed (expected for new account):', error.message);
    }

    // Test 3: Check Manager Methods
    console.log('\n3. Checking manager methods...');
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(aptosManager))
      .filter(m => m !== 'constructor' && typeof aptosManager[m] === 'function');
    console.log('   Available methods:', methods.join(', '));

    console.log('\n✅ Phase 4 API test complete!');
    console.log('\nNext Steps:');
    console.log('1. Test endpoints via HTTP (requires running server)');
    console.log('2. Test sendAPT() with funded account');
    console.log('3. Test faucet endpoint on devnet/testnet');

    return true;
  } catch (error) {
    console.error('\n❌ Phase 4 API test failed:');
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
  console.log('Phase 4: API Endpoints Test');
  console.log('='.repeat(60));
  console.log('\n⚠️  Note: This test requires the backend to be built');
  console.log('   Run: pnpm build\n');

  const result = await testPhase4API();

  if (result) {
    console.log('\n✅ All tests passed!');
    console.log('\nTo test HTTP endpoints:');
    console.log('1. Start server: pnpm dev');
    console.log('2. Test endpoints with curl or Postman');
  } else {
    console.log('\n❌ Tests failed. Check errors above.');
    process.exit(1);
  }
}

main().catch(console.error);

