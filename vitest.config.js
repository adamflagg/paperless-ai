import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['services/**/*.js', 'routes/**/*.js', 'config/**/*.js', 'models/**/*.js'],
      exclude: ['node_modules/', 'tests/', 'public/', 'views/'],
      thresholds: {
        lines: 10,
        functions: 20,
        branches: 10,
        statements: 10,
      },
    },
  },
});
