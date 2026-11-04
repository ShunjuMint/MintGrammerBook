import assert from 'node:assert/strict';
import {cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = path.join(root, 'tests/fixtures/site');
let passed = 0;

function runBuild(cwd, shouldFail = false, errorPattern) {
  try {
    execFileSync(process.execPath, ['scripts/build.mjs'], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    });
    if (shouldFail) assert.fail('Expected the build to fail');
  } catch (error) {
    if (!shouldFail) throw error;
    assert.match(String(error.stderr || error.message), errorPattern);
  }
}

async function prepareFixture() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'mint-grammar-test-'));
  await mkdir(path.join(cwd, 'scripts'));
  await cp(path.join(root, 'scripts/build.mjs'), path.join(cwd, 'scripts/build.mjs'));
  await mkdir(path.join(cwd, 'site'));
  await cp(path.join(root, 'site/index.html'), path.join(cwd, 'site/index.html'));
  await cp(path.join(root, 'site/assets'), path.join(cwd, 'site/assets'), {recursive: true});
  await cp(path.join(fixtureRoot, 'articles'), path.join(cwd, 'site/articles'), {recursive: true});
  await cp(path.join(fixtureRoot, 'data'), path.join(cwd, 'site/data'), {recursive: true});
  return cwd;
}

async function test(name, callback) {
  const cwd = await prepareFixture();
  try {
    await callback(cwd);
    passed++;
    console.log('PASS ' + name);
  } finally {
    await rm(cwd, {recursive: true, force: true});
  }
}

async function change(cwd, file, value) {
  await writeFile(path.join(cwd, file), value, 'utf8');
}

async function readIndex(cwd) {
  return JSON.parse(await readFile(path.join(cwd, 'dist/data/article-index.json'), 'utf8'));
}

// The real public site must build without accidentally publishing test fixtures.
runBuild(root);
const publicFiles = await readdir(path.join(root, 'dist'));
assert.ok(!publicFiles.includes('tests'));
assert.ok(!publicFiles.includes('README.md'));
console.log('PASS public site excludes tests and README');
passed++;

await test('chapter config, article metadata, and explicit display order', async cwd => {
  runBuild(cwd);
  const chapters = await readIndex(cwd);
  assert.deepEqual(chapters.map(ch => ch.id), ['phonology', 'morphology']);
  assert.deepEqual(chapters.map(ch => ch.title), ['音韻論', '形態論']);
  assert.deepEqual(chapters[0].articles.map(a => a.id), ['syllables', 'phonemes']);
  assert.deepEqual(chapters[1].articles.map(a => a.id), ['nouns']);
  assert.equal(chapters[0].overview.file, 'articles/phonology/config.json');
  assert.deepEqual(chapters[0].overview.tags, ['音韻論']);
  const phonemes = chapters[0].articles[1];
  assert.equal(phonemes.title, '音素');
  assert.equal(phonemes.summary, 'テスト用の音素記事');
  assert.equal(phonemes.date, '2026-11-05');
  assert.deepEqual(phonemes.tags, ['音韻論', 'IPA']);
  assert.deepEqual(phonemes.related, ['syllables']);
  assert.match(phonemes.body, /!\[音素図\]\(images\/sample.svg\)/);
  assert.deepEqual(chapters[0].articles[0].tags, ['音韻論', '音節']);
  assert.deepEqual(chapters[1].articles[0].tags, ['形態論', '名詞']);
  const image = await readFile(path.join(cwd, 'dist/articles/phonology/images/sample.svg'), 'utf8');
  assert.match(image, /<svg/);
  assert.ok(!(await readdir(path.join(cwd, 'dist'))).includes('tests'));
});

await test('missing chapter config is rejected', async cwd => {
  await rm(path.join(cwd, 'site/articles/phonology/config.json'));
  runBuild(cwd, true, /Missing or invalid chapter config/);
});

await test('unknown article ID in chapters.json is rejected', async cwd => {
  await change(cwd, 'site/data/chapters.json', JSON.stringify({phonology: ['unknown'], morphology: ['nouns']}));
  runBuild(cwd, true, /not an article/);
});

await test('duplicate article IDs are rejected', async cwd => {
  const file = 'site/articles/morphology/nouns.md';
  const original = await readFile(path.join(cwd, file), 'utf8');
  await change(cwd, file, original.replace('id: "nouns"', 'id: "phonemes"'));
  runBuild(cwd, true, /Duplicate Markdown id/);
});

await test('missing frontmatter is rejected', async cwd => {
  await change(cwd, 'site/articles/morphology/nouns.md', '# No metadata\n');
  runBuild(cwd, true, /frontmatter .* required/);
});

await test('unlisted Markdown article is rejected', async cwd => {
  await change(cwd, 'site/data/chapters.json', JSON.stringify({phonology: ['syllables', 'phonemes'], morphology: []}));
  runBuild(cwd, true, /not listed in chapters.json/);
});

console.log('All ' + passed + ' build tests passed');
