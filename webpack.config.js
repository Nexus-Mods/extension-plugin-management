let webpack = require('vortex-api/bin/webpack').default;

config = webpack('gamebryo-plugin-management', __dirname, 5);

config.externals['./build/Release/node-loot'] = './node-loot';
config.externals['./build/Release/esptk'] = './esptk';

module.exports = config;
