import {PluginFormat} from '../util/PluginPersistor';

import Promise from 'bluebird';
import { app as appIn, remote } from 'electron';
import * as path from 'path';
import * as Redux from 'redux';
import { fs, log, types, util } from 'vortex-api';

const app = appIn || remote.app;

const gameSupportXbox = {
  skyrimse: {
    appDataPath: path.join('Packages', 'BethesdaSoftworks.SkyrimSE-PC_3275kfvn8vcwc',
      'LocalCache', 'Local', 'Skyrim Special Edition MS'),
  },
  fallout4: {
    appDataPath: path.join('Packages', 'BethesdaSoftworks.Fallout4-PC_3275kfvn8vcwc',
      'LocalCache', 'Local', 'Fallout4 MS'),
  },
  oblivion: {
    appDataPath: path.join('Packages', 'BethesdaSoftworks.TESOblivion-PC_3275kfvn8vcwc',
      'LocalCache', 'Local', 'Oblivion'),
  }
}

const gameSupport = {
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
    // skyrim vr does *not* support esls, it's based on an older version of the engine
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
      'ccfsvfo4001-modularmilitarybackpack.esl',
      'ccfsvfo4002-midcenturymodern.esl',
      'ccfrsfo4001-handmadeshotgun.esl',
      'cceejfo4001-decorationpack.esl',
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
  },
};

export function initGameSupport(store: Redux.Store<any>): Promise<void> {
  let res = Promise.resolve();

  const state: types.IState = store.getState();

  const { discovered } = state.settings.gameMode;
  Object.keys(gameSupportXbox).forEach(gameMode => {
    if (discovered[gameMode]?.path !== undefined) {
      // 3275kfvn8vcwc is Bethesda's publisher Id on Xbox game pass; if the path contains
      //  the publisher Id, that's a clear sign that the game has been installed through
      //  the xbox store.
      if (discovered[gameMode].path.toLowerCase().includes('3275kfvn8vcwc')) {
        gameSupport[gameMode].appDataPath = gameSupportXbox[gameMode].appDataPath;
      }
    }
  });

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

  if (discovered['enderalspecialedition']?.path !== undefined) {
    // enderal discovered, may have to update appDataPath
    if (discovered['enderalspecialedition']?.path.toLowerCase().includes('skyrim')) {
      log('info', 'Enderal seems to be installed into the skyrim directory');
      gameSupport['enderalspecialedition'].appDataPath = 'Skyrim Special Edition';
    }
  }

  return res;
}

export function pluginPath(gameMode: string): string {
  const gamePath = gameSupport[gameMode].appDataPath;
  return (process.env.LOCALAPPDATA !== undefined)
    ? path.join(process.env.LOCALAPPDATA, gamePath)
    : path.resolve(app.getPath('appData'), '..', 'Local', gamePath);
}

export function pluginFormat(gameMode: string): PluginFormat {
  return gameSupport[gameMode].pluginTXTFormat;
}

export function supportedGames(): string[] {
  return Object.keys(gameSupport);
}

export function gameSupported(gameMode: string): boolean {
  return gameSupport[gameMode] !== undefined;
}

export function isNativePlugin(gameMode: string, pluginName: string): boolean {
  return gameSupport[gameMode].nativePlugins.indexOf(pluginName.toLowerCase()) !== -1;
}

export function nativePlugins(gameMode: string): string[] {
  return gameSupport[gameMode].nativePlugins;
}

export function supportsESL(gameMode: string): boolean {
  if (gameSupport[gameMode] === undefined) {
    return false;
  }

  return gameSupport[gameMode].supportsESL || false;
}

export function pluginExtensions(gameMode: string): string[] {
  return supportsESL(gameMode)
    ? ['.esm', '.esp', '.esl']
    : ['.esm', '.esp'];
}

export function minRevision(gameMode: string): number {
  return gameSupport[gameMode].minRevision || 0;
}

export function revisionText(gameMode: string): string {
  if (gameMode === 'skyrimse') {
    return 'This plugin was created for the original Skyrim and may be incompatible '
         + 'with Skyrim Special Edition. This can cause unforseen problems during gameplay.';
  } else {
    return 'Plugin not compatible with this game';
  }
}
