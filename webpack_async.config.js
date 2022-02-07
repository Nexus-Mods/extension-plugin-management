let webpack = require('vortex-api/bin/webpack').default;

config = webpack('gamebryo-plugin-management-async', __dirname, 5);

config.externals['./build/Release/node-loot'] = './node-loot';

module.exports = config;
