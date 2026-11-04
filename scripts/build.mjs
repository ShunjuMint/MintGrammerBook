import {readFile, readdir, mkdir, cp, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const relative=p=>path.relative(root,p).split(path.sep).join('/');
const file=async p=>readFile(path.join(root,p),'utf8');
const fail=message=>{throw new Error(message)};
const isId=id=>typeof id==='string'&&/^[\p{L}\p{N}_-]+$/u.test(id)&&id!=='.'&&id!=='..';
function yamlValue(raw){
 const value=raw.trim();
 if(!value)return '';
 if(value.startsWith('[')){try{const data=JSON.parse(value);if(Array.isArray(data))return data}catch{}fail('Arrays must use JSON-style quotes: '+value)}
 if(value.startsWith('"')){try{return JSON.parse(value)}catch{fail('Invalid quoted value: '+value)}}
 if(value.startsWith("'")&&value.endsWith("'"))return value.slice(1,-1).replaceAll("''","'");
 return value.replace(/\s+#.*$/,'').trim();
}
function parseFrontmatter(source,filename){
 const match=source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
 if(!match)fail(filename+': frontmatter (---) is required');
 const meta={};let current=null;
 for(const line of match[1].split(/\r?\n/)){
  if(!line.trim()||line.trim().startsWith('#'))continue;
  const key=line.match(/^([a-z][a-z0-9_]*):\s*(.*)$/i);
  if(key){current=key[1];if(Object.hasOwn(meta,current))fail(filename+': duplicate field '+current);meta[current]=yamlValue(key[2]);continue;}
  const element=line.match(/^\s+-\s+(.+)$/);
  if(element&&current&&['tags','related'].includes(current)){
   if(meta[current]==='')meta[current]=[];
   if(!Array.isArray(meta[current]))fail(filename+': invalid list for '+current);
   meta[current].push(String(yamlValue(element[1])));
  }else fail(filename+': unsupported YAML line: '+line);
 }
 if(!isId(meta.id))fail(filename+': invalid or missing id');
 if(typeof meta.title!=='string'||!meta.title.trim())fail(filename+': title is required');
 if(meta.date&&(!/^\d{4}-\d{2}-\d{2}$/.test(meta.date)||Number.isNaN(Date.parse(meta.date))))fail(filename+': invalid date');
 for(const key of ['tags','related']){
  let v=meta[key]??[];
  if(typeof v==='string')v=v.split(/[,，]/).map(t=>t.trim()).filter(Boolean);
  if(!Array.isArray(v)||v.some(t=>typeof t!=='string'||!t.trim()))fail(filename+': '+key+' must be a string or string array');
  meta[key]=v;
 }
 return {...meta,summary:meta.summary||'',date:meta.date||'',body:source.slice(match[0].length)};
}
async function scan(dir){
 const entries=await readdir(dir,{withFileTypes:true});
 let found=[];
 for(const entry of entries){
  const absolute=path.join(dir,entry.name);
  if(entry.isDirectory())found.push(...await scan(absolute));
  else if(entry.isFile()&&entry.name.endsWith('.md'))found.push(absolute);
 }
 return found;
}
export async function build(destination=path.join(root,'dist')){
 const ordering=JSON.parse(await file('data/chapters.json'));
 if(!ordering||typeof ordering!=='object'||Array.isArray(ordering))fail('chapters.json must be an object: {"01-音韻論": ["article-id"]}');
 const articleRoot=path.join(root,'articles');
 const files=await scan(articleRoot);
 const all=new Map();
 for(const filename of files){
  const rel=relative(filename),meta=parseFrontmatter(await readFile(filename,'utf8'),rel);
  if(all.has(meta.id))fail('Duplicate article id: '+meta.id);
  const folder=path.relative(articleRoot,filename).split(path.sep)[0];
  all.set(meta.id,{...meta,file:rel,folder});
 }
 const chapters=[],ids=new Set();
 for(const [folder,articleIds] of Object.entries(ordering)){
  if(!isId(folder))fail('Invalid chapter folder: '+folder);
  if(!Array.isArray(articleIds))fail(folder+': article order must be an array');
  const articles=[];
  for(const id of articleIds){
   if(!isId(id)||ids.has(id))fail('Invalid or repeated ordered id: '+id);
   const article=all.get(id);
   if(!article||article.folder!==folder)fail('Article '+id+' is not in articles/'+folder);
   ids.add(id);articles.push(article);
  }
  const label=folder.replace(/^(\d+)[-_]/,'$1 ').replaceAll('_',' ');
  chapters.push({id:folder,title:label,articles});
 }
 for(const id of all.keys())if(!ids.has(id))fail('Article not listed in chapters.json: '+id);
 await mkdir(destination,{recursive:true});
 for(const name of ['index.html'])await cp(path.join(root,name),path.join(destination,name));
 for(const dir of ['assets','data','articles'])await cp(path.join(root,dir),path.join(destination,dir),{recursive:true});
 await writeFile(path.join(destination,'data','article-index.json'),JSON.stringify(chapters,null,2)+'\n');
 return {chapters:chapters.length,articles:ids.size};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const report=await build();console.log('Built '+report.articles+' articles in '+report.chapters+' chapters')}catch(error){console.error(error);process.exitCode=1}
}
