import { setPluginEnabled } from '../actions/loadOrder';
import { updatePluginWarnings } from '../actions/plugins';
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

import DependencyIcon from './DependencyIcon';
import MasterList from './MasterList';
import PluginFlags, { getPluginFlags } from './PluginFlags';
import PluginFlagsFilter from './PluginFlagsFilter';
import PluginStatusFilter from './PluginStatusFilter';

import * as Promise from 'bluebird';
import ESPFile from 'esptk';
import * as I18next from 'i18next';
import update from 'immutability-helper';
import { Message, PluginCleaningData } from 'loot';
import * as path from 'path';
import * as React from 'react';
import { Alert, Button, ListGroup, ListGroupItem, Panel } from 'react-bootstrap';
import { translate } from 'react-i18next';
import * as ReactMarkdown from 'react-markdown';
import { connect } from 'react-redux';
import { Creatable } from 'react-select';
import * as Redux from 'redux';
import { ThunkDispatch } from 'redux-thunk';
import {ComponentEx, FlexLayout, IconBar, ITableRowAction,
  log, MainPage, selectors, Spinner,
  Table, TableTextFilter, ToolbarIcon, types, Usage, util, More, Icon,
} from 'vortex-api';

const CLEANING_GUIDE_LINK = 'https://tes5edit.github.io/docs/5-mod-cleaning-and-error-checking.html';

interface IBaseProps {
  nativePlugins: string[];
}

interface IConnectedProps {
  gameMode: string;
  plugins: IPlugins;
  loadOrder: { [name: string]: ILoadOrder };
  autoSort: boolean;
  activity: string[];
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
  t: I18next.TranslationFunction;
  plugins: IPluginCombined[];
  userlist: ILOOTList;
  masterlist: ILOOTList;
  onSetGroup: (pluginId: string, group: string) => void;
}

