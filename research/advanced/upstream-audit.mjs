// Optional read-only public-source refresh. Never run by offline tests.
// Downloads text for hashing/static inspection only; never installs or executes upstream code.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { rawDigest } from './core.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const prior = JSON.parse(await readFile(root + 'docs/operations/atlas-open-source-audit.json', 'utf8'));
const checkedAt = new Date().toISOString();
const rawDirectory = root + '.ai/astra-upstream-source/';
await mkdir(rawDirectory, { recursive: true });
async function get(url, json = false) {
  const response = await fetch(url, { headers: { Accept: json ? 'application/vnd.github+json' : 'text/plain',
    'User-Agent': 'Atlas-read-only-research-audit' }, signal: AbortSignal.timeout(15000) });
  const text = await response.text();
  if (!response.ok) return { ok: false, status: response.status, url };
  if (Buffer.byteLength(text, 'utf8') > 3000000) return { ok: false, status: 'SIZE_LIMIT', url };
  return { ok: true, status: response.status, url, text, value: json ? JSON.parse(text) : null,
    sha256: rawDigest(text), bytes: Buffer.byteLength(text, 'utf8') };
}
const metadata = file => ({ url: file.url, httpStatus: file.status,
  ...(file.ok ? { sha256: file.sha256, bytes: file.bytes } : {}) });
async function audit(candidate) {
  const api = 'https://api.github.com/repos/' + candidate.repository;
  const repo = await get(api, true);
  if (!repo.ok) return { id: candidate.id, repository: candidate.repository,
    status: 'METADATA_UNAVAILABLE', evidence: metadata(repo), priorPinnedCommit: candidate.pinnedCommit };
  const commit = await get(api + '/commits/' + encodeURIComponent(repo.value.default_branch), true);
  if (!commit.ok) return { id: candidate.id, repository: candidate.repository,
    status: 'REVISION_UNAVAILABLE', evidence: metadata(commit), priorPinnedCommit: candidate.pinnedCommit };
  const revision = commit.value.sha, raw = 'https://raw.githubusercontent.com/' + candidate.repository + '/' + revision + '/';
  let license;
  for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENSE-MIT']) {
    const response = await get(raw + name);
    if (response.ok) { license = response; break; }
  }
  const paths = new Set([candidate.inspectedCodePath, 'pyproject.toml', 'requirements.txt', 'README.md']);
  const files = [];
  const dependencyIndicators = new Set();
  const terms = ['langgraph', 'langchain', 'openai', 'anthropic', 'alpaca', 'torch', 'tensorflow',
    'numpy', 'pandas', 'numba', 'cython', 'pythonnet', 'ccxt', 'pickle', 'joblib', 'transformers'];
  for (const path of paths) {
    const file = await get(raw + path);
    files.push({ path, ...metadata(file) });
    if (file.ok) {
      for (const term of terms) if (file.text.toLowerCase().includes(term)) dependencyIndicators.add(term);
      // Private evaluation cache only, excluded from the PR and never automatically imported.
      if (path === candidate.inspectedCodePath || path === 'README.md')
        await writeFile(rawDirectory + candidate.id + '-' + path.replaceAll('/', '_'), file.text);
    }
  }
  const advisory = await get(api + '/security-advisories?per_page=100', true);
  return { id: candidate.id, repository: candidate.repository, url: candidate.url,
    pinnedCommit: revision, priorPinnedCommit: candidate.pinnedCommit,
    revisionChanged: revision !== candidate.pinnedCommit, commitAt: commit.value.commit.committer.date,
    archived: repo.value.archived, disabled: repo.value.disabled,
    repositoryLicenseSPDX: repo.value.license?.spdx_id ?? 'UNDETERMINED',
    priorLicenseFinding: candidate.license, licenseEvidence: license ? metadata(license) : { status: 'NOT_FOUND_IN_COMMON_PATHS' },
    licenseMarkers: license ? { commonsClause: license.text.includes('Commons Clause'),
      lesserGPL: license.text.includes('LESSER GENERAL PUBLIC LICENSE'),
      generalGPL: license.text.includes('GNU GENERAL PUBLIC LICENSE') } : null,
    files, dependencyIndicators: [...dependencyIndicators].sort(),
    advisoryCheck: { ...metadata(advisory),
      publishedRepositoryAdvisories: advisory.ok ? advisory.value.map(item => ({
        ghsaId: item.ghsa_id, severity: item.severity, publishedAt: item.published_at, url: item.html_url,
      })) : null,
      dependencyCveAuditCompleted: false },
    evaluation: 'STATIC_SOURCE_AND_MANIFEST_INSPECTION_NOT_FULL_FRAMEWORK_EXECUTION',
    packagesInstalled: false, upstreamCodeVendored: false, modelWeightsDownloaded: false,
    deploymentCostGuaranteedFree: false, realOrdersEnabled: false };
}
const queue = [...prior.upstream], results = [];
await Promise.all(Array.from({ length: 3 }, async () => {
  while (queue.length) {
    const candidate = queue.shift();
    try { results.push(await audit(candidate)); }
    catch (error) { results.push({ id: candidate.id, repository: candidate.repository,
      status: 'AUDIT_RETRIEVAL_FAILED', error: String(error.message).slice(0, 250) }); }
  }
}));
results.sort((a, b) => prior.upstream.findIndex(c => c.id === a.id) - prior.upstream.findIndex(c => c.id === b.id));
const report = { schema: 'atlas.upstream-source-audit.v1', checkedAt,
  scope: 'Public source, revisions, licenses, manifests and published repository advisories; no dependency certification',
  authenticatedRequests: 0, packagesInstalled: 0, repositories: results };
await writeFile(root + 'docs/research/advanced/upstream-evidence.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ checkedAt, repositories: results.length,
  revisionsVerified: results.filter(r => r.pinnedCommit).length,
  failures: results.filter(r => !r.pinnedCommit).map(r => ({ id: r.id, status: r.status })),
  packagesInstalled: 0 }));
