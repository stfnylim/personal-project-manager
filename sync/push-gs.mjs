#!/usr/bin/env node
/**
 * push-gs — deploys appsscript/Code.gs to an instance's Apps Script project via clasp,
 * with that instance's SECRET/READ_TOKEN injected from its config at push time
 * (the repo copy only ever holds placeholders). Updates the EXISTING deployment,
 * so the /exec URL never changes.
 *
 * One-time prerequisites (per machine):
 *   1. Enable the Apps Script API: https://script.google.com/home/usersettings
 *   2. npx @google/clasp login        (browser OAuth as the sheet's owner)
 *   3. Add "scriptId" to the instance config (Apps Script editor > Project Settings).
 *
 * Usage:
 *   node sync/push-gs.mjs --config config.life.json
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const argv = process.argv.slice(2);
const configArg = argv.includes('--config') ? argv[argv.indexOf('--config') + 1] : null;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = resolve(configArg || join(repoRoot, 'config.work.json'));

const fail = (msg) => {
  console.error(`push-gs: ${msg}`);
  process.exit(1);
};

const config = JSON.parse(readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
for (const key of ['webhookUrl', 'secret', 'readToken', 'scriptId']) {
  if (!config[key]) fail(`config missing "${key}"${key === 'scriptId' ? ' — copy it from Apps Script editor > Project Settings' : ''}`);
}
const depMatch = config.webhookUrl.match(/\/macros\/s\/([^/]+)\/exec/);
if (!depMatch) fail(`cannot extract deployment id from webhookUrl: ${config.webhookUrl}`);
const deploymentId = depMatch[1];

let code = readFileSync(join(repoRoot, 'appsscript', 'Code.gs'), 'utf8');
if (!code.includes('REPLACE_WITH_secret_FROM_CONFIG')) fail('repo Code.gs does not contain the secret placeholder — refusing to push');
code = code
  .replace("const SECRET = 'REPLACE_WITH_secret_FROM_CONFIG';", `const SECRET = '${config.secret}';`)
  .replace("const READ_TOKEN = 'REPLACE_WITH_readToken_FROM_CONFIG';", `const READ_TOKEN = '${config.readToken}';`);

// Stage in a temp dir so injected secrets never sit inside the repo.
// realpathSync.native expands Windows 8.3 short names (STEPHA~1) — clasp treats a
// path that doesn't match its canonical form as a symlink and refuses to push.
const stage = realpathSync.native(mkdtempSync(join(tmpdir(), 'pm-gs-')));
try {
  writeFileSync(join(stage, 'Code.gs'), code);
  writeFileSync(
    join(stage, 'appsscript.json'),
    JSON.stringify(
      {
        timeZone: config.timeZone || 'America/Los_Angeles',
        exceptionLogging: 'STACKDRIVER',
        runtimeVersion: 'V8',
        // web app entry point — without this the deployed /exec URL 404s
        webapp: { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' },
      },
      null,
      2,
    ),
  );
  writeFileSync(join(stage, '.clasp.json'), JSON.stringify({ scriptId: config.scriptId, rootDir: '.' }, null, 2));

  // Instances on different Google accounts use clasp's named credentials:
  // `clasp login --user <name>` once per account, "claspUser": "<name>" in the config.
  const user = config.claspUser ? `--user ${config.claspUser} ` : '';
  const run = (cmd) => {
    console.log(`push-gs: ${cmd}`);
    execSync(`npx --yes @google/clasp ${user}${cmd}`, { cwd: stage, stdio: 'inherit' });
  };
  run('push -f');
  run(`deploy -i ${deploymentId} -d "push-gs ${new Date().toISOString().slice(0, 16)}"`);
  console.log(`push-gs: done — ${configPath.split(/[\\/]/).pop()} deployment updated, URL unchanged`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
