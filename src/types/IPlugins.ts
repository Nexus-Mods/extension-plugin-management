import {ILoadOrder} from './ILoadOrder';

import {Message, PluginCleaningData, Tag} from 'loot';

/**
 * generic information about a plugin
 *
 * @export
 * @interface IPlugin
 */
export interface IPlugin {
  /**
   * name of the mod that installed this plugin
   * may be undefined if this plugin was not installed with Vortex
   *
   * @type {string}
   * @memberOf IPlugin
   */
  modName?: string;
  filePath: string;
  /**
   * specifies whether this is a "native" plugin, that is: One
   * where the load order is hard-coded into the game engine so
   * we have no influence on if/when it is loaded.
   *
   * @type {boolean}
   * @memberOf IPlugin
   */
  isNative: boolean;

  /**
   * Specifies whether this plugin has any warning which it
   * wishes to bring to the user's attention. Will add a warning
   * icon under plugin flags.
   */
  warnings?: {[key: string]: boolean};

  /**
   * true if the plugin is currently deployed
   */
  deployed?: boolean;
}

export interface IPluginNotification {
  description?: string,
  notify: boolean,
}

export interface IPlugins { [key: string]: IPlugin; }

/**
 * details retrieved from the content of a plugin through esptk
 *
 * @export
 * @interface IPluginParsed
 */
export interface IPluginParsed {
  isMaster: boolean;
  isLight: boolean;
  parseFailed: boolean;
  masterList: string[];
  author: string;
  description: string;
}

export interface IPluginLoot {
  messages: Message[];
  cleanliness: PluginCleaningData[];
  dirtyness: PluginCleaningData[];
  tags: Tag[];
  group: string;
}

export interface IPluginUserlist {
  group?: string;
}

export interface IPluginsLoot { [fileName: string]: IPluginLoot; }

export type IPluginCombined = IPlugin & ILoadOrder & IPluginParsed
                            & IPluginLoot & IPluginUserlist & {
  /**
   * plugin id, which is the normalized (lower cased) name
   */
  id: string;
  /**
   * file name of the plugin
   *
   * @type {string}
   */
  name: string,
  /**
   * mod index of the plugin as used in form-ids. Please note that this is
   * directly derived from other attributes, namely 'enabled', 'isNative' and
   * 'loadOrder'
   *
   * @type {number}
   */
  modIndex: number,
  eslIndex?: number,
};
