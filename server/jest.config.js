// server/jest.config.js
// NovaStream — Jest Configuration
// Tests use node environment (no DOM), targeting pure utility/logic modules

module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.test.js',
  ],
  // Collect coverage only from source files (not test files or config)
  collectCoverageFrom: [
    'src/utils/**/*.js',
    'src/services/**/*.js',
    '!src/**/__tests__/**',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov', 'clover'],
  verbose: true,
};
