**javascript
const path = require('path');

module.exports = {
    stories: ['../src/**/*.stories.@(ts|tsx)'],
    staticDirs: ['../public','../src/mocks/mock-public'],
    addons: ['@storybook/addon-docs'],

    framework: {
        name: '@storybook/react-vite',
        options: {},
    },

    viteFinal: async (config) => ({
...config.
        define: {
...config.define,
'process.env.PUBLIC_URL': JSON.stringify(''),
        },
    }],
};
