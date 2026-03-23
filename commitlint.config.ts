import { defineConfig } from 'cz-git';

export default defineConfig({
  extends: ['@commitlint/config-conventional'],
  prompt: {
    alias: {
      deps: 'chore(deps): bump dependencies',
      docs: 'docs: update docs',
    },
    allowCustomScopes: false,
    allowEmptyScopes: true,
    scopes: [
      'cli',
      'config',
      'credentials',
      'deps',
      'docs',
      'profiles',
      'tests',
      'tooling',
    ],
    skipQuestions: ['breaking', 'footer', 'issues'],
  },
  rules: {
    'body-max-line-length': [0, 'always'],
    'footer-max-line-length': [0, 'always'],
    'header-max-length': [2, 'always', 200],
  },
});
