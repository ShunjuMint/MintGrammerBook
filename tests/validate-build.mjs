import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,mkdir,cp,rm,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root,stdio:'inherit'});
const index=JSON.parse(await readFile(path.join(root,'dist/data/article-index.json'),'utf8'));
assert.ok(Array.isArray(index),'generated article index must be an array');
for(const chapter of index){
 assert.ok(chapter.overview&&chapter.overview.id===chapter.id,'chapter overview must match folder');
 assert.equal(chapter.overview.file,'articles/'+chapter.id+'/config.json');
 assert.ok(Array.isArray(chapter.articles));
 for(const article of chapter.articles)assert.ok(article.file.startsWith('articles/'));
}
const files=await readdir(path.join(root,'dist'));
assert.ok(!files.includes('tests'),'tests must not be published');
assert.ok(!files.includes('README.md'),'README must not be published');

const temporary=await mkdtemp(path.join(os.tmpdir(),'mintgrammar-test-'));
try{
 await mkdir(path.join(temporary,'scripts'),{recursive:true});
 await cp(path.join(root,'scripts/build.mjs'),path.join(temporary,'scripts/build.mjs'));
 await cp(path.join(root,'index.html'),path.join(temporary,'index.html'));
 await cp(path.join(root,'assets'),path.join(temporary,'assets'),{recursive:true});
 await cp(path.join(root,'tests/fixtures/site/articles'),path.join(temporary,'articles'),{recursive:true});
 await cp(path.join(root,'tests/fixtures/site/data'),path.join(temporary,'data'),{recursive:true});
 execFileSync(process.execPath,['scripts/build.mjs'],{cwd:temporary,stdio:'inherit'});
 const sample=JSON.parse(await readFile(path.join(temporary,'dist/data/article-index.json'),'utf8'));
 assert.equal(sample.length,1);
 assert.equal(sample[0].id,'phonology');
 assert.equal(sample[0].title,'音韻論');
 assert.equal(sample[0].overview.file,'articles/phonology/config.json');
 assert.deepEqual(sample[0].overview.tags,['音韻論']);
 assert.equal(sample[0].overview.body.includes('# 音韻論'),true);
 assert.deepEqual(sample[0].articles.map(x=>x.id),['phonemes']);
 assert.equal(sample[0].articles[0].title,'音素');
}finally{
 await rm(temporary,{recursive:true,force:true});
}
console.log('Build and chapter metadata tests passed');
