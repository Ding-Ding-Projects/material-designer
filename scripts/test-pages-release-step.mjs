import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, chmodSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = mkdtempSync(join(tmpdir(), 'pages-full-step-'));
const bash = process.env.BASH_EXE || (process.platform === 'win32' ? join(process.env.ProgramFiles, 'Git/bin/bash.exe') : 'bash');
const json = (path) => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const source = process.env.PAGES_STEP_FIXTURE_REF
  ? execFileSync('git', ['show', process.env.PAGES_STEP_FIXTURE_REF + ':.github/workflows/pages.yml'], {cwd: root, encoding: 'utf8'})
  : readFileSync(join(root, '.github/workflows/pages.yml'), 'utf8');
const stepHeader = '      - name: Resolve and apply the current published release facts';
const selected = source.slice(source.indexOf(stepHeader) + stepHeader.length).split(/\r?\n/);
const runStart = selected.findIndex((line) => line === '        run: |');
assert.ok(source.includes(stepHeader) && runStart >= 0, 'exact Pages step must exist');
const code = [];
for (const line of selected.slice(runStart + 1)) {
  if (/^      - name:/.test(line)) break;
  code.push(line.replace(/^          /, ''));
}
assert.ok(code.at(-2)?.includes('Published release facts refreshed') || code.join('\n').includes('>> "$GITHUB_OUTPUT"'), 'full final-output boundary must be retained');
assert.ok(!code.join('\n').includes('${{'), 'fixture cannot silently replace expressions');
mkdirSync(join(scratch, 'bin'));
writeFileSync(join(scratch, 'step.sh'), code.join('\n'));
writeFileSync(join(scratch, 'bin', 'gh'), [
  '#!/usr/bin/env node',
  'const fs = require("node:fs"), path = require("node:path");',
  'const a = process.argv.slice(2), env = process.env;',
  'const release = JSON.parse(fs.readFileSync(env.PAGES_FIXTURE_RELEASE, "utf8"));',
  'function fail() { throw new Error("Unexpected gh fixture operation: " + a.slice(0,3).join(" ")); }',
  'if (a[0] === "run" && a[1] === "view" && a[2] === env.RELEASE_RUN_ID) process.stdout.write(env.GITHUB_SHA + "\\tcompleted\\tsuccess\\n");',
  'else if (a[0] === "api" && a[1] === "--paginate" && a[2] === "repos/" + env.GITHUB_REPOSITORY + "/releases?per_page=100") process.stdout.write(release.tagName + "\\n");',
  'else if (a[0] === "release" && a[1] === "view" && a[2] === release.tagName) process.stdout.write(JSON.stringify(release));',
  'else if (a[0] === "release" && a[1] === "download" && a[2] === release.tagName) {',
  ' const dest = a[a.indexOf("--dir") + 1]; if (!dest || !a.includes("--clobber")) fail();',
  ' for (let i=0; i<a.length; i++) if (a[i] === "--pattern") { const name=a[++i]; if (name !== path.basename(name) || !release.assets.some(x => x.name === name)) fail(); fs.copyFileSync(path.join(env.PAGES_FIXTURE_ASSETS,name),path.join(dest,name)); }',
  '} else fail();',
].join('\n'));
chmodSync(join(scratch, 'bin', 'gh'), 0o755);

