import { IPluginCombined } from '../types/IPlugins';
import { gameSupported, minRevision, supportsESL } from '../util/gameSupport';

import { NAMESPACE } from '../statics';

import { tooltip } from 'vortex-api';

import I18next from 'i18next';
import * as path from 'path';
import * as React from 'react';

type TranslationFunction = typeof I18next.t;

interface IBaseProps {
  plugin: IPluginCombined;
  gameMode: string;
}

type IProps = IBaseProps & {
  t: TranslationFunction;
};

export function getPluginFlags(plugin: IPluginCombined,
                               t: TranslationFunction,
                               gameMode: string): string[] {
  const result: string[] = [];

  if (!gameSupported(gameMode)) {
    return result;
  }

  if (plugin.isMaster) {
    result.push(t('Master'));
  }

  if (supportsESL(gameMode)) {
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

  if (plugin.revision < minRevision(gameMode)) {
    result.push(t('Incompatible'));
  }

  if (plugin.enabled
      && (plugin.warnings !== undefined)
      && (Object.keys(plugin.warnings).find(key => plugin.warnings[key] !== false) !== undefined)) {
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

function warningText(t: TranslationFunction, key: string) {
  return t({
    'missing-master': 'Plugin has missing masters',
    'loot-messages': 'LOOT warnings',
  }[key] || key);
}

const PluginFlags = (props: IProps): JSX.Element => {
  const { plugin, gameMode, t } = props;

  const flags: JSX.Element[] = [];

  if (!gameSupported(gameMode)) {
    return null;
  }

  if (plugin.isMaster) {
    const key = `ico-master-${plugin.id}`;
    flags.push(
      <tooltip.Icon
        id={key}
        key={key}
        name='plugin-master'
        tooltip={t('Master')}
      />);
  }

  if (supportsESL(gameMode)) {
    if (plugin.isLight) {
      const key = `ico-light-${plugin.id}`;
      flags.push(
        <tooltip.Icon
          id={key}
          key={key}
          name='plugin-light'
          tooltip={t('Light')}
        />);
    } else if (plugin.isValidAsLightPlugin
      && (path.extname(plugin.filePath).toLowerCase() === '.esp')) {
      const key = `ico-couldbelight-${plugin.id}`;
      // stroke and hollow props not currently in the api typings atm
      const IconX: any = tooltip.Icon;
      flags.push(
        <IconX
          id={key}
          key={key}
          name='plugin-light'
          tooltip={t('Could be light')}
          stroke={true}
          hollow={true}
        />);
    }
  }

  if (plugin.parseFailed) {
    const key = `ico-parsefailed-${plugin.id}`;
    flags.push(
      <tooltip.Icon
        id={key}
        key={key}
        name='parse-failed'
        tooltip={t('Failed to parse this plugin', { ns: NAMESPACE })}
      />);
  }

  if (plugin.isNative) {
    const key = `ico-native-${plugin.id}`;
    flags.push(
      <tooltip.Icon
        id={key}
        key={key}
        name='plugin-native'
        tooltip={t('Loaded by the engine, can\'t be configured', { ns: NAMESPACE })}
      />);
  }

  if (plugin.loadsArchive) {
    const key = `ico-archive-${plugin.id}`;
    flags.push(
      <tooltip.Icon
        id={key}
        key={key}
        name='archive'
        tooltip={t('Loads an archive')}
      />);
  }

  if (((plugin.currentTags ?? []).length > 0)
      || ((plugin.suggestedTags ?? []).length > 0)) {
    const key = `ico-tags-${plugin.id}`;
    const tags = [].concat(
      (plugin.currentTags ?? []).map(tag => tag.name),
      (plugin.suggestedTags ?? []).map(tag => (tag.isAddition ? '+' : '-') + tag.name),
    );
    flags.push(
      <tooltip.Icon
        id={key}
        key={key}
        name='tags'
        tooltip={tags.join('\n')}
      />);
  }

  if (plugin.enabled) {
    const warningKeys = Object.keys(plugin.warnings);
    const hasWarning = notification => plugin.warnings[notification] !== false;
    if ((warningKeys !== undefined)
        && (warningKeys.length > 0)
        && (warningKeys.find(hasWarning) !== undefined)) {

      const tooltipText = Object.keys(plugin.warnings)
        .filter(iterKey => plugin.warnings[iterKey])
        .map(iterKey => `- ${warningText(t, iterKey)}`)
        .join('\n');

      const key = `ico-notifications-${plugin.id}`;
      flags.push(
        <tooltip.Icon
          id={key}
          key={key}
          name='notifications'
          tooltip={t(tooltipText, { ns: NAMESPACE })}
        />);
    }
  }

  const cleanKey = `ico-clean-${plugin.id}`;
  if ((plugin.dirtyness !== undefined) && (plugin.dirtyness.length > 0)) {
    flags.push(
      <tooltip.Icon
        id={cleanKey}
        key={cleanKey}
        name='plugin-clean'
        tooltip={t('Requires cleaning (LOOT)', { ns: NAMESPACE })}
      />);
  } else if ((plugin.cleanliness !== undefined) && (plugin.cleanliness.length > 0)) {
    flags.push(
      <tooltip.Icon
        id={cleanKey}
        key={cleanKey}
        name='plugin-cleaned'
        tooltip={t('Verified clean (LOOT)', { ns: NAMESPACE })}
      />);
  }

  if (!plugin.deployed) {
    const key = `ico-undeployed-${plugin.id}`;
    flags.push(
      <tooltip.Icon
        id={key}
        key={key}
        name='hide'
        tooltip={t('Not deployed', { ns: NAMESPACE })}
      />);
  }

  if (plugin.revision < minRevision(gameMode)) {
    const key = `ico-revision-${plugin.id}`;
    flags.push(
      <tooltip.Icon
        id={key}
        key={key}
        name='incompatible'
        tooltip={t('Designed for a different game', { ns: NAMESPACE })}
      />);
  }

  if ((plugin.messages || []).length > 0) {
    const hasWarnings = plugin.messages.find(msg => msg.type > 0) !== undefined;

    const key = `ico-messages-${plugin.id}`;
    flags.push(
      <tooltip.Icon
        id={key}
        key={key}
        name='comments'
        tooltip={t('LOOT Messages', { ns: NAMESPACE })}
        className={hasWarnings ? 'loot-messages-warnings' : undefined}
      />);
  }

  return (
    <div>
      {flags}
    </div>
  );
};

export default PluginFlags;
