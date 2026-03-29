import { rebuild } from '@electron/rebuild';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const electronVersion = require('electron/package.json').version;

await rebuild({
  buildPath: process.cwd(),
  electronVersion,
  force: true,
});

console.log('Rebuild complete for Electron', electronVersion);
