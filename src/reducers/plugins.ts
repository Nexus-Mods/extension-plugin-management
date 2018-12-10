import { types, util } from 'vortex-api';

import * as actions from '../actions/plugins';

/**
 * reducer for changes to the plugin list
 */
export const pluginsReducer: types.IReducerSpec = {
  reducers: {
    [actions.setAvailablePluginList as any]: (state, payload) =>
      util.setSafe(state, ['pluginList'], payload.plugins),
    [actions.setDeployedPluginList as any]: (state, payload) =>
      util.setSafe(state, ['deployedPlugins'], payload),
    [actions.updatePluginWarnings as any]: (state, payload) =>
      util.setSafe(state, ['pluginList', payload.id, 'warnings', payload.warning], payload.value),
  },
  defaults: {
    pluginList: {},
    deployedPlugins: [],
  },
};