function png() {
  function chunk(name, data) {
    const body = Buffer.concat([Buffer.from(name), data]);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const size = Buffer.alloc(4), sum = Buffer.alloc(4);
    size.writeUInt32BE(data.length); sum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, body, sum]);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8]=8; header[9]=2;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'), chunk('IHDR',header), chunk('IDAT',deflateSync(Buffer.from([0,32,64,96]))), chunk('IEND',Buffer.alloc(0))]);
}
const actual = !!process.env.PAGES_REAL_RELEASE_JSON;
let release, metadata, provenance, photo, installer, repository, commit, version, stamp;
const assets = join(scratch, 'assets');
mkdirSync(assets);
if (actual) {
  release = json(process.env.PAGES_REAL_RELEASE_JSON);
  assert.ok(process.env.PAGES_REAL_ASSETS_DIR, 'actual replay requires downloaded assets');
  const marker = (key) => release.body.match(new RegExp('^<!-- ' + key + ': (.*) -->$','m'))?.[1];
  installer = marker('release-installer'); commit = marker('release-commit'); version = marker('release-version');
  metadata = json(join(process.env.PAGES_REAL_ASSETS_DIR, 'metadata.json'));
  provenance = json(join(process.env.PAGES_REAL_ASSETS_DIR, 'build-provenance.json'));
  repository = new URL(metadata.platforms.win.artifacts.installer.url).pathname.split('/').slice(1,3).join('/');
  photo = marker('dim-sum-image-asset');
  for (const name of [installer + '.sha256', photo]) copyFileSync(join(process.env.PAGES_REAL_ASSETS_DIR,name),join(assets,name));
} else {
  installer = 'material-designer-1.2.3-win-x64-setup.exe';
  photo = 'codename-hk-dish-0001.png';
  commit = 'a'.repeat(40); version = '1.2.3'; repository = 'example-org/sample-app';
  const tag = 'v1.2.3-r1.1', image = png(), hash = sha(Buffer.from('fixture installer'));
  writeFileSync(join(assets, photo), image);
  writeFileSync(join(assets, installer + '.sha256'), hash + '  ' + installer + '\n');
  const markers = {
    'release-tag':tag, 'release-version':version, 'release-commit':commit,
    'release-package':'open-design-packaged-app', 'release-installer':installer, 'release-codename':'Example & Test · 示例',
    'dim-sum-id':'hk-dish-0001', 'dim-sum-catalog-tag':'catalog-v1',
    'dim-sum-image-source':'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0001-example.png',
    'dim-sum-image-dish':'hk-dish-0001', 'dim-sum-image-asset':photo, 'dim-sum-image-sha256':sha(image),
  };
  const body = Object.entries(markers).map(([key,value]) => '<!-- ' + key + ': ' + value + ' -->').join('\n') +
    '\n### Line count\n| Category | Lines |\n| Source | 1 |\nWorkflow duration: 00:01:00\n';
  release = {tagName:tag, name:'Example release', isDraft:false, isPrerelease:false, body,
    assets:[installer,installer+'.sha256','RELEASES','metadata.json','material-designer.ico','build-evidence.json','build-provenance.json','artifact-receipt.json',photo].map(name => ({name,size:name === installer ? 17 : name === photo ? image.length : 1,contentType:name === photo ? 'image/png' : 'application/octet-stream'}))};
  const url = 'https://github.com/' + repository + '/releases/download/' + tag + '/' + installer;
  metadata = {schemaVersion:1,channel:'stable',releaseVersion:version,signed:false,platforms:{win:{enabled:true,arch:'x64',artifacts:{installer:{type:'installer',name:'Setup.exe',url,size:17,sha256:hash,sha256Url:url+'.sha256'}}}}};
  provenance = {package:{id:'open-design-packaged-app',version,architecture:'x64'},sourceCommit:commit,updatedAt:'2026-09-07T12:34:56Z',provenanceStatus:'verified'};
}
stamp = provenance.updatedAt;
writeFileSync(join(assets,'build-provenance.json'), JSON.stringify(provenance));
writeFileSync(join(scratch,'release.json'),JSON.stringify(release));
const baselineMetadata = structuredClone(metadata);
let count = 0;
function replay(label, mutate, succeeds) {
  const directory = join(scratch, 'case-' + (++count));
  mkdirSync(directory); mkdirSync(join(directory,'site')); mkdirSync(join(directory,'tmp'));
  copyFileSync(join(root,'site/index.html'),join(directory,'site/index.html'));
  metadata = structuredClone(baselineMetadata); mutate?.(metadata);
  writeFileSync(join(assets,'metadata.json'),JSON.stringify(metadata));
  const output = join(directory,'outputs.env');
  writeFileSync(output,'');
  const env = {...process.env, PATH:join(scratch,'bin') + (process.platform === 'win32' ? ';' : ':') + process.env.PATH,
    PAGES_FIXTURE_RELEASE:join(scratch,'release.json'),PAGES_FIXTURE_ASSETS:assets,
    RUNNER_TEMP:join(directory,'tmp'),GITHUB_RUN_ID:'fixture',GITHUB_RUN_ATTEMPT:'1',GITHUB_OUTPUT:output,
    GITHUB_REPOSITORY:repository,GITHUB_SERVER_URL:'https://github.com',GITHUB_SHA:commit,EXPECTED_RELEASE_SHA:commit,RELEASE_RUN_ID:'1'};
  const result = spawnSync(bash,['--noprofile','--norc','-e','-o','pipefail',join(scratch,'step.sh')],{cwd:directory,env,encoding:'utf8',timeout:120000});
  if (succeeds && result.status !== 0) throw new Error(label + ': full Pages step failed\n' + result.stdout + result.stderr);
  if (!succeeds) {
    assert.notEqual(result.status,0,label + ' must reject');
    assert.match(result.stdout + result.stderr,/published metadata does not bind/,label + ' must fail at metadata contract');
    assert.equal(readFileSync(output,'utf8'),'','no completion outputs on rejection');
  } else {
    const values = Object.fromEntries(readFileSync(output,'utf8').trim().split(/\r?\n/).map(line=>[line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1)]));
    assert.deepEqual(Object.keys(values).sort(),['tag','version','commit','installer','image','image_sha'].sort());
    assert.equal(values.commit,commit); assert.equal(values.tag,release.tagName); assert.equal(values.version,version); assert.equal(values.installer,installer); assert.equal(values.image,photo);
    assert.equal(values.image_sha,sha(readFileSync(join(assets,photo))));
    const html=readFileSync(join(directory,'site/index.html'),'utf8');
    const links=html.split(/\r?\n/).filter(line=>line.includes('data-release-href="installer"'));
    assert.equal(links.length,2);
    for(const line of links) assert.ok(line.includes(' href="' + baselineMetadata.platforms.win.artifacts.installer.url + '"'));
    assert.equal(html.split('data-release="chip">' + version).length - 1,2);
    assert.ok(html.includes('data-front-version="' + version + '"'));
    assert.ok(html.includes('data-front-source-commit="' + commit + '"'));
    assert.ok(html.includes('data-front-updated-at="' + stamp + '"'));
    assert.ok(html.includes('data-front-provenance-value="version">' + version + '<'));
    assert.ok(html.includes('data-front-provenance-value="updated-at">' + stamp + '<'));
    assert.ok(html.includes('>Provenance verified<'));
    assert.ok(html.includes('data-release="tag">' + release.tagName + '<'));
    assert.ok(html.includes('data-release="image">' + photo + '<'));
    assert.match(result.stdout,/Decoded published catalog image/);
    assert.match(result.stdout,/Published release facts refreshed/);
  }
  console.log('PASS: ' + label);
}
try {
  replay(actual ? 'real downloaded release through final Pages outputs and HTML' : 'complete synthetic release through final Pages outputs and HTML',null,true);
  if (!actual && !process.argv.includes('--positive-only')) {
    const item = metadata => metadata.platforms.win.artifacts.installer;
    for (const [label,mutate] of [
      ['logical installer name',m=>{item(m).name=installer;}],
      ['installer type',m=>{item(m).type='archive';}],
      ['disabled platform',m=>{m.platforms.win.enabled=false;}],
      ['wrong architecture',m=>{m.platforms.win.arch='arm64';}],
      ['wrong installer byte count',m=>{item(m).size++;}],
      ['wrong release version',m=>{m.releaseVersion='9.9.9';}],
      ['signed metadata',m=>{m.signed=true;}],
      ['wrong installer URL',m=>{item(m).url+='?other';}],
      ['wrong checksum URL',m=>{item(m).sha256Url+='?other';}],
      ['wrong checksum',m=>{item(m).sha256='0'.repeat(64);}],
      ['wrong schema version',m=>{m.schemaVersion=2;}],
    ]) replay(label,mutate,false);
  }
  console.log('PASS: ' + count + ' complete Pages-step replay cases; no live API or photo access.');
} finally { rmSync(scratch,{recursive:true,force:true}); }
