import { createAction } from 'redux-act';

export const addRule = createAction('ADD_USERLIST_RULE',
  (pluginId, reference, type) => ({ pluginId, reference, type }));

export const removeRule = createAction('REMOVE_USERLIST_RULE',
  (pluginId, reference, type) => ({ pluginId, reference, type }));

export const addGroup = createAction('ADD_PLUGIN_GROUP',
  (group: string) => ({ group }));

export const setGroup = createAction('SET_PLUGIN_GROUP',
  (pluginId, group) => ({ pluginId, group }));
