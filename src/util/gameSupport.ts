/* eslint-disable */
import {PluginFormat} from '../util/PluginPersistor';
import memoizeOne from 'memoize-one';

import Promise from 'bluebird';
import * as path from 'path';
import { fs, log, selectors, types, util } from 'vortex-api';

type PluginTXTFormat = 'original' | 'fallout4';

interface IGameSupport {
  appDataPath: string;
  pluginTXTFormat: PluginTXTFormat;
  nativePlugins: string[];
  supportsESL?: boolean | (() => boolean);
  supportsMediumMasters?: boolean | (() => boolean);
  minRevision?: number;
}

const gameSupport = util.makeOverlayableDictionary<string, IGameSupport>({
  skyrim: {
    appDataPath: 'Skyrim',
    pluginTXTFormat: 'original',
    nativePlugins: [
      'skyrim.esm',
      'update.esm',
    ],
  },
  enderal: {
    appDataPath: 'Enderal',
    pluginTXTFormat: 'original',
    nativePlugins: [
      'skyrim.esm',
    ],
  },
  skyrimse: {
    appDataPath: 'Skyrim Special Edition',
    pluginTXTFormat: 'fallout4',
    nativePlugins: [
      'skyrim.esm',
      'update.esm',
      'dawnguard.esm',
      'hearthfires.esm',
      'dragonborn.esm',
      'ccBGSSSE002-ExoticArrows.esl',
      'ccBGSSSE003-Zombies.esl',
      'ccBGSSSE004-RuinsEdge.esl',
      'ccBGSSSE006-StendarsHammer.esl',
      'ccBGSSSE007-Chrysamere.esl',
      'ccBGSSSE010-PetDwarvenArmoredMudcrab.esl',
      'ccBGSSSE014-SpellPack01.esl',
      'ccBGSSSE019-StaffofSheogorath.esl',
      'ccBGSSSE021-LordsMail.esl',
      'ccMTYSSE001-KnightsoftheNine.esl',
      'ccQDRSSE001-SurvivalMode.esl',
      'ccTWBSSE001-PuzzleDungeon.esm',
      'ccEEJSSE001-Hstead.esl',
    ],
    supportsESL: true,
    minRevision: 44,
  },
  skyrimvr: {
    appDataPath: 'Skyrim VR',
    pluginTXTFormat: 'fallout4',
    nativePlugins: [
      'skyrim.esm',
      'update.esm',
      'dawnguard.esm',
      'hearthfires.esm',
      'dragonborn.esm',
      'skyrimvr.esm',
    ],
    // skyrim vr does *not* support esls by default. However, it is possible to enable them
    //  with a mod https://www.nexusmods.com/skyrimspecialedition/mods/106712
    supportsESL: false,
  },
  fallout3: {
    appDataPath: 'Fallout3',
    pluginTXTFormat: 'original',
    nativePlugins: [
      'fallout3.esm',
    ],
  },
  fallout4: {
    appDataPath: 'Fallout4',
    pluginTXTFormat: 'fallout4',
    nativePlugins: [
      'fallout4.esm',
      'dlcrobot.esm',
      'dlcworkshop01.esm',
      'dlccoast.esm',
      'dlcworkshop02.esm',
      'dlcworkshop03.esm',
      'dlcnukaworld.esm',
      'dlcultrahighresolution.esm',
      'ccbgsfo4001-pipboy(black).esl',
      'ccbgsfo4002-pipboy(blue).esl',
      'ccbgsfo4003-pipboy(camo01).esl',
      'ccbgsfo4004-pipboy(camo02).esl',
      'ccbgsfo4006-pipboy(chrome).esl',
      'ccbgsfo4012-pipboy(red).esl',
      'ccbgsfo4014-pipboy(white).esl',
      'ccbgsfo4016-prey.esl',
      'ccbgsfo4017-mauler.esl',
      'ccbgsfo4018-gaussrifleprototype.esl',
      'ccbgsfo4019-chinesestealtharmor.esl',
      'ccbgsfo4020-powerarmorskin(black).esl',
      'ccbgsfo4022-powerarmorskin(camo01).esl',
      'ccbgsfo4023-powerarmorskin(camo02).esl',
      'ccbgsfo4025-powerarmorskin(chrome).esl',
      'ccbgsfo4038-horsearmor.esl',
      'ccbgsfo4039-tunnelsnakes.esl',
      'ccbgsfo4041-doommarinearmor.esl',
      'ccbgsfo4042-bfg.esl',
      'ccbgsfo4043-doomchainsaw.esl',
      'ccbgsfo4044-hellfirepowerarmor.esl',
      'ccbgsfo4046-tescan.esl',
      'ccbgsfo4096-as_enclave.esl',
      'ccbgsfo4110-ws_enclave.esl',
      'ccbgsfo4115-x02.esl',
      'ccbgsfo4116-heavyflamer.esl',
      'cceejfo4001-decorationpack.esl',
      'ccfrsfo4001-handmadeshotgun.esl',
      'ccfsvfo4001-modularmilitarybackpack.esl',
      'ccfsvfo4002-midcenturymodern.esl',
      'ccfsvfo4007-halloween.esl',
      'ccotmfo4001-remnants.esl',
      'ccsbjfo4003-grenade.esl',
    ],
    supportsESL: true,
  },
  fallout4vr: {
    appDataPath: 'Fallout4VR',
    pluginTXTFormat: 'fallout4',
    nativePlugins: [
      'fallout4.esm',
      'fallout4_vr.esm',
    ],
  },
  falloutnv: {
    appDataPath: 'falloutnv',
    pluginTXTFormat: 'original',
    nativePlugins: [
      'falloutnv.esm',
    ],
  },
  starfield: {
    appDataPath: 'Starfield',
    pluginTXTFormat: 'fallout4',
    nativePlugins: [
      'starfield.esm',
      'blueprintships-starfield.esm',
      'sfbgs003.esm',
      'sfbgs006.esm',
      'sfbgs007.esm',
      'sfbgs008.esm',
    ],
    supportsESL: true,
    supportsMediumMasters: true,
  },
  oblivion: {
    appDataPath: 'oblivion',
    pluginTXTFormat: 'original',
    nativePlugins: [
      'oblivion.esm',
    ],
  },
  enderalspecialedition: {
    appDataPath: 'Enderal Special Edition',
    pluginTXTFormat: 'fallout4',
    nativePlugins: [
      'skyrim.esm',
      'update.esm',
      'dawnguard.esm',
      'hearthfires.esm',
      'dragonborn.esm',
    ],
    supportsESL: true,
  },
}, {
  xbox: {
    skyrimse: {
      appDataPath: 'Skyrim Special Edition MS',
    },
    fallout4: {
      appDataPath: 'Fallout4 MS',
    },
    oblivion: {
      appDataPath: 'Oblivion',
    },
  },
  gog: {
    skyrimse: {
      appDataPath: 'Skyrim Special Edition GOG',
    },
    enderalspecialedition: {
      appDataPath: 'Enderal Special Edition GOG',
    }
  },
  epic: {
    skyrimse: {
      appDataPath: 'Skyrim Special Edition EPIC',
    },
    fallout4: {
      appDataPath: 'Fallout4 EPIC',
    },
  },
  enderalseOverlay: {
    enderalspecialedition: {
      appDataPath: 'Skyrim Special Edition',
    },
  },
}, (gameId: string) => {
  const discovery = discoveryForGame(gameId);
  if ((discovery?.path !== undefined)
      && (gameId === 'enderalspecialedition')
      && discovery.path.includes('skyrim')) {
    return 'enderalseOverlay';
  }
  else {
    return discovery?.store;
  }
});

