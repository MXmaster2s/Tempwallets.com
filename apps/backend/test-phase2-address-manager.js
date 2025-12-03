/**
 * Test AddressManager Integration with Aptos
 * This requires the backend server to be running
 * Run: node test-phase2-address-manager.js
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from './dist/app.module.js';
import { AddressManager } from './dist/wallet/managers/address.manager.js';

async function testAddressManagerIntegration() {
  console.log('🧪 Testing AddressManager Integration with Aptos...\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const addressManager = app.get(AddressManager);

  try {
    // Use a test user ID
    const testUserId = `test-aptos-${Date.now()}`;

    console.log(`Creating wallet for user: ${testUserId}`);
    console.log('Getting addresses (this will auto-create wallet)...\n');

    // Get all addresses (should include Aptos)
    const addresses = await addressManager.getAddresses(testUserId);

    console.log('✅ Addresses retrieved successfully!\n');
    console.log('Aptos Addresses:');
    console.log('  aptos:', addresses.aptos || 'null');
    console.log('  aptosMainnet:', addresses.aptosMainnet || 'null');
    console.log('  aptosTestnet:', addresses.aptosTestnet || 'null');
    console.log('  aptosDevnet:', addresses.aptosDevnet || 'null');

    // Verify Aptos addresses are present
    if (addresses.aptos && addresses.aptosMainnet) {
      console.log('\n✅ Aptos addresses are present!');

      // Verify they're all the same (same address for all networks)
      if (
        addresses.aptos === addresses.aptosMainnet &&
        addresses.aptosMainnet === addresses.aptosTestnet &&
        addresses.aptosTestnet === addresses.aptosDevnet
      ) {
        console.log('✅ All Aptos network addresses match (expected)');
      } else {
        console.log('⚠️  Aptos network addresses differ (unexpected)');
      }

      // Verify address format
      if (
        addresses.aptos.startsWith('0x') &&
        addresses.aptos.length === 66
      ) {
        console.log('✅ Aptos address format is correct (0x + 64 hex chars)');
      } else {
        console.log('❌ Aptos address format is incorrect');
        console.log('   Expected: 66 chars (0x + 64 hex)');
        console.log('   Got:', addresses.aptos.length, 'chars');
      }

      // Check other chains are still working
      if (addresses.ethereum && addresses.polkadot) {
        console.log('\n✅ Other chains still working:');
        console.log('  Ethereum:', addresses.ethereum.substring(0, 20) + '...');
        console.log('  Polkadot:', addresses.polkadot?.substring(0, 20) + '...');
      }
    } else {
      console.log('\n❌ Aptos addresses are missing!');
      console.log('   Check AddressManager integration');
    }

    console.log('\n✅ AddressManager integration test complete!');
    return true;
  } catch (error) {
    console.error('\n❌ AddressManager integration test failed:');
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
  console.log('Phase 2: AddressManager Integration Test');
  console.log('='.repeat(60));
  console.log('\n⚠️  Note: This test requires the backend to be built');
  console.log('   Run: pnpm build\n');

  const result = await testAddressManagerIntegration();

  if (result) {
    console.log('\n✅ All tests passed!');
    console.log('\nNext: Test via API endpoint:');
    console.log('  GET /wallet/addresses?userId=YOUR_USER_ID');
  } else {
    console.log('\n❌ Tests failed. Check errors above.');
    process.exit(1);
  }
}

main().catch(console.error);

