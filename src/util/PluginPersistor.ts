import {ILoadOrder} from '../types/ILoadOrder';
import {
  gameSupported,
  nativePlugins,
  pluginFormat,
  pluginPath,
} from '../util/gameSupport';

import * as Promise from 'bluebird';
import * as path from 'path';
import {fs, log, types, util} from 'vortex-api';

export type PluginFormat = 'original' | 'fallout4';

interface IPluginMap {
  [id: string]: ILoadOrder;
}

const retryCount = 3;

/**
 * persistor syncing to and from the gamebryo plugins.txt and loadorder.txt
 *
 * @class PluginPersistor
 * @implements {types.IPersistor}
 */
class PluginPersistor implements types.IPersistor {
  private mDataPath: string;
  private mPluginPath: string;
  private mPluginFormat: PluginFormat;
  private mNativePlugins: string[];
  private mResetCallback: () => void;

  private mWatch: fs.FSWatcher;
  private mRefreshTimer: NodeJS.Timer;
  private mLastWriteTime: Date;
  private mSerializing: boolean = false;
  private mSerializeScheduled: boolean = false;
  private mSerializeQueue: Promise<void> = Promise.resolve();

  private mPlugins: IPluginMap;
  private mKnownPlugins: { [pluginId: string]: string };
  private mRetryCounter: number = retryCount;
  private mLoaded: boolean = false;
  private mFailed: boolean = false;
  private mOnError: (message: string, details: Error, options?: types.IErrorOptions) => void;

  constructor(onError: (message: string, details: Error, options?: types.IErrorOptions) => void) {
    this.mPlugins = {};
    this.mOnError = onError;
  }

  public disable(): Promise<void> {
    return this.enqueue(() => new Promise<void>(resolve => {
      this.mPlugins = {};
      this.mPluginPath = undefined;
      this.mPluginFormat = undefined;
      this.mNativePlugins = undefined;
      this.mLoaded = false;
      if (this.mResetCallback) {
        this.mResetCallback();
        this.mRetryCounter = retryCount;
      }
      this.stopWatch();
      resolve();
    }));
  }

  public loadFiles(gameMode: string, dataPath: string): Promise<void> {
    return this.enqueue(() => {
      if (!gameSupported(gameMode)) {
        return Promise.resolve();
      }
      this.mDataPath = dataPath;
      this.mPluginPath = pluginPath(gameMode);
      this.mPluginFormat = pluginFormat(gameMode);
      this.mNativePlugins = nativePlugins(gameMode);
      // ensure that the native plugins are always included
      log('debug', 'synching plugins', {pluginsPath: this.mPluginPath});
      // read the files now and update the store
      return this.deserialize()
        // start watching for external changes
        .then(() => this.startWatch());
    });
  }

  public setKnownPlugins(knownPlugins: { [pluginId: string]: string }) {
    this.mKnownPlugins = knownPlugins;
  }

  public setResetCallback(cb: () => void) {
    this.mResetCallback = cb;
  }

  public getItem(key: string[]): Promise<string> {
    return Promise.resolve(JSON.stringify(util.getSafe(this.mPlugins, key, undefined)));
  }

  public setItem(key: string[], value: string): Promise<void> {
    const newValue = JSON.parse(value);
    if (newValue !== util.getSafe(this.mPlugins, key, undefined)) {
      this.mPlugins = util.setSafe(this.mPlugins, key, newValue);
      return this.serialize();
    } else {
      return Promise.resolve();
    }
  }

  public removeItem(key: string[]): Promise<void> {
    this.mPlugins = util.deleteOrNop(this.mPlugins, key);
    if ((this.mPlugins[key[0]] !== undefined)
        && (Object.keys(this.mPlugins[key[0]]).length === 0)) {
      delete this.mPlugins[key[0]];
    }
    return this.serialize();
  }

  public getAllKeys(): Promise<string[][]> {
    return Promise.resolve(Object.keys(this.mPlugins).map(key => [key]));
  }

  private reportError(message: string, detail: Error, options?: types.IErrorOptions) {
    if (!this.mFailed) {
      this.mOnError(message, detail, options);
      this.mFailed = true;
    }
  }

  private toPluginList(input: string[]) {
    if (this.mPluginFormat === 'original') {
      return this.toPluginListOriginal(input);
    } else {
      return this.toPluginListFallout4(input);
    }
  }

  private toPluginListOriginal(input: string[]) {
    // enabled defaults to true for native plugins because they are always
    // enabled
    const nativePluginSet = new Set(this.mNativePlugins);
    return input.filter(name =>
      util.getSafe(this.mPlugins, [name.toLowerCase(), 'enabled'],
                   nativePluginSet.has(name.toLowerCase())));
  }