class GroupSelect extends React.PureComponent<IGroupSelectProps, {}> {
  public render(): JSX.Element {
    const { t, plugins, masterlist, userlist } = this.props;

    let group = util.getSafe(plugins, [0, 'group'], '');
    if (plugins.find(plugin => plugin.group !== group) !== undefined) {
      group = '';
    }

    const options = [].concat(
      masterlist.groups.map(iter => ({ label: iter.name, value: iter.name })),
      userlist.groups.map(iter => ({ label: iter.name, value: iter.name })),
    );

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

class PluginList extends ComponentEx<IProps, IComponentState> {
  private staticButtons: types.IActionDefinition[];
  private pluginEnabledAttribute: types.ITableAttribute;
  private actions: ITableRowAction[];
  private mLang: string;
  private mCollator: Intl.Collator;
  private mMounted: boolean = false;
  private mCachedGameMode: string;

  private installedNative: { [name: string]: number } = {};

  private pluginAttributes: Array<types.ITableAttribute<IPluginCombined>> = [
    {
      id: 'name',
      name: 'Name',
      isToggleable: false,
      edit: {},
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
        <a data-modid={plugin.modName} onClick={this.highlightMod} >{this.pluginModName(plugin)}</a>
        ),
      placement: 'both',
      isDefaultVisible: false,
      isSortable: true,
      isToggleable: true,
      filter: new TableTextFilter(true),
      sortFunc: (lhs: string, rhs: string, locale: string) =>
        this.getCollator(locale).compare(lhs, rhs),
    },
    {
      id: 'category',
      name: 'Mod Category',
      edit: {},
      calc: plugin => util.resolveCategoryName(
        util.getSafe(this.props.mods, [plugin.modName, 'attributes', 'category'], undefined),
        this.context.api.store.getState()),
      placement: 'both',
      isDefaultVisible: false,
      isSortable: true,
      isToggleable: true,
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
      id: 'flags',
      name: 'Flags',
      icon: 'flag',
      isToggleable: true,
      edit: {},
      isSortable: true,
      customRenderer: (plugin: IPluginCombined, detail: boolean, t: I18next.TranslationFunction) =>
        (<PluginFlags plugin={plugin} t={t} />),
      calc: (plugin: IPluginCombined, t) => getPluginFlags(plugin, t),
      sortFunc: (lhs: string[], rhs: string[]) => lhs.length - rhs.length,
      filter: new PluginFlagsFilter(),
      placement: 'table',
    },
    {
      id: 'flagsDetail',
      name: 'Flags',
      edit: {},
      calc: (plugin: IPluginCombined, t) => getPluginFlags(plugin, t),
      placement: 'detail',
    },
    {
      id: 'loadOrder',
      name: 'Load Order',
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
      id: 'dependencies',
      name: 'Dependencies',
      description: 'Relations to other plugins',
      icon: 'plug',
      placement: 'table',
      customRenderer: (plugin: IPluginCombined, detail: boolean,
                       t: I18next.TranslationFunction, props: types.ICustomProps) =>
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
      customRenderer: (plugin: IPluginCombined, detail: boolean, t: I18next.TranslationFunction) =>
        <MasterList masters={plugin.masterList} />,
      calc: (plugin: IPluginCombined) => plugin.masterList,
      placement: 'detail',
    },
    {
      id: 'cleaning_info',
      name: 'LOOT cleaning info',
      edit: {},
      customRenderer: (plugin: IPluginCombined, detail: boolean, t: I18next.TranslationFunction) => (
        <ListGroup className='loot-message-list'>
          {plugin.cleanliness.map((dat, idx) => (<ListGroupItem key={idx}>{this.renderCleaningData(dat)}</ListGroupItem>))}
          {plugin.dirtyness.map((dat, idx) => (<ListGroupItem key={idx}>{this.renderCleaningData(dat)}</ListGroupItem>))}
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
  ];

  constructor(props) {
    super(props);
    this.state = {
      selectedPlugin: undefined,
      pluginsParsed: {},
      pluginsLoot: {},
      pluginsCombined: {},
    };

    const { t, onSetAutoSortEnabled } = props;

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
    ];

    this.pluginEnabledAttribute = {
      id: 'enabled',
      name: 'Status',
      description: 'Is plugin enabled in current profile',
      icon: 'check-o',
      calc: (plugin: IPluginCombined) => plugin.isNative
        ? undefined
        : plugin.enabled === true ? 'Enabled' : 'Disabled',
      placement: 'table',
      isToggleable: false,
      edit: {
        inline: true,
        choices: () => [
          { key: 'enabled', text: 'Enabled', icon: 'toggle-enabled' },
          { key: 'disabled', text: 'Disabled', icon: 'toggle-disabled' },
        ],
        onChangeValue: (plugin: IPluginCombined, value: any) => {
          if (plugin.isNative) {
            // safeguard so we don't accidentally disable a native plugin
            return;
          }

          if (value === undefined) {
            // toggle
            this.props.onSetPluginEnabled(plugin.id, !plugin.enabled);
          } else {
            this.props.onSetPluginEnabled(plugin.id, value === 'enabled');
          }
        },
      },
      isSortable: false,
      filter: new PluginStatusFilter(),
    };

    this.staticButtons = [
      {
        component: ToolbarIcon,
        props: () => {
          const { autoSort } = this.props;
          return {
            id: 'btn-autosort-loot',
            key: 'btn-autosort-loot',
            icon: autoSort ? 'locked' : 'unlocked',
            text: autoSort ? t('Autosort Enabled', { ns: 'gamebryo-plugin' })
              : t('Autosort Disabled', { ns: 'gamebryo-plugin' }),
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
            text: t('Sort Now', { ns: 'gamebryo-plugin' }),
            onClick: () => this.context.api.events.emit('autosort-plugins', true, () => {
              this.updatePlugins(this.props.plugins);
            }),
          };
        },
      },
    ];
  }

  public emptyPluginParsed(): { [plugin: string]: IPluginParsed } {
    return Object.keys(this.props.plugins).reduce((prev, key) => {
      prev[key] = {
        isMaster: false,
        isLight: false,
        parseFailed: false,
        masterList: [],
        author: '',
        description: '',
      };
      return prev;
    }, {});
  }

  public emptyPluginLOOT(): { [plugin: string]: IPluginLoot } {
    return Object.keys(this.props.plugins).reduce((prev, key) => {
      prev[key] = {
        messages: [],
        cleanliness: [],
        dirtyness: [],
        group: '',
        tags: [],
      };
      return prev;
    }, {});
  }

  public componentWillMount() {
    const { plugins } = this.props;
    const parsed = this.emptyPluginParsed();
    const loot = this.emptyPluginLOOT();
    const combined = this.detailedPlugins(plugins, loot, parsed);
    this.mCachedGameMode = this.props.gameMode;
    this.setState(update(this.state, {
      pluginsParsed: { $set: parsed },
      pluginsLoot: { $set: loot },
      pluginsCombined: { $set: combined },
    }));

    // Will verify plugins for warning/error loot messages
    //  and notify the user if any are found.
    this.updatePlugins(this.props.plugins)
      .then(() => this.applyUserlist(this.props.userlist.plugins || []));
  }

  public componentDidMount() {
    this.mMounted = true;
  }

  public componentWillUnmount() {
    this.mMounted = true;
  }

  public componentWillReceiveProps(nextProps: IProps) {
    if (this.props.plugins !== nextProps.plugins) {
      this.updatePlugins(nextProps.plugins);
    }

    if (this.props.loadOrder !== nextProps.loadOrder) {
      this.applyLoadOrder(nextProps.loadOrder);
    }

    if (this.props.userlist !== nextProps.userlist) {
      this.applyUserlist(nextProps.userlist.plugins || []);
    }
  }

  public render(): JSX.Element {
    const { t, deployProgress, gameMode, needToDeploy } = this.props;
    const { pluginsCombined } = this.state;

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
                  {(this.mCachedGameMode === gameMode) && (deployProgress === undefined) ? (
                    <Table
                      tableId='gamebryo-plugins'
                      actions={this.actions}
                      staticElements={[this.pluginEnabledAttribute, ...this.pluginAttributes]}
                      data={pluginsCombined}
                    />
                  ) : (
                    <div className='plugin-list-loading'>
                      <Spinner />
                    </div>
                  )}
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

  private issueCount(dat: PluginCleaningData) {
    return dat['itmCount'] + dat.deletedNavmeshCount + dat.deletedReferenceCount;
  }

  private renderCleaningData(dat: PluginCleaningData) {
    const { t } = this.props;
    const things = [];
    if (dat['itmCount'] > 0) {
      things.push(t('{{count}} ITM record', { ns: 'gamebryo-plugin', count: dat['itmCount'] }));
    }
    if (dat.deletedNavmeshCount > 0) {
      things.push(t('{{count}} deleted navmesh', { ns: 'gamebryo-plugin', count: dat.deletedNavmeshCount }));
    }
    if (dat.deletedReferenceCount > 0) {
      things.push(t('{{count}} deleted reference', { ns: 'gamebryo-plugin', count: dat.deletedReferenceCount }));
    }
    const clean = things.length === 0;
    if (clean) {
      things.push(t('nothing! This plugin is clean'));
    }
    const message = t('{{tool}} found {{things}}.', {
          replace: {
            tool: dat.cleaningUtility,
            things: things.join(t(' and ')),
          }
        });
    return (
      <Alert bsStyle={clean ? 'success' : 'warning'}>
        <ReactMarkdown source={message}/>
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

  private isMaster(filePath: string, flag: boolean) {
    return flag
      || ((['fallout4', 'skyrimse'].indexOf(this.props.gameMode) !== -1)
        && ['.esm', '.esl'].indexOf(path.extname(filePath).toLowerCase()) !== -1);
  }

  private isLight(filePath: string, flag: boolean) {
    return (['fallout4', 'skyrimse'].indexOf(this.props.gameMode) !== -1)
      && (flag || (path.extname(filePath).toLowerCase() === '.esl'));
  }

  private updatePlugins(pluginsIn: IPlugins) {
    const pluginNames: string[] = Object.keys(pluginsIn);

    const pluginsParsed: { [pluginName: string]: IPluginParsed } = {};
    let pluginsLoot;

    return Promise.each(pluginNames, (pluginName: string) =>
      new Promise((resolve, reject) => {
        try {
          const esp = new ESPFile(pluginsIn[pluginName].filePath);
          pluginsParsed[pluginName] = {
            isMaster: this.isMaster(pluginsIn[pluginName].filePath, esp.isMaster),
            isLight: this.isLight(pluginsIn[pluginName].filePath, esp.isLight),
            parseFailed: false,
            description: esp.description,
            author: esp.author,
            masterList: esp.masterList,
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
          };
        }
        resolve();
      }))
      .then(() => new Promise((resolve, reject) => {
        this.context.api.events.emit('plugin-details',
          pluginNames, (resolved: { [name: string]: IPluginLoot }) => {
            const { onUpdateWarnings, plugins } = this.props;
            pluginsLoot = resolved;

            Object.keys(pluginsLoot).forEach(name => {
              const oldWarn = util.getSafe(plugins, [name, 'warnings', 'loot-messages'], false);
              const newWarn = pluginsLoot[name].messages
                .find(message =>
                  this.translateLootMessageType(message.type) !== 'info') !== undefined;
              if (oldWarn !== newWarn) {
                onUpdateWarnings(name, 'loot-messages', newWarn);
              }
            });

            resolve();
          });
      }))
      .then(() => {
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
      });
  }

  private enableSelected = (pluginIds: string[]) => {
    const { loadOrder, onSetPluginEnabled, plugins } = this.props;

    pluginIds.forEach((key: string) => {
      if ((plugins[key] === undefined) || plugins[key].isNative) {
        return;
      }
      if (!util.getSafe(loadOrder, [key, 'enabled'], false)) {
        onSetPluginEnabled(key, true);
      }
    });
  }

  private disableSelected = (pluginIds: string[]) => {
    const { loadOrder, onSetPluginEnabled, plugins } = this.props;

    pluginIds.forEach((key: string) => {
      if ((plugins[key] === undefined) || plugins[key].isNative) {
        return;
      }
      if (util.getSafe<boolean>(loadOrder, [key, 'enabled'], false)) {
        onSetPluginEnabled(key, false);
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
      ? path.basename(filePath)
      : '';
  }

  private detailedPlugins(plugins: IPlugins,
                          pluginsLoot: { [pluginId: string]: IPluginLoot },
                          pluginsParsed: { [pluginId: string]: IPluginParsed },
  ): { [id: string]: IPluginCombined } {
    const { loadOrder, userlist } = this.props;

    const pluginIds = Object.keys(plugins);

    const pluginObjects: IPluginCombined[] = pluginIds.map((pluginId: string) => {
      const userlistEntry =
        (userlist.plugins || []).find(entry => entry.name.toLowerCase() === pluginId);
      const res = {
        id: pluginId,
        name: this.safeBasename(plugins[pluginId].filePath),
        modIndex: -1,
        enabled: plugins[pluginId].isNative ? undefined : false,
        ...plugins[pluginId],
        ...loadOrder[pluginId],
        ...pluginsLoot[pluginId],
        ...pluginsParsed[pluginId],
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

  private applyUserlist(userlist: ILOOTPlugin[]) {
    const { pluginsCombined, pluginsLoot } = this.state;

    const updateSet = {};
    userlist.forEach(plugin => {
      const pluginId = plugin.name.toLowerCase();
      if (pluginsCombined[pluginId] === undefined) {
        return;
      }

      updateSet[pluginId] = {};

      if (plugin.group !== undefined) {
        updateSet[pluginId]['group'] = { $set: plugin.group };
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
    if (plugin.modName === undefined) {
      return '';
    }

    const mod = util.getSafe(this.props.mods, [plugin.modName], undefined);
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
        `#${(util as any).sanitizeCSSId(modId)} > .cell-name`, 4000);
    }, 200);
  }

  private translateLootMessageType(input: number) {
    return {
      0: 'info',
      1: 'warning',
      2: 'danger',
    }[input];
  }

  private prepareMessage(input: any, plugin: IPluginCombined) {
    return input.replace(/%1%/g, `"${plugin.name}"`);
  }

  private renderLootMessages(plugin: IPluginCombined) {
    if (plugin.messages === undefined) {
      return null;
    }

    return (
      <ListGroup className='loot-message-list'>
        {
          plugin.messages.map((msg: Message, idx: number) => (
            <ListGroupItem key={idx}>
              <Alert bsStyle={this.translateLootMessageType(msg.type)}>
              <ReactMarkdown source={this.prepareMessage(msg.value, plugin)} />
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
}

const emptyObj = {};
const emptyList: ILOOTList = {
  globals: [],
  groups: [],
  plugins: [],
};

function mapStateToProps(state: any): IConnectedProps {
  const profile = selectors.activeProfile(state);
  const gameMode = profile !== undefined ? profile.gameId : undefined;
  return {
    gameMode,
    plugins: state.session.plugins.pluginList,
    loadOrder: state.loadOrder,
    userlist: state.userlist || emptyList,
    masterlist: state.masterlist || emptyList,
    autoSort: state.settings.plugins.autoSort,
    activity: state.session.base.activity['plugins'],
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
  };
}

export default
  translate(['common', 'gamebryo-plugin'], { wait: false })(
    connect<IConnectedProps, IActionProps, IBaseProps>(mapStateToProps, mapDispatchToProps)(
      PluginList)) as React.ComponentClass<IBaseProps>;
