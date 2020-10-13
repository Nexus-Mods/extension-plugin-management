const webpack = require('vortex-api/bin/webpack').default;

config = webpack('gamebryo-plugin-management', __dirname, 4);
config.externals['./build/Release/node-loot'] = './node-loot';

module.exports = config;