  private toPluginListFallout4(input: string[]) {
    // LOOT and previous versions of Vortex don't store native plugins so
    // this has been handled this way for a while
    const nativePluginSet = new Set(this.mNativePlugins);
    return input
      .filter(name => !nativePluginSet.has(name.toLowerCase()))
      .map(name => util.getSafe(this.mPlugins, [name.toLowerCase(), 'enabled'], false)
          ? '*' + name
          : name);
  }

  private enqueue(fn: () => Promise<void>): Promise<void> {
    this.mSerializeQueue = this.mSerializeQueue.then(fn);
    return this.mSerializeQueue;
  }

  private serialize(): Promise<void> {
    if (!this.mLoaded) {
      // this happens during initialization, when the persistor is initially created
      return Promise.resolve();
    }
    if (!this.mSerializeScheduled) {
      this.mSerializeScheduled = true;
      // ensure we don't try to concurrently write the files
      this.enqueue(() => Promise.delay(200, this.doSerialize()));
    }
    return Promise.resolve();
  }

  private doSerialize(): Promise<void> {
    if (this.mPluginPath === undefined) {
      return;
    }
    const destPath = this.mPluginPath;

    this.mSerializing = true;
    this.mSerializeScheduled = false;

    let sorted: string[] =
        Object.keys(this.mPlugins)
            .sort((lhs: string, rhs: string) => this.mPlugins[lhs].loadOrder -
                                                this.mPlugins[rhs].loadOrder)
            .filter(pluginId => pluginId !== undefined);

    if (this.mKnownPlugins !== undefined) {
      sorted = sorted
        .filter(pluginId => this.mKnownPlugins[pluginId] !== undefined)
        .map(pluginId => this.mKnownPlugins[pluginId]);
    }

    const loadOrderFile = path.join(destPath, 'loadorder.txt');
    const pluginsFile = path.join(destPath, 'plugins.txt');
    // this ensureDir should not be necessary
    return fs.ensureDirAsync(destPath)
      .then(() => fs.writeFileAsync(loadOrderFile,
        '# Automatically generated by Vortex\r\n' + sorted.join('\r\n'), { encoding: 'utf8' }))
      .then(() => {
        const filtered: string[] = this.toPluginList(sorted);
        return fs.writeFileAsync(pluginsFile,
          '# Automatically generated by Vortex\r\n' + filtered.join('\r\n'), { encoding: 'latin1' });
      })
      .then(() => {
        if (this.mPluginFormat === 'original') {
          const offset = 946684800;
          const oneDay = 24 * 60 * 60;
          return Promise.mapSeries(sorted, (fileName, idx) => {
            const mtime = offset + oneDay * idx;
            return fs.utimesAsync(path.join(this.mDataPath, fileName), mtime, mtime)
              .catch(err => err.code === 'ENOENT'
                ? Promise.resolve()
                : Promise.reject(err));
          }).then(() => undefined);
        } else {
          return Promise.resolve();
        }
      })
      .then(() => {
        this.mFailed = false;
        return fs.statAsync(pluginsFile);
      })
      .then(stats => {
        this.mLastWriteTime = stats.mtime;
        return null;
      })
      .catch(util.UserCanceled, () => null)
      .catch(err => {
        if (err.code !== 'EBUSY') {
          this.reportError('failed to write plugin list', err, { allowReport: err.code !== 'EPERM' });
        } // no point reporting an error if the file is locked by another
          // process (could be the game itself)
      })
      .finally(() => {
        this.mSerializing = false;
      });
  }

  private filterFileData(input: string, plugins: boolean): string[] {
    const res = input.split(/\r?\n/).filter((value: string) => {
        return !value.startsWith('#') && (value.length > 0);
      });

    return res;
  }

  private initFromKeyList(plugins: IPluginMap, keys: string[], enable: boolean, offset: number) {
    // plugins identifies files actually on disk, keys is from loadorder.txt or plugins.txt, can't
    // be sure if those files actually exist on disk

    let loadOrderPos = offset;
    const nativePluginSet = new Set<string>(this.mNativePlugins);
    // eliminate duplicates
    const transformedKeys = Array.from(new Set(keys.map(key => key.toLowerCase())));
    transformedKeys.forEach((key: string) => {
      const keyEnabled = enable && ((this.mPluginFormat === 'original') || (key[0] === '*'));
      if ((this.mPluginFormat === 'fallout4') && (key[0] === '*')) {
        key = key.slice(1);
      }
      // ignore native plugins in newer games
      if ((this.mPluginFormat === 'fallout4') && nativePluginSet.has(key)) {
        return;
      }
      // ignore files that don't exist on disk
      if (plugins[key] === undefined) {
        plugins[key] = {
          enabled: false,
          loadOrder: -1,
        };
      }
        plugins[key].enabled = keyEnabled || nativePluginSet.has(key);
      if (plugins[key].loadOrder === -1) {
        plugins[key].loadOrder = loadOrderPos++;
      }
    });
    return loadOrderPos;
  }

