// Offline CLI. No implicit fixtures, authenticated API activation or order side effects.
import { readFile, stat, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { requireThat, stableStringify } from './core.mjs';
import { ingestCandleJson } from './pipeline.mjs';
import { createResearchEnvelope } from './contracts.mjs';
import { NSE_SESSIONS, CALENDAR_EVIDENCE } from './calendar.mjs';
import { runScalpStormCampaign } from './scalpstorm.mjs';

async function boundedFile(path, maximum = 8000000) {
  requireThat(typeof path === 'string' && path.length > 0, 'INPUT_PATH_REQUIRED');
  const metadata = await stat(path);
  requireThat(metadata.isFile() && metadata.size <= maximum, 'INPUT_FILE_SIZE_LIMIT');
  return readFile(path, 'utf8');
}
export async function runCli(args) {
  if (!args.length || args.includes('--help'))
    return 'Atlas offline advanced research\\n'
      + 'calendar\\nreplay --manifest FILE --candles FILE [--output NEW_FILE]\\n'
      + 'scalpstorm --input CAMPAIGN_JSON [--output NEW_FILE]\\n'
      + 'Missing market input never creates synthetic performance. Output files must be new.\\n';
  const [command, ...rest] = args, options = {};
  requireThat(rest.length % 2 === 0, 'INVALID_CLI_OPTIONS');
  for (let i = 0; i < rest.length; i += 2) {
    requireThat(['--manifest', '--candles', '--input', '--output'].includes(rest[i])
      && !Object.hasOwn(options, rest[i]), 'INVALID_CLI_OPTIONS');
    options[rest[i]] = rest[i + 1];
  }
  let result;
  if (command === 'calendar') {
    requireThat(rest.length === 0, 'INVALID_CLI_OPTIONS');
    result = { schema: 'atlas.calendar.v1', ...CALENDAR_EVIDENCE, sessions: NSE_SESSIONS, count: NSE_SESSIONS.length };
  } else if (command === 'replay') {
    requireThat(!options['--input'], 'INVALID_CLI_OPTIONS');
    const manifest = JSON.parse(await boundedFile(options['--manifest']));
    const raw = await boundedFile(options['--candles']);
    const imported = ingestCandleJson(raw, manifest, { providerFormat: manifest.providerFormat ?? 'NORMALIZED' });
    result = { importReceipt: imported.receipt, research: createResearchEnvelope({ dataset: imported.dataset }) };
  } else if (command === 'scalpstorm') {
    requireThat(!options['--manifest'] && !options['--candles'], 'INVALID_CLI_OPTIONS');
    result = runScalpStormCampaign(JSON.parse(await boundedFile(options['--input'], 64000000)));
  } else requireThat(false, 'UNKNOWN_RESEARCH_COMMAND');
  const text = stableStringify(result) + '\n';
  if (options['--output']) {
    await writeFile(options['--output'], text, { flag: 'wx' });
    return stableStringify({ status: 'WRITTEN', output: options['--output'] }) + '\n';
  }
  return text;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(await runCli(process.argv.slice(2))); }
  catch (error) {
    process.stderr.write(JSON.stringify({ error: error.code ?? 'RESEARCH_INPUT_ERROR',
      message: String(error.message).slice(0, 300), realOrdersEnabled: false }) + '\n');
    process.exitCode = 2;
  }
}
