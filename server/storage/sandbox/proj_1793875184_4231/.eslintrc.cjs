-'cjs'
module.exports = {
parser: '@typescript-eslint/parser', // Specifies the ESLint parser
plugins: ['react-hooks', 'prettier'],
extends: [
'plugin:react/recommended', // Uses the recommended rules from @eslint-plugin-react
'plugin:@typescript-eslint/recommended', // Uses the recommended rules from the @typescript-eslint/eslint-plugin
'plugin:prettier/recommended', // Enables eslint-plugin-prettier and eslint-config-prettier. This will display prettier errors as EsLint errors. Make sure this is always the lastconfiguration in the extends array.
],
parserOptions: {
ecmaFeatures: {
jsx: true, // Allows for the parsing of JSX
},
ecmaVersion: 2022, // Allows for the parsing of modern ECMAScript features
sourceType: 'module', // Allows for the use of imports
},
rules: {
// Place to specify EsLint rules. Can be used to overwrite rules specified from the extended configs
// e.g. "@typescript-eslint/explicit-function-return-type": "off",
'@typescript-eslint/camelcase': 'off',
'@typescript-eslint/no-use-before-define': 'off',
'@typescript-eslint/no-var-requires': 'off',
'@typescript-eslint/no-empty-function': 'off',
'@typescript-eslint/no-explicit-any': 'off',
'@typescript-eslint/explicit-function-return-type': 'off',
'react/prop-types': 'off',
'prettier/prettier': [
'error',
{
endOfLine: 'auto',
},
],
},
overrides: [
{
files: ['*.ts', '*.tsx'],
rules: {
'@typescript-eslint/explicit-function-return-type': [
'off',
{
allowExpressions: true,
},
],
},
},
{
files: [
'./**/*test.ts',
'./**/test.ts',
'./**/*test.tsx',
'./**/test.tsx',
],
"plugins": ["jest-dom", "testing-library"],
"extends": ["plugin:jest-dom/recommended", "plugin:testing-library/react"],
"rules": {
"testing-library/no-await-sync-query": "warn",
"testing-library/no-unnecessary-act": "warn",
"testing-library/prefer-screen-queries": "warn",
"testing-library/no-container": "off",
"testing-library/no-node-access": "off",
"testing-library/render-result-naming-convention": "off",
"testing-library/prefer-presence-queries": "off"
}
}
],
settings: {
react: {
version: 'detect', // Tells eslint-plugin-react to automatically detect the version ofReact to use
},
},
};
