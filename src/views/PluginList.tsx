import { setPluginEnabled } from '../actions/loadOrder';
import { setPluginInfo, updatePluginWarnings } from '../actions/plugins';
import { setAutoSortEnabled } from '../actions/settings';
import { addGroup, addGroupRule, setGroup } from '../actions/userlist';
import { ILoadOrder } from '../types/ILoadOrder';
import { ILOOTList, ILOOTPlugin } from '../types/ILOOTList';
import {
  IPluginCombined,
  IPluginLoot,
  IPluginParsed,
  IPlugins,
} from '../types/IPlugins';
import { gameSupported, minRevision, revisionText, supportsESL } from '../util/gameSupport';
import GroupFilter from '../util/GroupFilter';

import { GHOST_EXT, NAMESPACE } from '../statics';

import DependencyIcon from './DependencyIcon';
import MasterList from './MasterList';
import PluginFlags, { getPluginFlags } from './PluginFlags';
import PluginFlagsFilter from './PluginFlagsFilter';
import PluginStatusFilter from './PluginStatusFilter';

import Promise from 'bluebird';
import ESPFile from 'esptk';
import I18next, { TFunction } from 'i18next';
import update from 'immutability-helper';
import * as _ from 'lodash';
import { Message, PluginCleaningData } from 'loot';
import * as path from 'path';
import * as React from 'react';
import { Alert, Button, ListGroup, ListGroupItem, Panel } from 'react-bootstrap';
import { withTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { connect } from 'react-redux';
import { Creatable } from 'react-select';
import * as Redux from 'redux';
import { ThunkDispatch } from 'redux-thunk';
import { generate as shortid } from 'shortid';
import {ComponentEx, FlexLayout, Icon, IconBar, ITableRowAction,
  log, MainPage, selectors, Spinner,
  Table, TableTextFilter, ToolbarIcon, tooltip, types, Usage, util,
} from 'vortex-api';

type TranslationFunction = typeof I18next.t;

const CLEANING_GUIDE_LINK =
  'https://tes5edit.github.io/docs/7-mod-cleaning-and-error-checking.html';

interface IBaseProps {
  nativePlugins: string[];
  onRefreshPlugins: () => void;
  onSetPluginGhost: (pluginId: string, ghosted: boolean, enabled: boolean) => void;
}

interface IConnectedProps {
  gameMode: string;
  language: string;
  plugins: IPlugins;
  loadOrder: { [name: string]: ILoadOrder };
  autoSort: boolean;
  activity: string[];
  modActivity: string[];
  needToDeploy: boolean;
  userlist: ILOOTList;
  masterlist: ILOOTList;
  deployProgress: string;
  mods: { [id: string]: types.IMod };
}

interface IActionProps {
  onSetPluginEnabled: (pluginName: string, enabled: boolean) => void;
  onSetAutoSortEnabled: (enabled: boolean) => void;
  onAddGroup: (group: string) => void;
  onAddGroupRule: (group: string, reference: string) => void;
  onSetGroup: (pluginName: string, group: string) => void;
  onUpdateWarnings: (id: string, warning: string, value: boolean) => void;
  onUpdatePluginInfo: (info: { [id: string]: IPluginCombined }) => void;
}

interface IComponentState {
  selectedPlugin: string;
  pluginsLoot: { [name: string]: IPluginLoot };
  pluginsParsed: { [name: string]: IPluginParsed };
  pluginsCombined: { [name: string]: IPluginCombined };
}

type IProps = IBaseProps & IConnectedProps & IActionProps;

function toHex(input: number, pad: number) {
  if (input === undefined) {
    return 'FF';
  }
  let res = input.toString(16).toUpperCase();
  while (res.length < pad) {
    res = '0' + res;
  }
  return res;
}

interface IGroupSelectProps {
  t: TranslationFunction;
  plugins: IPluginCombined[];
  userlist: ILOOTList;
  masterlist: ILOOTList;
  onSetGroup: (pluginId: string, group: string) => void;
}

class GroupSelect extends React.PureComponent<IGroupSelectProps, {}> {
  public render(): JSX.Element {
    const { plugins, masterlist, userlist } = this.props;

    let group = util.getSafe(plugins, [0, 'group'], '');
    if (plugins.find(plugin => plugin.group !== group) !== undefined) {
      group = '';
    }

    const options = Array.from(new Set([]
        .concat(masterlist.groups, userlist.groups)
        .filter(iter => iter !== undefined)
        .map(iter => iter.name)))
      .map(iter => ({ label: iter, value: iter }));

    const isCustom: boolean = (userlist.plugins || []).find(plugin => {
        const refPlugin = plugins.find(iter => iter.id === plugin.name.toLowerCase());
        return (refPlugin !== undefined) && (plugin.group !== undefined);
      }) !== undefined;

    return (
      <Creatable
        // TODO: for some reason the value doesn't actually show - anywhere. Guess
        //   we have to update react-select at some point...
        value={isCustom ? group : undefined}
        placeholder={group || 'default'}
        onChange={this.changeGroup}
        options={options}
        promptTextCreator={this.createPrompt}
      />
    );
  }

  private createPrompt = (label: string): string => {
    const { t } = this.props;
    return t('Create Group: {{group}}', { replace: { group: label } });
  }

  private changeGroup = (selection: { name: string, value: string }) => {
    const { plugins, onSetGroup } = this.props;
    plugins.forEach(plugin => onSetGroup(plugin.name,
      selection ? selection.value : undefined));
  }
}

interface IPluginCountProps {
  t: TranslationFunction;
  gameId: string;
  plugins: { [pluginId: string]: IPluginCombined };
}

function PluginCount(props: IPluginCountProps) {
  const { t, gameId, plugins } = props;

  if (!gameSupported(gameId)) {
    return null;
  }

  const regular = Object.keys(plugins).filter(id =>
    (plugins[id].enabled || plugins[id].isNative) && !plugins[id].isLight);
  const light = Object.keys(plugins).filter(id =>
    (plugins[id].enabled || plugins[id].isNative) && plugins[id].isLight);

  const eslGame = supportsESL(gameId);

  const classes = ['gamebryo-plugin-count'];

  const regLimit = eslGame ? 254 : 255;
  if ((regular.length > regLimit) || (light.length > 4096)) {
    classes.push('gamebryo-plugin-limit');
  }

  let tooltipText = t('Plugins shouldn\'t exceed mod index {{maxIndex}} for a total of {{count}} '
                  + 'plugins (including base game and DLCs).', {
      replace: {
        maxIndex: eslGame ? '0xFD' : '0xFE',
        count: eslGame ? 254 : 255,
      },
    });

  if (eslGame) {
    tooltipText += '\n' + t('In addition you can have up to 4096 light plugins.');
  }

  return (
    <div className={classes.join(' ')}>
      <a onClick={nop} className='fake-link' title={tooltipText}>
      {t('Active: {{ count }}', { count: regular.length })}
      {eslGame ? ' ' + t('Light: {{ count }}', { count: light.length }) : null}
      </a>
    </div>
  );
}

function nop() {
  // nop
}

class PluginList extends ComponentEx<IProps, IComponentState> {
  private staticButtons: types.IActionDefinition[];
  private pluginEnabledAttribute: types.ITableAttribute;
  private actions: ITableRowAction[];
  private mLang: string;
  private mCollator: Intl.Collator;
  private mMounted: boolean = false;
  private mCachedGameMode: string;
  private mUpdateId: string;
  private mUpdateDetailsDebounder: util.Debouncer;

  private installedNative: { [name: string]: number } = {};

  private pluginAttributes: Array<types.ITableAttribute<IPluginCombined>> = [];

  constructor(props) {
    super(props);
    this.state = {
      selectedPlugin: undefined,
      pluginsParsed: {},
      pluginsLoot: {},
      pluginsCombined: {},
    };

    const { t, onSetAutoSortEnabled } = props;

    this.pluginAttributes = this.makeAttributes();

    this.actions = [
      {
        icon: 'checkbox-checked',
        title: 'Enable',
        action: this.enableSelected,
        singleRowAction: false,
      },
      {
        icon: 'checkbox-unchecked',
        title: 'Disable',
        action: this.disableSelected,
        singleRowAction: false,
      },
      {
        icon: 'ghost',
        title: 'Ghost',
        action: this.ghostSelected,
        singleRowAction: false,
      },
      {
        icon: 'plugin-light',
        title: 'Mark as Light',
        action: this.eslifySelected,
        condition: (instanceIds: string[]) =>
          supportsESL(this.props.gameMode)
          && (instanceIds.find(pluginId => {
            const plugin = this.state.pluginsCombined[pluginId];
            return plugin.isValidAsLightMaster
                && !plugin.isLight
                && path.extname(pluginId) === '.esp';
          }) !== undefined),
        singleRowAction: true,
        multiRowAction: true,
      },
      {
        icon: 'plugin-light',
        title: 'Mark as Regular',
        action: this.uneslifySelected,
        condition: (instanceIds: string[]) =>
          supportsESL(this.props.gameMode)
          && (instanceIds.find(pluginId => {
            const plugin = this.state.pluginsCombined[pluginId];
            return plugin.isLight
                && path.extname(pluginId) === '.esp';
          }) !== undefined),
        singleRowAction: true,
        multiRowAction: true,
      },
    ];

    this.pluginEnabledAttribute = {
      id: 'enabled',
      name: 'Status',
      description: 'Is plugin enabled in current profile',
      icon: 'check-o',
      calc: (plugin: IPluginCombined) => {
        return plugin.isNative
          ? undefined
          : (path.extname(plugin.filePath) === GHOST_EXT)
          ? 'Ghost'
          : (plugin.enabled === true)
          ? 'Enabled'
          : 'Disabled';
      },
      placement: 'table',
      isToggleable: false,
      edit: {
        inline: true,
        choices: () => [
          { key: 'enabled', text: 'Enabled', icon: 'toggle-enabled' },
          { key: 'disabled', text: 'Disabled', icon: 'toggle-disabled' },
          { key: 'ghost', text: 'Ghost', icon: 'ghost' },
        ],
        onChangeValue: (plugin: IPluginCombined, value: any) => {
          if (plugin.isNative) {
            // safeguard so we don't accidentally disable a native plugin
            return;
          }

          if (value === undefined) {
            // toggle
            if (path.extname(plugin.filePath) === GHOST_EXT) {
              this.props.onSetPluginGhost(plugin.id, false, true);
            } else {
              this.props.onSetPluginEnabled(plugin.id, !plugin.enabled);
            }
          } else {
            if (value === 'ghost') {
              this.props.onSetPluginGhost(plugin.id, true, false);
            } else {
              if (path.extname(plugin.filePath) === GHOST_EXT) {
                this.props.onSetPluginGhost(plugin.id, false, value === 'enabled');
              } else {
                this.props.onSetPluginEnabled(plugin.id, value === 'enabled');
              }
            }
          }
        },
      },
      isSortable: true,
      isGroupable: true,
      filter: new PluginStatusFilter(),
    } as any;

    this.staticButtons = [
      {
        component: ToolbarIcon,
        props: () => {
          const { autoSort } = this.props;
          return {
            id: 'btn-autosort-loot',
            key: 'btn-autosort-loot',
            icon: autoSort ? 'locked' : 'unlocked',
            text: autoSort ? t('Autosort Enabled', { ns: NAMESPACE })
              : t('Autosort Disabled', { ns: NAMESPACE }),
            state: autoSort,
            onClick: () => onSetAutoSortEnabled(!autoSort),
          };
        },
      },
      {
        component: ToolbarIcon,
        props: () => {
          const { activity } = this.props;
          const sorting = (activity || []).indexOf('sorting') !== -1;
          return {
            id: 'btn-sort',
            key: 'btn-sort',
            icon: sorting ? 'spinner' : 'loot-sort',
            text: t('Sort Now', { ns: NAMESPACE }),
            onClick: () => this.context.api.events.emit('autosort-plugins', true, () => {
              this.updatePlugins(this.props.plugins, this.props.gameMode)
              .catch(util.ProcessCanceled, () => null)
              .catch(err => {
                log('warn', 'failed to update plugins', { error: err.message });
              });
            }),
          };
        },
      },
      {
        position: 1000,
        component: PluginCount,
        props: () => ({
          t: this.props.t,
          gameId: this.props.gameMode,
          plugins: this.state.pluginsCombined,
        }),
      },
    ];

    this.mUpdateDetailsDebounder = new util.Debouncer((pluginList: IPlugins, gameId: string) => {
      if (this.props.modActivity.length > 0) {
        log('debug', 'deferring update plugin details because mod activity');
        this.mUpdateDetailsDebounder.schedule(undefined, pluginList, gameId);
        return Promise.resolve();
      }
      return this.updatePlugins(pluginList, gameId)
        .catch(util.ProcessCanceled, () => null)
        .catch(err => {
          log('warn', 'failed to update plugins', { error: err.message });
        });
    }, 2000);
  }

  public emptyPluginParsed(): { [plugin: string]: IPluginParsed } {
    return Object.keys(this.props.plugins ?? {}).reduce((prev, key) => {
      prev[key] = {
        isMaster: false,
        isLight: false,
        parseFailed: false,
        masterList: [],
        author: '',
        description: '',
        revision: 999,
      };
      return prev;
    }, {});
  }

  public emptyPluginLOOT(): { [plugin: string]: IPluginLoot } {
    return Object.keys(this.props.plugins ?? {}).reduce((prev, key) => {
      const empty: IPluginLoot = {
        messages: [],
        cleanliness: [],
        dirtyness: [],
        group: '',
        currentTags: [],
        suggestedTags: [],
        isValidAsLightMaster: false,
        incompatibilities: [],
        requirements: [],
        loadsArchive: false,
        version: '',
      };
      prev[key] = empty;
      return prev;
    }, {});
  }

  public componentDidMount() {
    this.mMounted = true;
    const { plugins, onUpdatePluginInfo } = this.props;
    const parsed = this.emptyPluginParsed();
    const loot = this.emptyPluginLOOT();
    const combined = this.detailedPlugins(plugins, loot, parsed);
    onUpdatePluginInfo(_.cloneDeep(combined));
    this.setState(update(this.state, {
      pluginsParsed: { $set: parsed },
      pluginsLoot: { $set: loot },
      pluginsCombined: { $set: combined },
    }));

    // Will verify plugins for warning/error loot messages
    //  and notify the user if any are found.
    this.updatePlugins(this.props.plugins, this.props.gameMode)
      .then(() => this.applyUserlist(this.props.userlist.plugins || [],
                                     this.props.masterlist.plugins || []))
      .catch(util.ProcessCanceled, () => null)
      .catch(err => {
        log('warn', 'failed to update plugins', { error: err.message });
      });
  }

  public componentWillUnmount() {
    this.mMounted = false;
  }

  public UNSAFE_componentWillReceiveProps(nextProps: IProps) {
    const pluginPaths = (input: IPlugins) =>
      Object.values(input).map(plug => plug.filePath).sort();
    if ((this.props.plugins === undefined)
        || !_.isEqual(Object.keys(this.props.plugins), Object.keys(nextProps.plugins))
        || !_.isEqual(pluginPaths(this.props.plugins), pluginPaths(nextProps.plugins))) {
      this.mUpdateDetailsDebounder.schedule(undefined, nextProps.plugins, nextProps.gameMode);
    }

    if (this.props.loadOrder !== nextProps.loadOrder) {
      this.applyLoadOrder(nextProps.loadOrder);
    }

    if (this.props.userlist !== nextProps.userlist) {
      this.applyUserlist(nextProps.userlist.plugins || [], nextProps.masterlist.plugins || []);
      // We have applied a userlist change to the component state - the details update debouncer
      //  will not kick off unless the plugins are re-sorted; unfortunately this means that the
      //  data displayed to the user in the plugins table can be outdated. Which is why we need
      //  to kick off the update details debouncer at this stage.
      //
      // Please note: Doing this on group change inside a componentDidUpdate lifecycle method
      //  will be EXTREMELY expensive - don't do it!
      this.mUpdateDetailsDebounder.schedule(undefined, this.props.plugins, this.props.gameMode);
    }
  }

  public render(): JSX.Element {
    const { t, activity, deployProgress, gameMode, needToDeploy, onRefreshPlugins } = this.props;
    const { pluginsCombined } = this.state;

    if (!gameSupported(gameMode)) {
      return null;
    }

    const data = () => {
      if ((this.mCachedGameMode !== gameMode)
          || (deployProgress !== undefined)) {
        return (
          <div className='plugin-list-loading'>
            <Spinner />
          </div>
        );
      } else if (Object.keys(pluginsCombined).length === 0) {
        return (
          <div className='plugin-list-loading'>
            <p>{t('No plugins, something seems to have gone wrong')}</p>
            <tooltip.IconButton
              icon='refresh'
              onClick={onRefreshPlugins}
              tooltip={t('Refresh plugin list')}
            />
          </div>
        );
      } else {
        return (
          <Table
            tableId='gamebryo-plugins'
            actions={this.actions}
            staticElements={[this.pluginEnabledAttribute, ...this.pluginAttributes]}
            data={pluginsCombined}
          />
        );
      }
    };

    return (
      <MainPage>
        <MainPage.Header>
          <IconBar
            group='gamebryo-plugin-icons'
            staticElements={this.staticButtons}
            className='menubar'
            t={t}
          />
        </MainPage.Header>
        <MainPage.Body>
          <FlexLayout type='column'>
            <FlexLayout.Fixed>
              {needToDeploy ? this.renderOutdated() : null}
            </FlexLayout.Fixed>
            <FlexLayout.Flex>
              <Panel>
                <Panel.Body>
                  {Object.keys(pluginsCombined).length === 0}
                  {data()}
                </Panel.Body>
              </Panel>
            </FlexLayout.Flex>
            <FlexLayout.Fixed>
              <Usage infoId='deployed-plugins' persistent>
                {t('This screen shows only deployed plugins, '
                 + 'if you\'re missing files, try deploying manually.')}
              </Usage>
            </FlexLayout.Fixed>
          </FlexLayout>
        </MainPage.Body>
      </MainPage>
    );
  }

  private renderOutdated() {
    const { t } = this.props;
    return (
          <Alert bsStyle='warning'>
            {t('This list may be outdated, you should deploy mods before modifying it.')}
            {' '}
            <Button onClick={this.deploy}>
              {t('Deploy now')}
            </Button>
          </Alert>
    );
  }

  private renderCleaningData(dat: PluginCleaningData) {
    const { t } = this.props;
    const things = [];
    if (dat['itmCount'] > 0) {
      things.push(t('{{count}} ITM record', { ns: NAMESPACE, count: dat['itmCount'] }));
    }
    if (dat.deletedNavmeshCount > 0) {
      things.push(t('{{count}} deleted navmesh',
                    { ns: NAMESPACE, count: dat.deletedNavmeshCount }));
    }
    if (dat.deletedReferenceCount > 0) {
      things.push(t('{{count}} deleted reference',
                    { ns: NAMESPACE, count: dat.deletedReferenceCount }));
    }
    const clean = things.length === 0;
    if (clean) {
      things.push(t('nothing! This plugin is clean'));
    }
    const message = t('{{tool}} found {{things}}.', {
          replace: {
            tool: dat.cleaningUtility,
            things: things.join(` ${t('and')} `),
          },
        });
    return (
      <Alert bsStyle={clean ? 'success' : 'warning'}>
        <ReactMarkdown>{message}</ReactMarkdown>
        {clean ? null : (
          <a href={CLEANING_GUIDE_LINK}>
            <Icon name='launch' />
            {t('Read about mod cleaning')}
          </a>
        )}
      </Alert>
    );
  }

  private deploy = () => {
    this.context.api.events.emit('deploy-mods', () => undefined);
  }

  private isMaster(filePath: string, flag: boolean): boolean {
    if (path.extname(filePath) === GHOST_EXT) {
      filePath = path.basename(filePath, GHOST_EXT);
    }
    const masterExts = supportsESL(this.props.gameMode)
      ? ['.esm', '.esl']
      : ['.esm'];
    return flag || (masterExts.indexOf(path.extname(filePath).toLowerCase()) !== -1);
  }

  private isLight(filePath: string, flag: boolean) {
    if (path.extname(filePath) === GHOST_EXT) {
      filePath = path.basename(filePath, GHOST_EXT);
    }
    if (!supportsESL(this.props.gameMode)) {
      return false;
    }
    return flag || (path.extname(filePath).toLowerCase() === '.esl');
  }

  private updatePlugins(pluginsIn: IPlugins, gameMode: string) {
    const updateId = this.mUpdateId = shortid();

    if ((pluginsIn === undefined) && (gameMode !== this.mCachedGameMode)) {
      // plugin list is empty after switching game, this just means we're still
      // in the process of loading the plugin list
      this.setState(update(this.state, {
        pluginsParsed: { $set: {} },
        pluginsLoot: { $set: {} },
        pluginsCombined: { $set: {} },
      }));
      return Promise.resolve();
    }

    const pluginNames: string[] = Object.keys(pluginsIn);
    const pluginsParsed: { [pluginName: string]: IPluginParsed } = {};
    let pluginsLoot;

    return Promise.each(pluginNames, (pluginName: string) => {
      if (updateId !== this.mUpdateId) {
        return Promise.reject(new util.ProcessCanceled('new update started'));
      }
      return new Promise((resolve, reject) => {
        try {
          const esp = new ESPFile(pluginsIn[pluginName].filePath);
          pluginsParsed[pluginName] = {
            isMaster: this.isMaster(pluginsIn[pluginName].filePath, esp.isMaster),
            isLight: this.isLight(pluginsIn[pluginName].filePath, esp.isLight),
            parseFailed: false,
            description: esp.description,
            author: esp.author,
            masterList: esp.masterList,
            revision: (esp as any).revision,
          };
        } catch (err) {
          // TODO: there is a time window where this is called on a file that
          //   no longer exists. Since the error message reported from the native
          //   lib isn't super informative we can't differentiate yet, so not
          //   treating this as a big problem.
          log('info', 'failed to parse esp',
            { path: pluginsIn[pluginName].filePath, error: err.message });
          pluginsParsed[pluginName] = {
            isMaster: false,
            isLight: false,
            parseFailed: true,
            description: '',
            author: '',
            masterList: [],
            revision: 999,
          };
        }
        resolve();
      });
    })
      .then(() => new Promise((resolve, reject) => {
        if (this.mUpdateId !== updateId) {
          return reject(new util.ProcessCanceled('new update started'));
        }
        if (pluginNames.length > 0) {
          this.context.api.events.emit('plugin-details',
            this.props.gameMode, pluginNames, (resolved: { [name: string]: IPluginLoot }) => {
              pluginsLoot = resolved;
              resolve();
            });
        } else {
          pluginsLoot = {};
          resolve();
        }
      }))
      .then(() => {
        if (updateId !== this.mUpdateId) {
          return Promise.reject(new util.ProcessCanceled('new update started'));
        }

        const pluginsCombined = this.detailedPlugins(pluginsIn, pluginsLoot, pluginsParsed);

        if (this.mMounted) {
          this.mCachedGameMode = this.props.gameMode;
          this.setState(update(this.state, {
            pluginsParsed: { $set: pluginsParsed },
            pluginsLoot: { $set: pluginsLoot },
            pluginsCombined: { $set: pluginsCombined },
          }));
        }

        const pluginsFlat = Object.keys(pluginsCombined).map(pluginId => pluginsCombined[pluginId]);

        const { nativePlugins } = this.props;
        this.installedNative = nativePlugins.filter(name =>
          pluginsFlat.find(
            (plugin: IPluginCombined) => name === plugin.id) !== undefined)
          .reduce((prev, name, idx) => {
            prev[name.toLowerCase()] = idx;
            return prev;
          }, {});

        this.props.onUpdatePluginInfo(_.cloneDeep(pluginsCombined));
        return Promise.resolve();
      });
  }

  private enableSelected = (pluginIds: string[]) => {
    const { loadOrder, onSetPluginEnabled, plugins } = this.props;

    pluginIds.forEach((key: string) => {
      const plugin = plugins[key];
      if ((plugin === undefined) || plugin.isNative) {
        return;
      }
      if (path.extname(plugin.filePath) === GHOST_EXT) {
        this.props.onSetPluginGhost(key, false, true);
      } else if (!util.getSafe(loadOrder, [key, 'enabled'], false)) {
        onSetPluginEnabled(key, true);
      }
    });
  }

  private disableSelected = (pluginIds: string[]) => {
    const { loadOrder, onSetPluginEnabled, plugins } = this.props;

    pluginIds.forEach((key: string) => {
      const plugin = plugins[key];
      if ((plugin === undefined) || plugin.isNative) {
        return;
      }

      if (path.extname(plugin.filePath) === GHOST_EXT) {
        this.props.onSetPluginGhost(key, false, false);
      } else if (util.getSafe<boolean>(loadOrder, [key, 'enabled'], false)) {
        onSetPluginEnabled(key, false);
      }
    });
  }

  private ghostSelected = (pluginIds: string[]) => {
    const { onSetPluginGhost, plugins } = this.props;

    pluginIds.forEach((key: string) => {
      if ((plugins[key]?.filePath !== undefined)
          && (path.extname(plugins[key]?.filePath) !== GHOST_EXT)) {
        onSetPluginGhost(key, true, false);
      }
    });
  }

  private modIndices(pluginObjects: IPluginCombined[]): { [pluginId: string]: {
      modIndex: number, eslIndex?: number } } {
    const { nativePlugins } = this.props;
    // overly complicated?
    // This sorts the whole plugin list by the load order, inserting the installed
    // native plugins at the top in their hard-coded order. Then it assigns
    // the ascending mod index to all enabled plugins.

    const np = nativePlugins.reduce((prev: { [id: string]: number }, id: string, idx: number) => {
      prev[id] = idx;
      return prev;
    }, {});
    const byLO = pluginObjects.slice().sort((lhs, rhs) => this.sortByLoadOrder(np, lhs, rhs));

    let modIndex = 0;
    let eslIndex = 0;
    const res = {};
    byLO.forEach((plugin: IPluginCombined) => {
      if (!plugin.enabled && !plugin.isNative) {
        res[plugin.id] = { modIndex: -1 };
      } else if (plugin.isLight) {
        res[plugin.id] = {
          modIndex: 0xFE,
          eslIndex: eslIndex++,
        };
      } else {
        res[plugin.id] = {
          modIndex: modIndex++,
        };
      }
    });
    return res;
  }

  private safeBasename(filePath: string) {
    return filePath !== undefined
      ? path.basename(filePath, GHOST_EXT)
      : '';
  }

  private detailedPlugins(plugins: IPlugins,
                          pluginsLoot: { [pluginId: string]: IPluginLoot },
                          pluginsParsed: { [pluginId: string]: IPluginParsed },
  ): { [id: string]: IPluginCombined } {
    const { loadOrder, userlist } = this.props;

    const pluginIds = Object.keys(plugins ?? {});

    const pluginObjects: IPluginCombined[] = pluginIds.map((pluginId: string) => {
      const userlistEntry =
        (userlist.plugins || []).find(entry => entry.name.toLowerCase() === pluginId);
      const res = {
        id: pluginId,
        modIndex: -1,
        enabled: plugins[pluginId].isNative ? undefined : false,
        cleanliness: [],
        dirtyness: [],
        ...plugins[pluginId],
        ...loadOrder[pluginId],
        ...pluginsLoot[pluginId],
        ...pluginsParsed[pluginId],
        name: this.safeBasename(plugins[pluginId].filePath),
      };

      if ((userlistEntry !== undefined)
        && (userlistEntry.group !== undefined)) {
        res.group = userlistEntry.group;
      }

      return res;
    });

    const modIndices = this.modIndices(pluginObjects);
    const result: { [id: string]: IPluginCombined } = {};
    pluginObjects.forEach((plugin: IPluginCombined) => {
      result[plugin.id] = plugin;
      result[plugin.id].modIndex = modIndices[plugin.id].modIndex;
      result[plugin.id].eslIndex = modIndices[plugin.id].eslIndex;
    });

    return result;
  }

  private applyLoadOrder(loadOrder: { [pluginId: string]: ILoadOrder }) {
    const { pluginsCombined } = this.state;

    const updateSet = {};
    const pluginsFlat = Object.keys(pluginsCombined).map(pluginId => pluginsCombined[pluginId]);
    pluginsFlat.forEach((plugin, idx) => {
      const lo = loadOrder[plugin.id] || {
        enabled: false,
        loadOrder: undefined,
      };
      Object.assign(pluginsFlat[idx], lo);
      updateSet[plugin.id] = {
        enabled: { $set: lo.enabled },
        loadOrder: { $set: lo.loadOrder },
      };
    });
    const modIndices = this.modIndices(pluginsFlat);
    Object.keys(modIndices).forEach(pluginId => {
      updateSet[pluginId].modIndex = { $set: modIndices[pluginId].modIndex };
      updateSet[pluginId].eslIndex = { $set: modIndices[pluginId].eslIndex };
    });

    if (this.mMounted) {
      this.setState(update(this.state, {
        pluginsCombined: updateSet,
      }));
    }
  }

  private eslify(plugin: IPluginCombined, enable: boolean): Promise<void> {
    try {
      const esp = new ESPFile(plugin.filePath);
      esp.setLightFlag(enable);
      plugin.isLight = enable;
      return Promise.resolve();
    } catch (err) {
      return Promise.reject(err);
    }
  }

  private eslifySelected = (pluginIds: string[]) => {
    Promise.map(pluginIds
      .map(pluginId => this.state.pluginsCombined[pluginId])
      .filter(plugin =>
        (plugin !== undefined)
        && plugin.deployed
        && plugin.isValidAsLightMaster
        && !plugin.isLight
        && path.extname(plugin.id) === '.esp')
      , plugin => this.eslify(plugin, true))
    .then(() => {
      this.props.onRefreshPlugins();
    })
    .catch(err => {
      const isUserError = ['EPERM', 'EACCESS'].includes(err.code)
                       || err.message.includes('file not found')
                       || err.message.includes('Access is denied');
      this.context.api.showErrorNotification('Failed to mark plugins as light', err,
        { allowReport: !isUserError });
    });
  }

  private uneslifySelected = (pluginIds: string[]) => {
    Promise.map(pluginIds
      .map(pluginId => this.state.pluginsCombined[pluginId])
      .filter(plugin =>
        (plugin !== undefined)
        && plugin.deployed
        && plugin.isLight
        && path.extname(plugin.id) === '.esp')
      , plugin => this.eslify(plugin, false))
    .then(() => {
      this.props.onRefreshPlugins();
    })
    .catch(err => {
      const isUserError = ['EPERM', 'EACCESS'].includes(err.code)
                       || err.message.includes('file not found')
                       || err.message.includes('Access is denied');
      this.context.api.showErrorNotification('Failed to mark plugins as regular', err,
        { allowReport: !isUserError });
    });
  }

  private applyUserlist(userlist: ILOOTPlugin[], masterlist: ILOOTPlugin[]) {
    const { pluginsCombined, pluginsLoot } = this.state;

    const updateSet = {};
    userlist.forEach(plugin => {
      const pluginId = plugin.name.toLowerCase();
      if (pluginsCombined[pluginId] === undefined) {
        return;
      }

      const pluginML: any = masterlist.find(iter => iter.name.toLowerCase() === pluginId) || {};

      updateSet[pluginId] = {};

      if ((plugin.group || pluginML.group || '') !== (pluginsCombined[pluginId].group || '')) {
        updateSet[pluginId]['group'] = { $set: plugin.group || pluginML.group };
      } else {
        const loot = pluginsLoot[plugin.name];
        if (loot !== undefined) {
          updateSet[pluginId]['group'] = { $set: loot.group };
        }
      }
    });

    if (this.mMounted) {
      this.setState(update(this.state, {
        pluginsCombined: updateSet,
      }));
    }
  }

  private pluginModName = (plugin: IPluginCombined) => {
    if (plugin.modId === undefined) {
      return '';
    }

    const mod = util.getSafe(this.props.mods, [plugin.modId], undefined);
    if (mod === undefined) {
      return '';
    }
    return util.renderModName(mod, { version: false });
  }

  private highlightMod = (evt: React.MouseEvent<any>) => {
    const modId = evt.currentTarget.getAttribute('data-modid');
    this.context.api.events.emit('show-main-page', 'Mods');
    // give it time to transition to the mods page but also this is a workaround
    // for the fact that the mods page might not be mounted yet
    setTimeout(() => {
      this.context.api.events.emit('mods-scroll-to', modId);
      this.context.api.highlightControl(
        `.${(util as any).sanitizeCSSId(modId)} > .cell-name`, 4000);
    }, 200);
  }

  private translateLootMessageType(input: number) {
    return {
      0: 'info',
      1: 'warning',
      2: 'danger',
    }[input];
  }

  private prepareMessage(input: string | Array<{ text: string, language: string }>,
                         plugin: IPluginCombined) {
    const { language } = this.props;

    let text: string;

    if (Array.isArray(input)) {
      let entry = input.find(iter => iter.language === language);
      if (entry === undefined) {
        entry = input.find(iter => iter.language === 'en');
        if (entry === undefined) {
          entry = input[0];
        }
      }
      text = entry.text;
    } else {
      text = input;
    }

    return text.replace(/%1%/g, `"${plugin.name}"`);
  }

  private renderLootMessages(plugin: IPluginCombined) {
    if (plugin?.messages === undefined) {
      return null;
    }

    return (
      <ListGroup className='loot-message-list'>
        {
          plugin.messages.map((msg: Message, idx: number) => (
            <ListGroupItem key={idx}>
              <Alert bsStyle={this.translateLootMessageType(msg.type)}>
              <ReactMarkdown>{this.prepareMessage(msg.content, plugin)}</ReactMarkdown>
              </Alert>
            </ListGroupItem>
          ))
        }
      </ListGroup>
    );
  }

  private sortByLoadOrder = (native: { [id: string]: number },
                             lhs: IPluginCombined,
                             rhs: IPluginCombined) => {
    if (this.installedNative !== undefined) {
      const lhsLO = lhs.isNative
        ? native[lhs.id] : (lhs.loadOrder | 0) + 1000;
      const rhsLO = rhs.isNative
        ? native[rhs.id] : (rhs.loadOrder | 0) + 1000;
      return lhsLO - rhsLO;
    } else {
      return lhs.loadOrder - rhs.loadOrder;
    }
  }

  private setGroup = (plugin: string, group: string) => {
    const { onAddGroup, onAddGroupRule, onSetGroup, masterlist, userlist } = this.props;
    if ((group !== undefined)
      && (masterlist.groups.find(iter => iter.name === group) === undefined)
      && (userlist.groups.find(iter => iter.name === group) === undefined)) {
      onAddGroup(group);
      onAddGroupRule(group, 'default');
    }
    onSetGroup(plugin, group);
  }

  private getCollator(locale: string) {
    if ((this.mCollator === undefined) || (locale !== this.mLang)) {
      this.mLang = locale;
      this.mCollator = new Intl.Collator(locale, { sensitivity: 'base' });
    }
    return this.mCollator;
  }

  private makeAttributes(): Array<types.ITableAttribute<IPluginCombined>> {
    return [
      {
        id: 'name',
        name: 'Name',
        isToggleable: false,
        edit: {},
        isDefaultFilter: true,
        isSortable: true,
        calc: (plugin: IPluginCombined) => plugin.name,
        placement: 'both',
        filter: new TableTextFilter(true),
        sortFunc: (lhs: string, rhs: string, locale: string) =>
          this.getCollator(locale).compare(lhs, rhs),
      },
      {
        id: 'modName',
        name: 'Mod',
        edit: {},
        calc: plugin => this.pluginModName(plugin),
        customRenderer: (plugin: IPluginCombined) => (
          <a data-modid={plugin.modId} onClick={this.highlightMod} >
            {this.pluginModName(plugin)}
          </a>
        ),
        placement: 'both',
        isDefaultVisible: false,
        isSortable: true,
        isToggleable: true,
        isGroupable: true,
        filter: new TableTextFilter(true),
        sortFunc: (lhs: string, rhs: string, locale: string) =>
          this.getCollator(locale).compare(lhs, rhs),
      },
      {
        id: 'category',
        name: 'Mod Category',
        edit: {},
        calc: plugin => util.resolveCategoryName(
          util.getSafe(this.props.mods, [plugin.modId, 'attributes', 'category'], undefined),
          this.context.api.store.getState()),
        placement: 'both',
        isDefaultVisible: false,
        isSortable: true,
        isToggleable: true,
        isGroupable: true,
      },
      {
        id: 'author',
        name: 'Author',
        description: 'Author of the plugin',
        placement: 'detail',
        calc: (plugin: IPluginCombined) => plugin.author,
        edit: {},
      },
      {
        id: 'revision',
        name: 'Revision',
        description: 'Revision of the plugin',
        placement: 'detail',
        calc: (plugin: IPluginCombined) => plugin.revision,
        customRenderer: (plugin: IPluginCombined, detail: boolean, t: TranslationFunction) =>
          plugin.revision < minRevision(this.props.gameMode)
            ? (
              <Alert bsStyle='warning'>
                {t(revisionText(this.props.gameMode), { ns: NAMESPACE })}
              </Alert>
            )
            : null,
        edit: {},
      },
      {
        id: 'version',
        name: 'Version',
        description: 'Plugin version',
        placement: 'detail',
        calc: (plugin: IPluginCombined) => plugin.version,
        edit: {},
      },
      {
        id: 'flags',
        name: 'Flags',
        icon: 'flag',
        isToggleable: true,
        edit: {},
        isSortable: true,
        customRenderer: (plugin: IPluginCombined, detail: boolean, t: TranslationFunction) =>
          (<PluginFlags plugin={plugin} gameMode={this.props.gameMode} t={t} />),
        calc: (plugin: IPluginCombined, t) => getPluginFlags(plugin, t, this.props.gameMode),
        sortFunc: (lhs: string[], rhs: string[]) => lhs.length - rhs.length,
        filter: new PluginFlagsFilter(),
        placement: 'table',
      },
      {
        id: 'tags',
        name: 'Tags',
        icon: 'flag',
        customRenderer: (plugin: IPluginCombined, detail: boolean, t: TranslationFunction) => (
          <div className='plugin-tags'>
          {t('Current')}
          <div>{(plugin.currentTags ?? [])
            .filter(tag => tag !== undefined).map(tag => tag.name).join(', ')}</div>
          {t('Suggested (by LOOT)')}
          <div>{(plugin.suggestedTags ?? [])
            .filter(tag => tag !== undefined).map(tag => tag.name).join(', ')}</div>
          </div>
        ),
        calc: (plugin: IPluginCombined) =>
          [].concat(plugin.currentTags ?? [], plugin.suggestedTags ?? [])
            // TODO: it is unclear to me how there could be an undefined value in this list
            .filter(tag => tag !== undefined)
            .map(tag => tag.name).join(', '),
        placement: 'detail',
        edit: {},
      },
      {
        id: 'flagsDetail',
        name: 'Flags',
        edit: {},
        calc: (plugin: IPluginCombined, t) => getPluginFlags(plugin, t, this.props.gameMode),
        placement: 'detail',
      },
      {
        id: 'loadOrder',
        name: 'Load Order',
        description: 'The order in which plugins are loaded. '
                   + 'Plugins with higher number overwrite those with lower ones.',
        icon: 'sort-numeric-asc',
        isToggleable: true,
        edit: {},
        isSortable: true,
        calc: (plugin: IPluginCombined) => plugin.loadOrder !== -1 ? plugin.loadOrder : '?',
        sortFuncRaw: (lhs, rhs) => this.sortByLoadOrder(this.installedNative, lhs, rhs),
        placement: 'table',
      },
      {
        id: 'modIndex',
        name: 'Mod Index',
        description: 'The Mod index is the first two hexadecimal digits of all ids '
                   + 'this plugin adds to the game',
        icon: 'indent',
        isToggleable: true,
        edit: {},
        isSortable: true,
        calc: (plugin: IPluginCombined) => {
          if (!plugin.enabled && !plugin.isNative) {
            return undefined;
          }
          if (plugin.eslIndex === undefined) {
            return toHex(plugin.modIndex, 2);
          } else {
            return `${toHex(plugin.modIndex, 2)} (${toHex(plugin.eslIndex, 3)})`;
          }
        },
        placement: 'table',
      },
      {
        id: 'group',
        name: 'Group',
        description: 'Group',
        icon: 'sort-down',
        placement: 'table',
        calc: plugin => util.getSafe(plugin, ['group'], '') || 'default',
        customRenderer: (plugin: IPluginCombined) => {
          const grp = util.getSafe(plugin, ['group'], '') || 'default';
          const ulEntry = (this.props.userlist.plugins || []).find(iter =>
            iter.name.toLowerCase() === plugin.id);
          const isCustom = (ulEntry !== undefined) && (ulEntry.group !== undefined);

          return (
            <div className={isCustom ? 'plugin-group-custom' : 'plugin-group-default'}>
              {grp}
            </div>
          );
        },
        edit: {},
        isToggleable: true,
        isDefaultVisible: true,
        isSortable: true,
        isGroupable: true,
        filter: new GroupFilter(),
        sortFunc: (lhs: string, rhs: string, locale: string) =>
          this.getCollator(locale).compare(lhs, rhs),
      },
      {
        id: 'groupdetail',
        name: 'Group',
        description: 'Group',
        placement: 'detail',
        calc: plugin => util.getSafe(plugin, ['group'], '') || '',
        customRenderer: plugins => {
          const { masterlist, userlist } = this.props;
          if (!Array.isArray(plugins)) {
            plugins = (plugins === undefined)
              ? []
              : [plugins];
          }
          return (
            <GroupSelect
              t={this.props.t}
              plugins={plugins}
              masterlist={masterlist}
              userlist={userlist}
              onSetGroup={this.setGroup}
            />
          );
        },
        edit: {},
        supportsMultiple: true,
      },
      {
        id: 'eslify',
        name: 'Light',
        description: 'A light plugin doesn\'t occupy a regular load order slot. '
                    + 'Only some plugins can be made light directly.',
        icon: 'plugin-light',
        placement: 'detail',
        edit: {},
        condition: () => supportsESL(this.props.gameMode),
        calc: (plugin: IPluginCombined) => plugin.isValidAsLightMaster,
        customRenderer: (plugin: IPluginCombined, detail: boolean, t: TranslationFunction) => {
          const ext = path.extname(plugin.name).toLowerCase();
          const canBeConverted = (plugin.isValidAsLightMaster || plugin.isLight)
                              && (ext === '.esp');
          return (
            <Button
              disabled={!canBeConverted}
              title={!plugin.isValidAsLightMaster && !plugin.isLight
                ? t('This plugin can\'t be an esl since it contains form-ids '
                    + 'outside the valid range')
                : ext !== '.esp'
                  ? t('Only plugins with .esp extension can be converted')
                  : plugin.isLight
                    ? t('This plugin already has the light flag set, you can unset it.')
                    : t('This is a regular plugin that could be turned into a light one '
                      + '(also known as an ESPfe). '
                      + 'When you do this, it will no longer take up a spot in the load '
                      + 'order while still working as usual.')}
              onClick={canBeConverted ? () => {
                this.eslify(plugin, !plugin.isLight)
                  .then(() => {
                    this.props.onRefreshPlugins();

                    // TODO: this was previously treated as a manual sort which caused the
                    // autosort setting to be ignored. Was there a reason for that?
                    this.context.api.events.emit('autosort-plugins', false);
                  })
                  .catch(err => {
                    const hasSubstring = (subString) => err.message.indexOf(subString) !== -1;
                    // still haven't figured out why these error messages are localized
                    // but what we actually want to "suppress" reporting on is "Access denied"
                    // and "file not found" given that we can't stop the user or 3rd party
                    // applications from removing the file for whatever reason.
                    this.context.api.showErrorNotification('Failed to convert plugin', err,
                    { allowReport: !hasSubstring('rename:')
                                && !hasSubstring('file not found') });
                  });
              } : nop}
            >
              {plugin.isLight ? 'Mark not light' : 'Mark light'}
            </Button>
            );
        },
      },
      {
        id: 'dependencies',
        name: 'Dependencies',
        description: 'Relations to other plugins',
        icon: 'plug',
        placement: 'table',
        customRenderer: (plugin: IPluginCombined, detail: boolean,
                         t: TFunction, props: types.ICustomProps) =>
          <DependencyIcon plugin={plugin} t={t} onHighlight={props.onHighlight} />,
        calc: () => null,
        isToggleable: true,
        edit: {},
        isSortable: false,
      },
      {
        id: 'masters',
        name: 'Masters',
        edit: {},
        customRenderer: (plugin: IPluginCombined, detail: boolean, t: TranslationFunction) =>
          <MasterList masters={plugin.masterList} />,
        calc: (plugin: IPluginCombined) => plugin.masterList,
        placement: 'detail',
      },
      {
        id: 'cleaning_info',
        name: 'LOOT cleaning info',
        edit: {},
        customRenderer: (plugin: IPluginCombined, detail: boolean, t: TranslationFunction) => (
          <ListGroup className='loot-message-list'>
            {plugin.cleanliness.map((dat, idx) => (
              <ListGroupItem key={idx}>{this.renderCleaningData(dat)}</ListGroupItem>))}
            {plugin.dirtyness.map((dat, idx) => (
              <ListGroupItem key={idx}>{this.renderCleaningData(dat)}</ListGroupItem>))}
          </ListGroup>
        ),
        calc: (plugin: IPluginCombined) => plugin.cleanliness.length + plugin.dirtyness.length,
        placement: 'detail',
      },
      {
        id: 'loot_messages',
        name: 'LOOT Messages (only updates on sort)',
        edit: {},
        customRenderer: (plugin: IPluginCombined) => this.renderLootMessages(plugin),
        calc: (plugin: IPluginCombined) => plugin.messages,
        placement: 'detail',
      },
      {
        id: 'loot_messages_extra',
        name: 'LOOT Messages (inlined)',
        edit: {},
        customRenderer: (plugin: IPluginCombined) => this.renderLootMessages(plugin),
        calc: (plugin: IPluginCombined) => plugin.messages,
        placement: 'inline' as any,
        isToggleable: true,
        isDefaultVisible: false,
      },
    ];
  }
}

const emptyObj = {};
const emptyList = [];
const emptyLOOTList: ILOOTList = {
  globals: [],
  groups: [],
  plugins: [],
};

function mapStateToProps(state: any): IConnectedProps {
  const profile = selectors.activeProfile(state);
  const gameMode = profile !== undefined ? profile.gameId : undefined;
  return {
    gameMode,
    language: state.settings.interface.language,
    plugins: state.session.plugins.pluginList,
    loadOrder: state.loadOrder,
    userlist: state.userlist || emptyLOOTList,
    masterlist: state.masterlist || emptyLOOTList,
    autoSort: state.settings.plugins.autoSort,
    activity: state.session.base.activity['plugins'] ?? emptyList,
    modActivity: state.session.base.activity['mods'],
    deployProgress: util.getSafe(state.session.base,
                                 ['progress', 'profile', 'deploying', 'text'],
                                 undefined),
    needToDeploy: selectors.needToDeploy(state),
    mods: profile !== undefined
      ? ((state as types.IState).persistent.mods[gameMode] || emptyObj)
      : emptyObj,
  };
}

function mapDispatchToProps(dispatch: ThunkDispatch<any, null, Redux.Action>): IActionProps {
  return {
    onSetPluginEnabled: (pluginName: string, enabled: boolean) =>
      dispatch(setPluginEnabled(pluginName, enabled)),
    onSetAutoSortEnabled: (enabled: boolean) =>
      dispatch(setAutoSortEnabled(enabled)),
    onAddGroup: (group: string) => dispatch(addGroup(group)),
    onAddGroupRule: (group: string, reference: string) =>
      dispatch(addGroupRule(group, reference)),
    onSetGroup: (pluginName: string, group: string) =>
      dispatch(setGroup(pluginName, group)),
    onUpdateWarnings: (pluginName: string, notificationId: string, value: boolean) =>
      dispatch(updatePluginWarnings(pluginName, notificationId, value)),
    onUpdatePluginInfo: (info: { [id: string]: IPluginCombined }) =>
      dispatch(setPluginInfo(info)),
  };
}

export default
  withTranslation(['common', NAMESPACE])(
    connect<IConnectedProps, IActionProps, IBaseProps>(mapStateToProps, mapDispatchToProps)(
      PluginList) as any) as React.ComponentClass<IBaseProps>;
