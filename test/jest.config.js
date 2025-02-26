module.exports = {
  rootDir: '../',
  globalSetup: '<rootDir>/test/jest-global-setup.js',
  cacheDirectory: '<rootDir>/test/.jest-cache',
  collectCoverage: false,
  collectCoverageFrom: [
    'packages/**/*.ts',
    '!**/dist/**',
    '!src/assets/**',
    '!examples/webpack-demo-vanilla-bundle/**',
    '!**/node_modules/**',
    '!**/test/**',
  ],
  coverageDirectory: '<rootDir>/test/jest-coverage',
  coveragePathIgnorePatterns: [
    '\\.d\\.ts$',
    'global-grid-options.ts',
    'salesforce-global-grid-options.ts',
    '<rootDir>/node_modules/'
  ],
  coverageReporters: [
    'json',
    'lcov',
    'text',
    'html'
  ],
  moduleFileExtensions: [
    'json',
    'js',
    'ts'
  ],
  modulePaths: [
    'src',
    '<rootDir>/node_modules'
  ],
  preset: 'ts-jest',
  setupFiles: ['<rootDir>/test/jest-pretest.ts'],
  setupFilesAfterEnv: ['jest-extended/all', '<rootDir>/test/jest-global-mocks.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        diagnostics: false,
        isolatedModules: true,
        tsconfig: '<rootDir>/test/tsconfig.spec.json',
        stringifyContentPathRegex: '\\.html$'
      },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@slickgrid-universal)/)',
    '<rootDir>/node_modules/slickgrid/'
  ],
  testMatch: [
    '**/__tests__/**/*.+(ts|js)',
    '**/+(*.)+(spec|test).+(ts|js)'
  ],
  testEnvironment: 'node',
  testPathIgnorePatterns: [
    '<rootDir>/test/cypress/',
    '<rootDir>/node_modules/',
  ],
};
