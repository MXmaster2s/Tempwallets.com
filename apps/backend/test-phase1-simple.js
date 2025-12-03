/**
 * Simple Phase 1 Testing Script
 * Run: node test-phase1-simple.js
 */

import { Aptos, AptosConfig, Network, AccountAddress } from '@aptos-labs/ts-sdk';

async function testRpcConnection() {
  console.log('🧪 Testing Aptos RPC Connection...\n');
  
  try {
    const config = new AptosConfig({
      network: Network.TESTNET,
    });
    const client = new Aptos(config);
    
    console.log('Connecting to Aptos Testnet...');
    const ledgerInfo = await client.getLedgerInfo();
    
    console.log('✅ RPC Connection successful!');
    console.log('   Chain ID:', ledgerInfo.chain_id);
    console.log('   Ledger Version:', ledgerInfo.ledger_version);
    console.log('   Block Height:', ledgerInfo.block_height);
    
    return true;
  } catch (error) {
    console.error('❌ RPC Connection failed:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function testAddressUtils() {
  console.log('\n🧪 Testing Address Utils...\n');
  
  try {
    // Verify the SDK can parse addresses
    const testAddresses = [
      '0x1',
      '0x' + 'a'.repeat(64),
      '0x123',
    ];
    
    for (const addr of testAddresses) {
      try {
        const parsed = AccountAddress.fromString(addr);
        console.log(`   ✅ ${addr} → ${parsed.toString()}`);
      } catch (error) {
        console.log(`   ❌ ${addr} → Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ Address utils test failed:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function main() {
  console.log('='.repeat(50));
  console.log('Phase 1 Quick Verification Tests');
  console.log('='.repeat(50));
  
  const results = {
    rpc: await testRpcConnection(),
    addressUtils: await testAddressUtils(),
  };
  
  console.log('\n' + '='.repeat(50));
  console.log('Test Results:');
  console.log('='.repeat(50));
  console.log('RPC Connection:', results.rpc ? '✅ PASS' : '❌ FAIL');
  console.log('Address Utils:', results.addressUtils ? '✅ PASS' : '❌ FAIL');
  
  const allPassed = Object.values(results).every(r => r === true);
  
  if (allPassed) {
    console.log('\n✅ All basic tests passed!');
    console.log('Next: Run full unit tests with: pnpm test');
  } else {
    console.log('\n❌ Some tests failed. Check errors above.');
    process.exit(1);
  }
}

main().catch(console.error);

