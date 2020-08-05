import { types, util } from 'vortex-api';

import * as actions from '../actions/plugins';

/**
 * reducer for changes to the plugin list
 */
export const pluginsReducer: types.IReducerSpec = {
  reducers: {
    [actions.setPluginList as any]: (state, payload) =>
      util.setSafe(state, ['pluginList'], payload.plugins),
    [actions.setPluginInfo as any]: (state, payload) =>
      util.setSafe(state, ['pluginInfo'], payload.plugins),
    [actions.updatePluginWarnings as any]: (state, payload) =>
      (state.pluginList[payload.id] !== undefined)
      ? util.setSafe(state, ['pluginList', payload.id, 'warnings', payload.warning], payload.value)
      : state,
  },
  defaults: {
    pluginList: {},
    pluginInfo: {},
  },
};
