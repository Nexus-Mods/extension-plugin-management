import {updatePluginOrder} from './actions/loadOrder';
import {IPluginsLoot, IPlugins} from './types/IPlugins';
import {gameSupported, pluginPath} from './util/gameSupport';

import * as Bluebird from 'bluebird';
import { remote } from 'electron';
import { LootAsync } from 'loot';
import * as path from 'path';
import {} from 'redux-thunk';
import {actions, fs, log, selectors, types, util} from 'vortex-api';

const LOOT_LIST_REVISION = 'v0.13';

const LootProm: any = Bluebird.promisifyAll(LootAsync);

class LootInterface {
  private mExtensionApi: types.IExtensionApi;
  private mInitPromise: Bluebird<{ game: string, loot: typeof LootProm }> =
    Bluebird.resolve({ game: undefined, loot: undefined });
  private mSortPromise: Bluebird<string[]> = Bluebird.resolve([]);

  private mUserlistTime: Date;

  constructor(context: types.IExtensionContext) {
    const store = context.api.store;

    this.mExtensionApi = context.api;

    // when the game changes, we need to re-initialize loot for that game
    context.api.events.on('gamemode-activated',
      gameMode => this.onGameModeChanged(context, gameMode));

    { // in case the initial gamemode-activated event was already sent,
      // initialize right away
      const gameMode = selectors.activeGameId(store.getState());
      if (gameMode) {
        this.onGameModeChanged(context, gameMode);
      }
    }

    context.api.events.on('restart-helpers', async () => {
      const { game, loot } = await this.mInitPromise;
      const gameMode = selectors.activeGameId(store.getState());
      this.startStopLoot(context, gameMode, loot)
    });

    // on demand, re-sort the plugin list
    context.api.events.on('autosort-plugins', this.onSort);

    context.api.events.on('plugin-details', this.pluginDetails);
  }

  public async wait(): Promise<void> {
    await this.mInitPromise;
    await this.mSortPromise;
  }

  private onSort = async (manual: boolean, callback?: (err: Error) => void) => {
    const { store } = this.mExtensionApi;
    try {
      if (manual || store.getState().settings.plugins.autoSort) {
        // ensure initialisation is done
        const { game, loot } = await this.mInitPromise;

        const state = store.getState();
        const gameMode = selectors.activeGameId(state);
        if ((gameMode !== game) || !gameSupported(gameMode) || (loot === undefined) || loot.isClosed()) {
          return;
        }
        const pluginList: IPlugins = state.session.plugins.pluginList;

        let pluginNames: string[] = Object
          .keys(state.loadOrder)
          .filter((name: string) => (
            (pluginList[name] !== undefined)
            && (pluginList[name].deployed)))
          .sort((lhs, rhs) => state.loadOrder[lhs].loadOrder - state.loadOrder[rhs].loadOrder);

        // ensure no other sort is in progress
        try {
          await this.mSortPromise;
        // tslint:disable-next-line:no-empty
        } catch (err) {}

        await this.doSort(pluginNames, gameMode, loot);
      }
      if (callback !== undefined) {
        callback(null);
      }
      return Promise.resolve();
    } catch (err) {
      if (callback !== undefined) {
        callback(err);
      }
    }
  }

  private get gamePath() {
    const { store } = this.mExtensionApi;
    const discovery = selectors.currentGameDiscovery(store.getState());
    if (discovery === undefined) {
      // no game selected
      return undefined;
    }
    return discovery.path;
  }

