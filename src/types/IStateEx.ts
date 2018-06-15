import { ILOOTList } from './ILOOTList';

import { types } from 'vortex-api';

export interface IStateEx extends types.IState {
  masterlist: ILOOTList;
  userlist: ILOOTList;
}
