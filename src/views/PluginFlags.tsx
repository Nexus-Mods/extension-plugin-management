import { IPluginCombined } from '../types/IPlugins';

import { tooltip } from 'vortex-api';

import * as I18next from 'i18next';
import * as React from 'react';

interface IBaseProps {
  plugin: IPluginCombined;
}

type IProps = IBaseProps & {
  t: I18next.TranslationFunction;
};

export function getPluginFlags(plugin: IPluginCombined, t: I18next.TranslationFunction): string[] {
  const result: string[] = [];

  if (plugin.isMaster) {
    result.push(t('Master'));
  }

  if (plugin.isLight) {
    result.push(t('Light'));
  }

  if (plugin.parseFailed) {
    result.push(t('Couldn\'t parse'));
  }

  if (plugin.isNative) {
    result.push(t('Native'));
  }

  if ((plugin.dirtyness !== undefined) && (plugin.dirtyness.length > 0)) {
    result.push(t('Dirty'));
  }

  if ((plugin.cleanliness !== undefined) && (plugin.cleanliness.length > 0)) {
    result.push(t('Clean'));
  }

  if (plugin.enabled
      && (plugin.warnings !== undefined)
      && (Object.keys(plugin.warnings).find(key => plugin.warnings[key] !== false) !== undefined)) {
    result.push(t('Warnings'));
  }

  if (!plugin.deployed) {
    result.push(t('Not deployed'));
  }

  return result;
}

function warningText(t: I18next.TranslationFunction, key: string) {
  return t({
    'missing-master': 'Plugin has missing masters',
    'loot-messages': 'LOOT warnings',
  }[key] || key);
}

const PluginFlags = (props: IProps): JSX.Element => {
  const { plugin, t } = props;

  const flags: JSX.Element[] = [];

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

  if (plugin.isLight) {
    const key = `ico-light-${plugin.id}`;
    flags.push(
      <tooltip.Icon
        id={key}
        key={key}
        name='plugin-light'
        tooltip={t('Light')}
      />);
  }

  if (plugin.parseFailed) {
    const key = `ico-parsefailed-${plugin.id}`;
    flags.push(
      <tooltip.Icon
        id={key}
        key={key}
        name='parse-failed'
        tooltip={t('Failed to parse this plugin', { ns: 'gamebryo-plugin' })}
      />);
  }

  if (plugin.isNative) {
    const key = `ico-native-${plugin.id}`;
    flags.push(
      <tooltip.Icon
        id={key}
        key={key}
        name='plugin-native'
        tooltip={t('Loaded by the engine, can\'t be configured', { ns: 'gamebryo-plugin' })}
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
          tooltip={t(tooltipText, { ns: 'gamebryo-plugin' })}
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
        tooltip={t('Requires cleaning (LOOT)', { ns: 'gamebryo-plugin' })}
      />);
  } else if ((plugin.cleanliness !== undefined) && (plugin.cleanliness.length > 0)) {
    flags.push(
      <tooltip.Icon
        id={cleanKey}
        key={cleanKey}
        name='plugin-cleaned'
        tooltip={t('Verified clean (LOOT)', { ns: 'gamebryo-plugin' })}
      />);
  }

  if (!plugin.deployed) {
    const key = `ico-undeployed-${plugin.id}`;
    flags.push(
      <tooltip.Icon
        id={key}
        key={key}
        name='hide'
        tooltip={t('Not deployed', { ns: 'gamebryo-plugin' })}
      />);
  }

  return (
    <div>
      {flags}
    </div>
  );
};

export default PluginFlags;
