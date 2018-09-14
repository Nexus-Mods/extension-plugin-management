import {IPlugins, IPluginNotification} from '../types/IPlugins';

import { createAction } from 'redux-act';

export const setPluginList =
    createAction('SET_PLUGIN_LIST', (plugins: IPlugins) => ({plugins}));

export const setPluginNotifications = 
    createAction('SET_PLUGIN_NOTIFICATION', (
      pluginName: string,
      notifier: string,
      notification: IPluginNotification) => ({pluginName, notifier, notification}));

export const remPluginNotifications = 
    createAction('REMOVE_PLUGIN_NOTIFICATION', (pluginName: string) => ({pluginName}));