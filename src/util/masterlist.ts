import * as path from 'path';
import { fs, util } from 'vortex-api';

const LOOT_LIST_REVISION = 'v0.26';

// TODO: this is for transitioning from loot 0.17 -> 0.18, remove it at some point
async function tryRemoveDotGit(localPath: string) {
  try {
    const gitDir = path.join(path.dirname(localPath), '.git');
    await fs.statAsync(gitDir);
    await fs.removeAsync(gitDir);
  } catch (err) {
    // ignore, this is fine
  }
}

export async function downloadMasterlist(gameId: string, localPath: string) {
  await tryRemoveDotGit(localPath);
  const buf = await util.rawRequest(
    `https://raw.githubusercontent.com/loot/${gameId}/${LOOT_LIST_REVISION}/masterlist.yaml`);
  await fs.ensureDirWritableAsync(path.dirname(localPath));
  await fs.writeFileAsync(localPath, buf);
}

export async function downloadPrelude(localPath: string) {
  await tryRemoveDotGit(localPath);
  const buf = await util.rawRequest(
    `https://raw.githubusercontent.com/loot/prelude/${LOOT_LIST_REVISION}/prelude.yaml`);
  await fs.ensureDirWritableAsync(path.dirname(localPath));
  await fs.writeFileAsync(localPath, buf);
}

export async function masterlistExists(gameId: string) {
  const localPath = masterlistFilePath(gameId);
  try {
    await fs.statAsync(localPath);
    return true;
  } catch (err) {
    return false;
  }
}

export function masterlistFilePath(gameMode: string) {
  return path.join(util.getVortexPath('userData'), gameMode, 'masterlist', 'masterlist.yaml');
}