  private async doSort(pluginNames: string[], gameMode: string, loot: typeof LootProm) {
    const { store } = this.mExtensionApi;
    try {
      store.dispatch(actions.startActivity('plugins', 'sorting'));
      this.mSortPromise = this.readLists(gameMode, loot)
        .then(() => loot.sortPluginsAsync(pluginNames));
      const sorted: string[] = await this.mSortPromise;
      store.dispatch(updatePluginOrder(sorted, false));
    } catch (err) {
      log('info', 'loot failed', { error: err.message });
      if (err.message.startsWith('Cyclic interaction')) {
        this.reportCycle(err);
      } else if (err.message.endsWith('is not a valid plugin')) {
        const pluginName = err.message.replace(/"([^"]*)" is not a valid plugin/, '$1');
        const reportErr = () => {
          this.mExtensionApi.sendNotification({
            id: 'loot-failed',
            type: 'warning',
            message: this.mExtensionApi.translate('Plugins not sorted because: {{msg}}',
              { replace: { msg: err.message }, ns: 'gamebryo-plugin' }),
          });
        }
        try {
          await fs.statAsync(path.join(this.gamePath, 'data', pluginName));
          reportErr();
        } catch (err) {
          const idx = pluginNames.indexOf(pluginName);
          if (idx !== -1) {
            const newList = pluginNames.slice();
            newList.splice(idx, 1);
            return await this.doSort(newList, gameMode, loot);
          } else {
            reportErr();
          }
        }
      } else if (err.message.match(/The group "[^"]*" does not exist/)) {
        this.mExtensionApi.sendNotification({
          id: 'loot-failed',
          type: 'warning',
          message: this.mExtensionApi.translate('Plugins not sorted because: {{msg}}',
            { replace: { msg: err.message }, ns: 'gamebryo-plugin' }),
        });
      } else if (err.message === 'already closed') {
        // loot process terminated, don't really care about the result anyway
      } else {
        this.mExtensionApi.showErrorNotification('LOOT operation failed', err, {
          id: 'loot-failed', allowReport: true
        });
      }
    } finally {
      store.dispatch(actions.stopActivity('plugins', 'sorting'));
    }
  }

  private onGameModeChanged = async (context: types.IExtensionContext, gameMode: string) => {
    const { game, loot }: { game: string, loot: LootAsync } = await this.mInitPromise;
    if (gameMode === game) {
      // no change
      return;
    }
    this.startStopLoot(context, gameMode, loot);
  }

  private startStopLoot(context: types.IExtensionContext, gameMode: string, loot: LootAsync) {
    if (loot !== undefined) {
      // close the loot instance of the old game, but give it a little time, otherwise it may try to
      // to run instructions after being closed.
      // TODO: Would be nice if this was deterministic...
      setTimeout(() => {
        loot.close();
      }, 5000);
    }
    const gamePath = this.gamePath;
    if (gameSupported(gameMode)) {
      try {
        this.mInitPromise = this.init(gameMode, gamePath);
      } catch (err) {
        context.api.showErrorNotification('Failed to initialize LOOT', {
          error: err,
          Game: gameMode,
          Path: gamePath,
        });
        this.mInitPromise = Bluebird.resolve({ game: gameMode, loot: undefined });
      }
    } else {
      this.mInitPromise = Bluebird.resolve({ game: gameMode, loot: undefined });
    }
  }

  private pluginDetails = async (plugins: string[], callback: (result: IPluginsLoot) => void) => {
    const { game, loot } = await this.mInitPromise;
    if ((loot === undefined) || loot.isClosed()) {
      callback({});
      return;
    }

    try {
      // not really interested in these messages but apparently it's the only way to make the api
      // drop its cache of _all_ previously evaluated conditions
      await loot.getGeneralMessagesAsync(true);
      await loot.loadCurrentLoadOrderStateAsync();
    } catch (err) {
      this.mExtensionApi.showErrorNotification('There were errors getting plugin information from LOOT',
        err, { allowReport: false });
      callback({});
      return;
    }

    const result: IPluginsLoot = {};
    let error: Error;
    Bluebird.map(plugins, (pluginName: string) =>
      loot.getPluginMetadataAsync(pluginName)
      .then(meta => {
        result[pluginName] = {
          messages: meta.messages,
          tags: meta.tags,
          cleanliness: meta.cleanInfo,
          dirtyness: meta.dirtyInfo,
          group: meta.group,
        };
      })
      .catch(err => {
        result[pluginName] = {
          messages: [],
          tags: [],
          cleanliness: [],
          dirtyness: [],
          group: undefined,
        };
        if (err.arg !== undefined) {
          // invalid parameter. This simply means that loot has no meta data for this plugin so that's
          // not a problem
        } else {
          log('error', 'Failed to get plugin meta data from loot', { pluginName, error: err.message });
          error = err;
        }
      }))
    .then(() => {
      if (error !== undefined) {
        this.mExtensionApi.showErrorNotification('There were errors getting plugin information from LOOT',
          error, { allowReport: false });
      }
      callback(result);
    });
  }

  // tslint:disable-next-line:member-ordering
  private readLists = Bluebird.method(async (gameMode: string, loot: typeof LootProm) => {
    const t = this.mExtensionApi.translate;
    const masterlistPath = path.join(remote.app.getPath('userData'), gameMode,
                                     'masterlist', 'masterlist.yaml');
    const userlistPath = path.join(remote.app.getPath('userData'), gameMode, 'userlist.yaml');

    let mtime: Date;
    try {
      mtime = (await fs.statAsync(userlistPath)).mtime;
    } catch (err) {
      mtime = null;
    }

    // load & evaluate lists first time we need them and whenever
    // the userlist has changed
    if ((mtime !== null) &&
        // this.mUserlistTime could be undefined or null
        (!this.mUserlistTime ||
         (this.mUserlistTime.getTime() !== mtime.getTime()))) {
      log('info', '(re-)loading loot lists', {
        mtime,
        masterlistPath,
        userlistPath,
        last: this.mUserlistTime,
      });
      try {
        await fs.statAsync(masterlistPath);
        await loot.loadListsAsync(masterlistPath, mtime !== null ? userlistPath : '');
        log('info', 'loaded loot lists');
        this.mUserlistTime = mtime;
      } catch (err) {
        this.mExtensionApi.showErrorNotification('Failed to load master-/userlist', err, {
            allowReport: false,
          } as any);
      }
    }
  });

  private convertGameId(gameMode: string, masterlist: boolean) {
    if (masterlist && (gameMode === 'fallout4vr')) {
      // use the masterlist from fallout 4
      return 'fallout4';
    } else if (gameMode === 'skyrimvr') {
      // no specific support from skyrim vr yet
      return 'skyrimse';
    }
    return gameMode;
  }

  // tslint:disable-next-line:member-ordering
  private init = Bluebird.method(async (gameMode: string, gamePath: string) => {
    const localPath = pluginPath(gameMode);
    try {
      await fs.ensureDirAsync(localPath);
    } catch (err) {
      this.mExtensionApi.showErrorNotification('Failed to create necessary directory', err, {
          allowReport: false,
        });
    }

    let loot: any;

    try {
      loot = Bluebird.promisifyAll(
        await LootProm.createAsync(this.convertGameId(gameMode, false), gamePath,
                                   localPath, 'en', this.log, this.fork));
    } catch (err) {
      this.mExtensionApi.showErrorNotification('Failed to initialize LOOT', err, {
        allowReport: false,
      } as any);
      return { game: gameMode, loot: undefined };
    }
    const masterlistRepoPath = path.join(remote.app.getPath('userData'), gameMode,
                                     'masterlist');
    const masterlistPath = path.join(masterlistRepoPath, 'masterlist.yaml');
    try {
      await fs.ensureDirAsync(path.dirname(masterlistPath));
      const updated = await loot.updateMasterlistAsync(
          masterlistPath,
          `https://github.com/loot/${this.convertGameId(gameMode, true)}.git`,
          LOOT_LIST_REVISION);
      log('info', 'updated loot masterlist', updated);
      this.mExtensionApi.events.emit('did-update-masterlist');
    } catch (err) {
      const t = this.mExtensionApi.translate;
      this.mExtensionApi.showErrorNotification('Failed to update masterlist', {
        message: t('This might be a temporary network error. '
              + 'If it persists, please delete "{{masterlistPath}}" to force Vortex to '
              + 'download a new copy.', { replace: { masterlistPath: masterlistRepoPath } }),
        error: err,
      }, {
          allowReport: false,
        });
    }

    try {
      // we need to ensure lists get loaded at least once. before sorting there
      // will always be a check if the userlist was changed
      const userlistPath = path.join(remote.app.getPath('userData'), gameMode, 'userlist.yaml');

      let mtime: Date;
      try {
        mtime = (await fs.statAsync(userlistPath)).mtime;
      } catch (err) {
        mtime = null;
      }
      // ensure masterlist is available
      await fs.statAsync(masterlistPath);
      await loot.loadListsAsync(masterlistPath, mtime !== null ? userlistPath : '');
      await loot.loadCurrentLoadOrderStateAsync();
      this.mUserlistTime = mtime;
    } catch (err) {
      this.mExtensionApi.showErrorNotification('Failed to load master-/userlist', err, {
          allowReport: false,
        } as any);
    }

    return { game: gameMode, loot };
  });

  private fork = (modulePath: string, args: string[]) => {
    (this.mExtensionApi as any).runExecutable(process.execPath, [modulePath].concat(args || []), {})
      .catch(util.ProcessCanceled, () => null)
      .catch(err => this.mExtensionApi.showErrorNotification('Failed to start LOOT', err));
  }

  private log = (level: number, message: string) => {
    log(this.logLevel(level) as any, message);
  }

  private logLevel(level: number): string {
    switch (level) {
      case 0: return 'debug'; // actually trace
      case 1: return 'debug';
      case 2: return 'info';
      case 3: return 'warn';
      case 4: return 'error';
      case 5: return 'error'; // actually fatal
    }
  }

  private reportCycle(err: Error) {
    this.mExtensionApi.sendNotification({
      type: 'warning',
      message: 'Plugins not sorted because of cyclic rules',
      actions: [
        {
          title: 'More',
          action: (dismiss: () => void) => {
            const bbcode = this.mExtensionApi.translate(
              'LOOT reported a cyclic interaction between rules.<br />'
              + 'In the simplest case this is something like '
              + '[i]"A needs to load after B"[/i] and [i]"B needs to load after A"[/i] '
              + 'but it can be arbitrarily complicated: [i]"A after B after C after A"[/i].<br />'
              + 'This conflict involves at least one custom rule.<br />'
              + 'Please read the LOOT message and change your custom rules to resolve the cycle: '
              + '[quote]' + err.message + '[/quote]', { ns: 'gamebryo-plugin' });
            (this.mExtensionApi.store as any).dispatch(
                actions.showDialog('info', 'Cyclic interaction', {bbcode}, [
                  {
                    label: 'Close',
                  },
                ]));
          },
        },
      ],
    });
  }
}

export default LootInterface;