let discoveryForGame: (gameId: string) => types.IDiscoveryResult = () => undefined;

export function initGameSupport(api: types.IExtensionApi): Promise<void> {
  let res = Promise.resolve();
  discoveryForGame = (gameId: string) => selectors.discoveryByGame(api.store.getState(), gameId);

  const state: types.IState = api.store.getState();

  const { discovered } = state.settings.gameMode;

  if (discovered['skyrimse']?.path !== undefined) {
    const skyrimsecc = new Set(gameSupport['skyrimse'].nativePlugins);
    res = res
      .then(() => fs.readFileAsync(path.join(discovered['skyrimse'].path, 'Skyrim.ccc'))
        .then(data => data.toString().split('\r\n').filter(plugin => plugin !== '').forEach(
          plugin => skyrimsecc.add(plugin.toLowerCase())))
        .catch(err => {
          log('info', 'failed to read Skyrim.ccc', err.message);
        })
        .then(() => {
          gameSupport['skyrimse'].nativePlugins = Array.from(skyrimsecc);
        }));
  }
  if (discovered['fallout4']?.path !== undefined) {
    const fallout4cc = new Set(gameSupport['fallout4'].nativePlugins);
    res = res
      .then(() => fs.readFileAsync(path.join(discovered['fallout4'].path, 'Fallout4.ccc'))
        .then(data => data.toString().split('\r\n').filter(plugin => plugin !== '').forEach(
          plugin => fallout4cc.add(plugin.toLowerCase())))
        .catch(err => {
          log('info', 'failed to read Fallout4.ccc', err.message);
        })
        .then(() => {
          gameSupport['fallout4'].nativePlugins = Array.from(fallout4cc);
        }));
  }

  if (discovered['skyrimvr']?.path !== undefined) {
    const game = selectors.gameById(state, 'skyrimvr');
    if (game?.details?.supportsESL !== undefined) {
      gameSupport['skyrimvr'].supportsESL = game.details.supportsESL;
    }
  }

  return res;
}

