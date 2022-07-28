/* eslint-disable max-lines-per-function */
import { IPluginCombined } from '../types/IPlugins';
import I18next from 'i18next';
import { gameSupported, supportsESL, minRevision } from '../util/gameSupport';
import path from 'path';
type TranslationFunction = typeof I18next.t;

export function getPluginFlags(plugin: IPluginCombined,
                               t: TranslationFunction,
                               gameId: string): string[] {
  const result: string[] = [];

  if (!gameSupported(gameId)) {
    return result;
  }

  if (plugin.isMaster) {
    result.push(t('Master'));
  }

  if (supportsESL(gameId)) {
    if (plugin.isLight) {
      result.push(t('Light'));
    } else if (plugin.isValidAsLightPlugin
      && (path.extname(plugin.filePath).toLowerCase() === '.esp')) {
      result.push(t('Could be light'));
    } else {
      result.push(t('Not light'));
    }
  }

  if (plugin.parseFailed) {
    result.push(t('Couldn\'t parse'));
  }

  if (plugin.isNative) {
    result.push(t('Native'));
  }

  if (plugin.loadsArchive) {
    result.push(t('Loads Archive'));
  }

  if ((plugin.dirtyness !== undefined) && (plugin.dirtyness.length > 0)) {
    result.push(t('Dirty'));
  }

  if ((plugin.cleanliness !== undefined) && (plugin.cleanliness.length > 0)) {
    result.push(t('Clean'));
  }

  if (plugin.revision < minRevision(gameId)) {
    result.push(t('Incompatible'));
  }

  if (
    plugin.enabled
    && (plugin.warnings !== undefined)
    && (Object.keys(plugin.warnings).find(key => plugin.warnings![key] !== false) !== undefined)
  ) {
    result.push(t('Warnings'));
  }

  if (!plugin.deployed) {
    result.push(t('Not deployed'));
  }

  if ((plugin.messages || []).length > 0) {
    result.push(t('LOOT Messages'));
  }

  return result;
}
