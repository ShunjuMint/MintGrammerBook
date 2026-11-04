import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root,stdio:'inherit'});
const index=JSON.parse(await readFile(path.join(root,'dist/data/article-index.json'),'utf8'));
assert.ok(Array.isArray(index),'generated article index must be an array');
for(const chapter of index){assert.ok(Array.isArray(chapter.articles));for(const article of chapter.articles)assert.ok(article.file.startsWith('articles/'));}
const files=await readdir(path.join(root,'dist'));
assert.ok(!files.includes('tests'),'tests must not be published');
assert.ok(!files.includes('README.md'),'README must not be published');
console.log('Build verification passed');