  private deserialize(retry: boolean = false): Promise<void> {
    if (this.mPluginPath === undefined) {
      return Promise.resolve();
    }

    let offset = 0;

        const pluginsFile = path.join(this.mPluginPath, 'plugins.txt');

    const newPlugins: IPluginMap = {};

        let phaseOne: Promise<Buffer>;
        // for games with the old format we use the loadorder.txt file as reference for the
        // load order and only use the plugins.txt as "backup".
        // for newer games, since all plugins are listed, we don't really need the loadorder.txt
        // at all
        if (this.mPluginFormat === 'original') {
          const loadOrderFile = path.join(this.mPluginPath, 'loadorder.txt');
          log('debug', 'deserialize', { format: this.mPluginFormat, pluginsFile, loadOrderFile });
          phaseOne = fs.readFileAsync(loadOrderFile)
            .then((data: Buffer) => {
              const keys: string[] = this.filterFileData(data.toString('utf-8'), false);
              offset = this.initFromKeyList(newPlugins, keys, false, offset);
              return fs.readFileAsync(pluginsFile);
            });
        } else {
          // log('debug', 'deserialize', { format: this.mPluginFormat, pluginsFile });
          phaseOne = fs.readFileAsync(pluginsFile);
        }
        return phaseOne
          .then((data: Buffer) => {
            if ((data.length === 0) && !retry) {
              // not even a header? I don't trust this
              // TODO: This is just a workaround
              return this.deserialize(true);
            }
            const keys: string[] = this.filterFileData(data.toString('latin1'), true);
            this.initFromKeyList(newPlugins, keys, true, offset);
            this.mPlugins = newPlugins;
            this.mLoaded = true;
            if (this.mResetCallback) {
              this.mResetCallback();
              this.mRetryCounter = retryCount;
            }
            this.mFailed = false;
            return Promise.resolve();
          })
          .catch((err: any) => {
            if (err.code === 'ENOENT') {
              this.mLoaded = true;
              return;
            }
            log('warn', 'failed to read plugin file',
              { pluginPath: this.mPluginPath, error: require('util').inspect(err) });
            if (this.mRetryCounter > 0) {
              --this.mRetryCounter;
              this.scheduleRefresh(100);
            } else {
              // giving up...
              this.mLoaded = true;
              this.reportError('failed to read plugin list', err);
            }
          });
  }

  private scheduleRefresh(timeout: number) {
    if (this.mRefreshTimer !== null) {
      clearTimeout(this.mRefreshTimer);
    }
    this.mRefreshTimer = setTimeout(() => {
      this.mRefreshTimer = null;
      this.deserialize()
        .then(() => null)
        .catch(err => {
          this.mOnError('Failed to synchronise plugin list', err);
        });
    }, timeout);
  }

  private startWatch() {
    if (this.mWatch !== undefined) {
      this.mWatch.close();
    }

    if (this.mPluginPath === undefined) {
      return;
    }

    try {
      this.mWatch = fs.watch(this.mPluginPath, {}, (evt, fileName: string) => {
        if (!this.mSerializing && ['loadorder.txt', 'plugins.txt'].indexOf(fileName) !== -1) {
          fs.statAsync(path.join(this.mPluginPath, fileName))
          .then(stats => {
            if (stats.mtime > this.mLastWriteTime) {
              this.scheduleRefresh(500);
            }
          })
          .catch(err => (err.code === 'ENOENT')
            ? Promise.resolve()
            : this.mOnError('failed to read fileName', err));
        }
      });
      this.mWatch.on('error', error => {
        log('warn', 'failed to watch plugin directory', error.message);
      });
    } catch (err) {
      log('error', 'failed to look for plugin changes', {
        pluginPath: this.mPluginPath, err,
      });
    }
  }

  private stopWatch() {
    if (this.mWatch !== undefined) {
      this.mWatch.close();
      this.mWatch = undefined;
    }
  }
}

export default PluginPersistor;
