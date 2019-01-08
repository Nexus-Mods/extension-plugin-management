import {IPlugins} from '../types/IPlugins';

import { createAction } from 'redux-act';

export const setPluginList =
    createAction('SET_PLUGIN_LIST', (plugins: IPlugins) => ({plugins}));

export const updatePluginWarnings = createAction('UPDATE_PLUGIN_WARNING',
  (id: string, warning: string, value: boolean) => ({ id, warning, value }));
