/**
 * Quick Test Script for Custody Balance API
 * 
 * Run this in your browser console after authentication to test the custody balance functionality.
 */

import { lightningNodeApi } from '@/lib/api';

// ============================================================================
// TEST 1: Direct API Call
// ============================================================================
console.log('🧪 TEST 1: Testing direct API call...');

async function testDirectAPI() {
  try {
    const response = await fetch(
      'http://localhost:3001/lightning-node/custody-balance?userId=test-user-id&chain=base&asset=usdc',
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.json();
    
    if (data.success) {
      console.log('✅ TEST 1 PASSED');
      console.log('  Balance:', data.balanceFormatted, data.asset.toUpperCase());
      console.log('  Raw balance:', data.balance);
      console.log('  Wallet:', data.walletAddress);
    } else {
      console.error('❌ TEST 1 FAILED - API returned success: false');
    }
  } catch (error) {
    console.error('❌ TEST 1 FAILED - Error:', error);
  }
}

// ============================================================================
// TEST 2: Using lightningNodeApi
// ============================================================================
console.log('🧪 TEST 2: Testing via lightningNodeApi...');

async function testAPIClient() {
  try {
    const result = await lightningNodeApi.getCustodyBalance(
      'test-user-id',
      'base',
      'usdc'
    );

    if (result.success) {
      console.log('✅ TEST 2 PASSED');
      console.log('  Balance:', result.balanceFormatted, result.asset.toUpperCase());
    } else {
      console.error('❌ TEST 2 FAILED');
    }
  } catch (error) {
    console.error('❌ TEST 2 FAILED - Error:', error);
  }
}

// ============================================================================
// TEST 3: Multiple Chains
// ============================================================================
console.log('🧪 TEST 3: Testing multiple chains...');

async function testMultipleChains() {
  const chains = ['base', 'arbitrum', 'ethereum'];
  const results = [];

  for (const chain of chains) {
    try {
      const result = await lightningNodeApi.getCustodyBalance(
        'test-user-id',
        chain,
        'usdc'
      );

      results.push({
        chain,
        success: result.success,
        balance: result.balanceFormatted,
      });
    } catch (error) {
      results.push({
        chain,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  console.log('✅ TEST 3 COMPLETE');
  console.table(results);
}

// ============================================================================
// TEST 4: Hook Integration (run inside a component)
// ============================================================================
console.log('🧪 TEST 4: Testing hook integration (run in component)...');

/**
 * Add this to a component to test the hook:
 * 
 * const TestCustodyBalance = () => {
 *   const { fetchCustodyBalance, authenticated } = useLightningNodes();
 *   const [result, setResult] = useState(null);
 * 
 *   useEffect(() => {
 *     if (authenticated) {
 *       fetchCustodyBalance('base', 'usdc').then(setResult);
 *     }
 *   }, [authenticated]);
 * 
 *   return (
 *     <div>
 *       {result ? (
 *         <p>Balance: {result.balanceFormatted} USDC</p>
 *       ) : (
 *         <p>Loading...</p>
 *       )}
 *     </div>
 *   );
 * };
 */

// ============================================================================
// RUN ALL TESTS
// ============================================================================
async function runAllTests() {
  console.log('\n🚀 Running all custody balance tests...\n');
  
  await testDirectAPI();
  console.log('\n---\n');
  
  await testAPIClient();
  console.log('\n---\n');
  
  await testMultipleChains();
  console.log('\n---\n');
  
  console.log('✅ All tests complete!');
}

// Export for manual testing
if (typeof window !== 'undefined') {
  (window as any).testCustodyBalance = {
    testDirectAPI,
    testAPIClient,
    testMultipleChains,
    runAllTests,
  };
  
  console.log('💡 TIP: Run window.testCustodyBalance.runAllTests() to test everything');
}

export {
  testDirectAPI,
  testAPIClient,
  testMultipleChains,
  runAllTests,
};
