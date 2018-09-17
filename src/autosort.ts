import {updatePluginOrder} from './actions/loadOrder';
import {IPluginsLoot} from './types/IPlugins';
import {gameSupported, pluginPath} from './util/gameSupport';

import * as Bluebird from 'bluebird';
import { remote } from 'electron';
import { LootAsync } from 'loot';
import * as path from 'path';
import {} from 'redux-thunk';
import {actions, fs, log, selectors, types} from 'vortex-api';

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

    // on demand, re-sort the plugin list
    context.api.events.on('autosort-plugins', this.onSort);

    context.api.events.on('plugin-details', this.pluginDetails);
  }

  public async wait(): Promise<void> {
    await this.mInitPromise;
    await this.mSortPromise;
  }

  private onSort = async (manual: boolean) => {
    const { store } = this.mExtensionApi;
    if (manual || store.getState().settings.plugins.autoSort) {
      // ensure initialisation is done
      const { game, loot } = await this.mInitPromise;

      const state = store.getState();
      const gameMode = selectors.activeGameId(state);
      if ((gameMode !== game) || !gameSupported(gameMode) || (loot === undefined)) {
        return;
      }

      const pluginNames: string[] = Object
        .keys(state.loadOrder)
        .filter((name: string) => (state.session.plugins.pluginList[name] !== undefined))
        .sort((lhs, rhs) => state.loadOrder[lhs].loadOrder - state.loadOrder[rhs].loadOrder);

      // ensure no other sort is in progress
      try {
        await this.mSortPromise;
      // tslint:disable-next-line:no-empty
      } catch (err) {}

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
        } else if (err.message.endsWith('is not a valid plugin')
                   || err.message.match(/The group "[^"]*" does not exist/))  {
          this.mExtensionApi.sendNotification({
            id: 'loot-failed',
            type: 'warning',
            message: this.mExtensionApi.translate('Plugins not sorted because: {{msg}}',
              { replace: { msg: err.message }, ns: 'gamebryo-plugin' }),
          });
        } else {
          this.mExtensionApi.showErrorNotification('LOOT operation failed', {
            message: err.message,
          }, {
            id: 'loot-failed', allowReport: true });
        }
      } finally {
        store.dispatch(actions.stopActivity('plugins', 'sorting'));
      }
    }
    return Promise.resolve();
  }

  private onGameModeChanged = async (context: types.IExtensionContext, gameMode: string) => {
    const { game, loot } = await this.mInitPromise;
    if (gameMode === game) {
      // no change
      return;
    }
    const store = context.api.store;
    const discovery = selectors.currentGameDiscovery(store.getState());
    if (discovery === undefined) {
      // no game selected
      return;
    }
    const gamePath: string = discovery.path;
    if (gameSupported(gameMode)) {
      try {
        this.mInitPromise = this.init(gameMode, gamePath);
      } catch (err) {
        context.api.showErrorNotification('Failed to initialize LOOT', {
          message: err.message,
          game: gameMode,
          path: gamePath,
        });
        this.mInitPromise = Bluebird.resolve({ game: gameMode, loot: undefined });
      }
    } else {
      this.mInitPromise = Bluebird.resolve({ game: gameMode, loot: undefined });
    }
  }

  private pluginDetails = async (plugins: string[], callback: (result: IPluginsLoot) => void) => {
    const { game, loot } = await this.mInitPromise;
    if (loot === undefined) {
      callback({});
      return;
    }
    const t = this.mExtensionApi.translate;
    const result: IPluginsLoot = {};
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
      }))
    .then(() => {
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
      await loot.loadListsAsync(masterlistPath, mtime !== null ? userlistPath : '');
      log('info', 'loaded loot lists');
      this.mUserlistTime = mtime;
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
    const t = this.mExtensionApi.translate;
    const localPath = pluginPath(gameMode);
    await fs.ensureDirAsync(localPath);

    let loot: any;

    try {
      loot = Bluebird.promisifyAll(
        await LootProm.createAsync(this.convertGameId(gameMode, false), gamePath,
                                   localPath, 'en', this.log));
    } catch (err) {
      this.mExtensionApi.showErrorNotification('Failed to initialize LOOT', err, {
        allowReport: false,
      });
      return { game: gameMode, loot: undefined };
    }
    const masterlistPath = path.join(remote.app.getPath('userData'), gameMode,
                                     'masterlist', 'masterlist.yaml');
    try {
      await fs.ensureDirAsync(path.dirname(masterlistPath));
      const updated = await loot.updateMasterlistAsync(
          masterlistPath,
          `https://github.com/loot/${this.convertGameId(gameMode, true)}.git`,
          LOOT_LIST_REVISION);
      log('info', 'updated loot masterlist', updated);
      this.mExtensionApi.events.emit('did-update-masterlist');
    } catch (err) {
      this.mExtensionApi.showErrorNotification('Failed to update masterlist', err, {
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
      await loot.loadListsAsync(masterlistPath, mtime !== null ? userlistPath : '');
      this.mUserlistTime = mtime;
    } catch (err) {
      this.mExtensionApi.showErrorNotification('Failed to load master-/userlist', err, {
          allowReport: false,
        });
    }

    return { game: gameMode, loot };
  });

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
