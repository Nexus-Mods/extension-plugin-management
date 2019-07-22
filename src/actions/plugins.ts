import {IPluginCombined, IPlugins} from '../types/IPlugins';

import { createAction } from 'redux-act';

export const setPluginList =
    createAction('SET_PLUGIN_LIST', (plugins: IPlugins) => ({plugins}));

/*
sets the plugins with all the info we gather about them
TODO: Do we actually need multiple fields for this? IPluginCombined is a superset of IPlugin so
  we could just be updating the plugin list and redefine the types so everything outside IPlugin is
  optional
*/
export const setPluginInfo =
    createAction('SET_PLUGIN_INFO', (plugins: { [id: string]: IPluginCombined }) => ({ plugins }));

export const updatePluginWarnings = createAction('UPDATE_PLUGIN_WARNING',
  (id: string, warning: string, value: boolean) => ({ id, warning, value }));
