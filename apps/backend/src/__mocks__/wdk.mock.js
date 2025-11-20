// Mock for @tetherto/wdk to avoid ESM issues in Jest
module.exports = {
  createWallet: jest.fn(),
  getAddress: jest.fn(),
  signTransaction: jest.fn(),
  sendTransaction: jest.fn(),
};

