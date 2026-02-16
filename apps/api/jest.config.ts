import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }]
  },
  moduleNameMapper: {
    '^@stageos/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@stageos/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1'
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node'
};

export default config;
