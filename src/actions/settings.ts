import { createAction } from 'redux-act';

/**
 * enables or disables autosort
 */
export const setAutoSortEnabled = createAction('GAMEBRYO_SET_AUTOSORT_ENABLED', enabled => enabled);

export const setAutoEnable = createAction('GAMEBRYO_SET_AUTO_ENABLE', enable => enable);
