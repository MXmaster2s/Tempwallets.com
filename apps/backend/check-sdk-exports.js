import * as AptosSDK from '@aptos-labs/ts-sdk';

console.log('=== Available Exports ===');
console.log(Object.keys(AptosSDK).sort().slice(0, 50).join(', '));
console.log(`\n... (${Object.keys(AptosSDK).length} total exports)`);

console.log('\n=== Aptos Class Methods ===');
const { Aptos, AptosConfig, Network } = AptosSDK;
const config = new AptosConfig({ network: Network.TESTNET });
const client = new Aptos(config);

console.log('Transaction methods:', Object.getOwnPropertyNames(client.transaction).filter(m => !m.startsWith('_')).join(', '));

if (client.transaction.build) {
  console.log('Build methods:', Object.getOwnPropertyNames(client.transaction.build).filter(m => !m.startsWith('_')).join(', '));
}

if (client.transaction.simulate) {
  console.log('Simulate methods:', Object.getOwnPropertyNames(client.transaction.simulate).filter(m => !m.startsWith('_')).join(', '));
}

if (client.transaction.submit) {
  console.log('Submit methods:', Object.getOwnPropertyNames(client.transaction.submit).filter(m => !m.startsWith('_')).join(', '));
}

if (client.transaction.sign) {
  console.log('Sign method type:', typeof client.transaction.sign);
}

console.log('\n=== Account Class ===');
console.log('Account static methods:', Object.getOwnPropertyNames(AptosSDK.Account).filter(m => typeof AptosSDK.Account[m] === 'function').join(', '));

console.log('\n=== Key Types ===');
console.log('SimpleTransaction:', typeof AptosSDK.SimpleTransaction !== 'undefined' ? 'EXISTS' : 'NOT FOUND');
console.log('InputTransactionData:', typeof AptosSDK.InputTransactionData !== 'undefined' ? 'EXISTS' : 'NOT FOUND');
console.log('AccountAuthenticator:', typeof AptosSDK.AccountAuthenticator !== 'undefined' ? 'EXISTS' : 'NOT FOUND');

