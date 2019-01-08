import {IPlugins} from '../types/IPlugins';

import { createAction } from 'redux-act';

export const setAvailablePluginList =
    createAction('SET_AVAILABLE_PLUGIN_LIST', (plugins: IPlugins) => ({plugins}));

export const setDeployedPluginList =
    createAction('SET_DEPLOYED_PLUGIN_LIST', (pluginNames: string) => pluginNames);

export const updatePluginWarnings = createAction('UPDATE_PLUGIN_WARNING',
  (id: string, warning: string, value: boolean) => ({ id, warning, value }));
