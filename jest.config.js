// jest.config.js
module.exports = {
  // Environnement de test
  testEnvironment: 'node',
  
  // Répertoires des tests
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.js',
    '**/*.(test|spec).js'
  ],
  
  // Couverture de code
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/scripts/**',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 25,
      functions: 35,
      lines: 25,
      statements: 25
    }
  },
  
  // Setup et teardown
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  
  // Mock des modules
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  
  // Nettoyage automatique des mocks
  clearMocks: true,
  restoreMocks: true,
  
  // Timeout pour les tests asynchrones
  testTimeout: 10000,
  
  // Verbose pour plus de détails
  verbose: true
}; 