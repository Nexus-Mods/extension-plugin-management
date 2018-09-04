import { createAction } from 'redux-act';

export const setPluginEnabled = createAction('SET_PLUGIN_ENABLED',
    (pluginName: string, enabled: boolean) => ({ pluginName, enabled }));

/**
 * completely replace the load order (not changing the enabled state of plugins)
 * unless additive is true, plugins that were in the load order but not specified
 * in this call get removed
 */
export const setPluginOrder = createAction('SET_PLUGIN_ORDER');

/**
 * update the plugin order, not removing entries
 * if the second parameter "setEnabled" is set, this also updates the enabled state of plugins,
 * the listed plugins are then enabled, the others are disabled.
 * plugins that aren't listed get moved to the bottom of the list
 */
export const updatePluginOrder = createAction('UPDATE_PLUGIN_ORDER',
    (pluginList: string[], setEnabled: boolean) => ({ pluginList, setEnabled }));
