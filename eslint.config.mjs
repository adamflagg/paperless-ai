import globals from 'globals';
import pluginJs from '@eslint/js';
import prettier from 'eslint-config-prettier';

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Ignore patterns (must be first, standalone config object)
  {
    ignores: [
      'node_modules/',
      'data/',
      'chromadb/',
      'coverage/',
      'logs/',
      '__pycache__/',
      '*.min.js',
      'vitest.config.js',
      'tests/',
    ],
  },
  // Backend files — Node.js CommonJS
  {
    files: ['**/*.js'],
    ignores: ['public/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      ecmaVersion: 2022,
      globals: {
        ...globals.node,
      },
    },
  },
  // Frontend files — browser scripts
  {
    files: ['public/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        // UI frameworks & component libraries
        bootstrap: 'readonly',
        // Markdown & code highlighting
        marked: 'readonly',
        DOMPurify: 'readonly',
        hljs: 'readonly',
        // Charting
        Chart: 'readonly',
        // Drag-and-drop
        Sortable: 'readonly',
        // Icons
        feather: 'readonly',
        // Date picker
        flatpickr: 'readonly',
        // Range slider
        noUiSlider: 'readonly',
        // Alerts (SweetAlert2)
        Swal: 'readonly',
        // Tooltips (Tippy.js)
        tippy: 'readonly',
        // jQuery (used in history.js for DataTables)
        $: 'readonly',
        jQuery: 'readonly',
      },
    },
  },
  pluginJs.configs.recommended,
  prettier,
  // Global rule overrides
  {
    rules: {
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
];
