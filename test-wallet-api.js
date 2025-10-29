#!/usr/bin/env node

/**
 * Test script to verify wallet API integration
 * Run this after starting both frontend and backend servers
 */

const API_BASE_URL = 'http://localhost:5005';
const TEST_USER_ID = 'test-user-123';

async function testWalletAPI() {
  console.log('🧪 Testing Wallet API Integration...\n');

  try {
    // Test 1: Create a wallet
    console.log('1. Creating wallet...');
    const createResponse = await fetch(`${API_BASE_URL}/wallet/seed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: TEST_USER_ID,
        mode: 'random',
      }),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Failed to create wallet: ${createResponse.status} ${errorText}`);
    }

    const createResult = await createResponse.json();
    console.log('✅ Wallet created successfully:', createResult);

    // Test 2: Get addresses
    console.log('\n2. Fetching wallet addresses...');
    const addressesResponse = await fetch(`${API_BASE_URL}/wallet/addresses?userId=${TEST_USER_ID}`);
    
    if (!addressesResponse.ok) {
      const errorText = await addressesResponse.text();
      throw new Error(`Failed to get addresses: ${addressesResponse.status} ${errorText}`);
    }

    const addresses = await addressesResponse.json();
    console.log('✅ Addresses fetched successfully:');
    Object.entries(addresses).forEach(([chain, address]) => {
      if (address) {
        console.log(`   ${chain}: ${address}`);
      } else {
        console.log(`   ${chain}: ❌ Failed to get address`);
      }
    });

    // Test 3: Get balances
    console.log('\n3. Fetching wallet balances...');
    const balancesResponse = await fetch(`${API_BASE_URL}/wallet/balances?userId=${TEST_USER_ID}`);
    
    if (!balancesResponse.ok) {
      const errorText = await balancesResponse.text();
      throw new Error(`Failed to get balances: ${balancesResponse.status} ${errorText}`);
    }

    const balances = await balancesResponse.json();
    console.log('✅ Balances fetched successfully:');
    balances.forEach(({ chain, balance }) => {
      console.log(`   ${chain}: ${balance}`);
    });

    console.log('\n🎉 All tests passed! Wallet API integration is working correctly.');
    console.log('\n📝 Next steps:');
    console.log('   1. Start the backend server: cd apps/backend && npm run dev');
    console.log('   2. Start the frontend server: cd apps/web && npm run dev');
    console.log('   3. Visit http://localhost:3000/dashboard to see the wallet integration');
    console.log('   4. Visit http://localhost:3000/transactions to see the balances page');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Make sure the backend server is running on port 5005');
    console.log('   2. Check that all environment variables are set correctly');
    console.log('   3. Verify the database connection');
    console.log('   4. Check backend logs for detailed error messages');
    console.log('   5. Ensure RPC providers are accessible');
    process.exit(1);
  }
}

// Run the test
testWalletAPI();