export function pluginPath(gameMode: string): string {
  const gamePath = gameSupport.get(gameMode, 'appDataPath');

  return (process.env.LOCALAPPDATA !== undefined)
    ? path.join(process.env.LOCALAPPDATA, gamePath)
    : path.resolve(util.getVortexPath('appData'), '..', 'Local', gamePath);
}

export function pluginFormat(gameMode: string): PluginFormat {
  return gameSupport.get(gameMode, 'pluginTXTFormat');
}

export function supportedGames(): string[] {
  return Object.keys(gameSupport);
}

export function gameSupported(gameMode: string): boolean {
  return gameSupport.has(gameMode);
}

export function isNativePlugin(gameMode: string, pluginName: string): boolean {
  return gameSupport.get(gameMode, 'nativePlugins').includes(pluginName.toLowerCase());
}

export function nativePlugins(gameMode: string): string[] {
  return gameSupport.get(gameMode, 'nativePlugins');
}

export const supportsESL = memoizeOne((gameMode: string): boolean => {
  if (!gameSupport.has(gameMode)) {
    return false;
  }
  const supportsESL = gameSupport.get(gameMode, 'supportsESL') ?? false;
  if (typeof supportsESL === 'function') {
    return supportsESL();
  }
  return supportsESL;
});

export function pluginExtensions(gameMode: string): string[] {
  return supportsESL(gameMode)
    ? ['.esm', '.esp', '.esl']
    : ['.esm', '.esp'];
}

export function minRevision(gameMode: string): number {
  return gameSupport.get(gameMode, 'minRevision') ?? 0;
}

export function revisionText(gameMode: string): string {
  if (gameMode === 'skyrimse') {
    return 'This plugin was created for the original Skyrim and may be incompatible '
         + 'with Skyrim Special Edition. This can cause unforseen problems during gameplay.';
  } else {
    return 'Plugin not compatible with this game';
  }
}
