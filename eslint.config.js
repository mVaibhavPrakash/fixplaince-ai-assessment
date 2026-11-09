import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default [
    { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    prettier,
    {
        files: ['**/*.{js,mjs,cjs,ts,tsx}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
        rules: {
            // Enforces curly braces for all control statements and functions
            curly: ['error', 'all'],

            'padding-line-between-statements': [
                'error',
                {
                    blankLine: 'always',
                    prev: ['function', 'multiline-const', 'multiline-let'],
                    next: '*',
                },
                {
                    blankLine: 'always',
                    prev: '*',
                    next: ['function', 'multiline-const', 'multiline-let'],
                },
            ],
        },
    },
];
