import { defineConfig } from 'cz-git';

export default defineConfig({
  extends: ['@commitlint/config-conventional'],
  prompt: {
    alias: {
      ci: 'ci: update workflows',
      deps: 'chore(deps): bump dependencies',
      docs: 'docs: update docs',
      tooling: 'chore(tooling): update dev tooling',
    },
    allowCustomScopes: false,
    allowEmptyScopes: true,
    scopes: ['cli', 'config', 'credentials', 'profiles', 'ui'],
    skipQuestions: ['breaking', 'footer'],
  },
  rules: {
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
    'header-max-length': [2, 'always', 200],
    'scope-enum': [
      2,
      'always',
      ['cli', 'config', 'credentials', 'deps', 'profiles', 'tooling', 'ui'],
    ],
  },
});
