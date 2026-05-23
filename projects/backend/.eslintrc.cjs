module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:prettier/recommended'],
  ignorePatterns: ['dist', 'coverage', 'node_modules'],
  rules: {
    'no-empty': ['error', { allowEmptyCatch: true }],
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-explicit-any': 'off'
  },
  overrides: [
    {
      files: ['**/*.js'],
      parser: 'espree',
      rules: {
        '@typescript-eslint/no-require-imports': 'off',
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/no-unused-vars': 'off'
      }
    },
    {
      files: ['test/**/*.js', 'scripts/**/*.js'],
      rules: {
        'no-unused-vars': 'off'
      }
    },
    {
      files: ['**/*.d.ts'],
      rules: {
        'no-var': 'off'
      }
    }
  ]
}
