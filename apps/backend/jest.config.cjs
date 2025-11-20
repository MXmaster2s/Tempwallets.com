module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: false, // Use CommonJS for Jest even though package.json has "type": "module"
        tsconfig: {
          module: 'commonjs',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          isolatedModules: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@tetherto/wdk$': '<rootDir>/src/__mocks__/wdk.mock.js',
    '^@tetherto/wdk-wallet-evm$': '<rootDir>/src/__mocks__/wdk.mock.js',
    '^@tetherto/wdk-wallet-tron$': '<rootDir>/src/__mocks__/wdk.mock.js',
    '^@tetherto/wdk-wallet-btc$': '<rootDir>/src/__mocks__/wdk.mock.js',
    '^@tetherto/wdk-wallet-solana$': '<rootDir>/src/__mocks__/wdk.mock.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@tetherto|@polkadot)/)',
  ],
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.js'],
};
