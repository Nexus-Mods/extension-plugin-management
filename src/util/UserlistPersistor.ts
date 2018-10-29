import { ILOOTList } from '../types/ILOOTList';

import {gameSupported} from './gameSupport';

import * as Promise from 'bluebird';
import { app as appIn, remote } from 'electron';
import { safeDump, safeLoad } from 'js-yaml';
import * as path from 'path';
import { fs, types, util } from 'vortex-api';

const app = appIn || remote.app;

/**
 * persistor syncing to and from the loot userlist.yaml file
 *
 * @class UserlistPersistor
 * @implements {types.IPersistor}
 */
class UserlistPersistor implements types.IPersistor {
  private mResetCallback: () => void;
  private mUserlistPath: string;
  private mUserlist: ILOOTList;
  private mSerializeQueue: Promise<void> = Promise.resolve();
  private mLoaded: boolean = false;
  private mFailed: boolean = false;
  private mOnError: (message: string, details: Error) =>  void;
  private mMode: 'userlist' | 'masterlist';

  constructor(mode: 'userlist' | 'masterlist',
              onError: (message: string, details: Error) => void) {
    this.mUserlist = {
      globals: [],
      plugins: [],
      groups: [],
    };
    this.mOnError = onError;
    this.mMode = mode;
  }

  public disable(): Promise<void> {
    return this.enqueue(() => new Promise<void>(resolve => {
      this.mUserlist = {
        globals: [],
        plugins: [],
        groups: [],
      };
      this.mUserlistPath = undefined;
      this.mLoaded = false;
      if (this.mResetCallback) {
        this.mResetCallback();
      }
      resolve();
    }));
  }

  public loadFiles(gameMode: string): Promise<void> {
    if (!gameSupported(gameMode)) {
      return Promise.resolve();
    }
    this.mUserlistPath = (this.mMode === 'userlist')
      ? path.join(app.getPath('userData'), gameMode, 'userlist.yaml')
      : path.join(app.getPath('userData'), gameMode, 'masterlist', 'masterlist.yaml');

    // read the files now and update the store
    return this.deserialize();
  }

  public setResetCallback(cb: () => void) {
    this.mResetCallback = cb;
  }

  public getItem(key: string[]): Promise<string> {
    return Promise.resolve(JSON.stringify(this.mUserlist[key[0]]));
  }

  public setItem(key: string[], value: string): Promise<void> {
    this.mUserlist[key[0]] = JSON.parse(value);
    return this.serialize();
  }

  public removeItem(key: string[]): Promise<void> {
    this.mUserlist[key[0]] = [];
    return this.serialize();
  }

  public getAllKeys(): Promise<string[][]> {
    return Promise.resolve(Object.keys(this.mUserlist).map(key => [key]));
  }

  private enqueue(fn: () => Promise<void>): Promise<void> {
    this.mSerializeQueue = this.mSerializeQueue.then(fn);
    return this.mSerializeQueue;
  }

  private reportError(message: string, detail: Error) {
    if (!this.mFailed) {
      this.mOnError(message, detail);
      this.mFailed = true;
    }
  }

  private serialize(): Promise<void> {
    if (!this.mLoaded) {
      // this happens during initialization, when the persistor is initially created, with default
      // values.
      return Promise.resolve();
    }
    // ensure we don't try to concurrently write the files
    this.mSerializeQueue = this.mSerializeQueue.then(() => this.doSerialize());
    return this.mSerializeQueue;
  }

  private doSerialize(): Promise<void> {
    if ((this.mUserlist === undefined)
        || (this.mUserlistPath === undefined)
        || (this.mMode === 'masterlist')) {
      return;
    }

    const userlistPath = this.mUserlistPath;

    return fs.writeFileAsync(userlistPath + '.tmp', safeDump(this.mUserlist))
      .then(() => fs.renameAsync(userlistPath + '.tmp', userlistPath))
      .then(() => { this.mFailed = false; })
      .catch(util.UserCanceled, () => undefined)
      .catch(err => {
        this.reportError('Failed to write userlist', err);
      });
  }

  private deserialize(): Promise<void> {
    if (this.mUserlist === undefined) {
      return Promise.resolve();
    }

    let empty: boolean = false;

    return fs.readFileAsync(this.mUserlistPath)
    .then((data: Buffer) => {
      if (data.byteLength <= 5) {
        // the smallest non-empty file is actually around 20 bytes long and
        // the smallest useful file probably 30. This is really to catch
        // cases where the file is not parseable because it's completely empty
        // or contains only "null" or something silly like that
        empty = true;
      }
      this.mUserlist = safeLoad(data.toString(), { json: true } as any);
      if (this.mResetCallback) {
        this.mResetCallback();
        this.mLoaded = true;
      }
    })
    .catch(err => {
      if ((err.code === 'ENOENT') || empty) {
        this.mUserlist = {
          globals: [],
          plugins: [],
          groups: [],
        };
        this.mLoaded = true;
        return this.serialize();
      } else {
        // if we can't read the file but the file is there,
        // we would be destroying its content if we don't quit right now.
        (util.terminate as any)({
          message: 'Failed to read userlist file for this game. '
                 + 'Repair or delete this file and then try to start Vortex again',
          path: this.mUserlistPath,
          details: `Error: ${err.message}`,
        }, undefined, false);
      }
    });
  }
}

export default UserlistPersistor;
