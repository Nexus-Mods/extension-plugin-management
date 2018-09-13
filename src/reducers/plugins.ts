import { types, util } from 'vortex-api';

import * as actions from '../actions/plugins';

/**
 * reducer for changes to the plugin list
 */
export const pluginsReducer: types.IReducerSpec = {
  reducers: {
    [actions.setPluginList as any]: (state, payload) =>
      util.setSafe(state, ['pluginList'], payload.plugins)
    ,
    [actions.setPluginNotifications as any]: (state, payload) => {   
      const notifications = util.getSafe(state, ['pluginList', payload.pluginName, 'notifications'], {})
      const currentDescription = util.getSafe(state, ['pluginList', payload.pluginName, 'notifications', payload.notifier, 'description'], '');
      if (undefined === notifications) {
        return util.setSafe(state, ['pluginList', payload.pluginName, 'notifications', payload.notifier], payload.notification);
      } else {
        return util.merge(state, ['pluginList', payload.pluginName, 'notifications', payload.notifier], {
          description: payload.notification.description ? payload.notification.description : currentDescription,
          notify: payload.notification.notify,
        });
      }
    },
  },
  defaults: {
    pluginList: {},
  },
};