import * as actions from '../actions/loadOrder';
import {ILoadOrder} from '../types/ILoadOrder';

import {types, util} from 'vortex-api';

interface ILoadOrderMap {
  [name: string]: ILoadOrder;
}

/**
 * reducer for changes to the plugin list
 */
export const loadOrderReducer: types.IReducerSpec = {
  reducers: {
    [actions.setPluginEnabled as any]:
        (state, payload) => state[payload.pluginName] !== undefined
          ? util.setSafe(state, [payload.pluginName, 'enabled'], payload.enabled)
          : util.merge(state, [payload.pluginName], {
            enabled: true,
            loadOrder: -1,
          }),
    [actions.setPluginOrder as any]: (state, payload) => {
      const result = {};
      payload.forEach((pluginName: string, idx: number) => {
        result[pluginName] = {
          enabled: util.getSafe(state, [pluginName, 'enabled'], true),
          loadOrder: idx,
        };
      });
      return result;
    },
    [actions.updatePluginOrder as any]: (state, payload) => {
      const { pluginList, setEnabled } = payload;

      const result = JSON.parse(JSON.stringify(state));

      // put the listed plugins in the specified order
      pluginList.forEach((pluginName: string, idx: number) => {
        result[pluginName] = {
          enabled: setEnabled ? true : util.getSafe(state, [pluginName, 'enabled'], true),
          loadOrder: idx,
        };
      });

      // now deal with the rest, appending them to the list
      let idx = pluginList.length;
      Object.keys(result)
        .filter(key => pluginList.indexOf(key) === -1)
        .forEach(key => {
          result[key].loadOrder = idx++;
          if (setEnabled) {
            result[key].enabled = false;
          }
        });

      return result;
    },
  },
  defaults: {},
};
