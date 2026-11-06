import {readFile, readdir, mkdir, cp, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const site=path.join(root,'site');
const relative=p=>path.relative(site,p).split(path.sep).join('/');
const file=async p=>readFile(path.join(site,p),'utf8');
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
// Match MintDic's sample sentence records: {id, text, translation}.
// One or more JSON arrays may live inside site/data/sample sentence/.
async function loadSentences(){
 const dir=path.join(site,'data','sample sentence');
 const entries=await readdir(dir,{withFileTypes:true});
 const sentences=new Map();
 for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
  if(entry.name==='.gitkeep'&&entry.isFile())continue;
  if(!entry.isFile()||!entry.name.endsWith('.json'))fail('Example directory must contain JSON files only: '+entry.name);
  const records=JSON.parse(await readFile(path.join(dir,entry.name),'utf8'));
  if(!Array.isArray(records))fail('Example JSON must be an array: '+entry.name);
  for(const record of records){
   if(!record||typeof record!=='object'||Array.isArray(record))fail('Example must be an object in '+entry.name);
   for(const key of ['id','text','translation'])if(typeof record[key]!=='string'||!record[key].trim())fail('Example '+key+' must be a nonempty string in '+entry.name);
   if(!/^[A-Za-z0-9_-]+$/.test(record.id))fail('Invalid example ID: '+record.id);
   if(sentences.has(record.id))fail('Duplicate example ID: '+record.id);
   sentences.set(record.id,record);
  }
 }
 return sentences;
}
const escapeHTML=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
function insertExamples(body,examples,source){
 // Standalone directives only. Ignore directives inside fenced code blocks.
 let fence=null;
 return body.split(/\r?\n/).map(line=>{
  const trimmed=line.trim();
  const start=trimmed.match(/^(`{3,}|~{3,})/);
  if(start){
   if(!fence)fence={char:start[1][0],length:start[1].length};
   else if(start[1][0]===fence.char&&start[1].length>=fence.length&&new RegExp('^'+fence.char+'{'+fence.length+',}\\s*
 const ordering=JSON.parse(await file('data/chapters.json'));
 const sentences=await loadSentences();
 if(!ordering||typeof ordering!=='object'||Array.isArray(ordering))fail('chapters.json must be an object: {"phonology": ["article-id"]}');
 const articleRoot=path.join(site,'data','articles');
 const files=await scan(articleRoot);
 const all=new Map();
 for(const filename of files){
  const rel=relative(filename),meta=parseFrontmatter(await readFile(filename,'utf8'),rel);
  if(all.has(meta.id))fail('Duplicate Markdown id: '+meta.id);
  const relativeParts=path.relative(articleRoot,filename).split(path.sep);
  if(relativeParts.length<2)fail('Markdown files must be inside an English-named chapter folder: '+rel);
  const folder=relativeParts[0];
  if(!/^[a-z][a-z0-9-]*$/.test(folder))fail('Chapter folder must use English lowercase letters: '+folder);
  all.set(meta.id,{...meta,body:insertExamples(meta.body,sentences,rel),file:rel,folder});
 }
 const chapters=[],ids=new Set();
 for(const [folder,articleIds] of Object.entries(ordering)){
  if(!/^[a-z][a-z0-9-]*$/.test(folder))fail('Invalid English chapter folder: '+folder);
  if(!Array.isArray(articleIds))fail(folder+': article order must be an array');
  const configPath='data/articles/'+folder+'/config.json';
  let config;
  try{config=JSON.parse(await file(configPath));}catch(error){fail('Missing or invalid chapter config: '+configPath+' ('+error.message+')')}
  if(config.id!==undefined&&config.id!==folder)fail(configPath+': id must match folder name');
  if(typeof config.title!=='string'||!config.title.trim())fail(configPath+': title is required');
  if(all.has(folder))fail('Chapter id conflicts with an article id: '+folder);
  const overview={id:folder,title:config.title,summary:typeof config.summary==='string'?config.summary:'',
    date:typeof config.date==='string'?config.date:'',tags:Array.isArray(config.tags)?config.tags:[],
    related:Array.isArray(config.related)?config.related:[],file:configPath,folder,
    body:'# '+config.title+'\n\n'+(typeof config.summary==='string'?config.summary:'')};
  ids.add(folder);
  const articles=[];
  for(const id of articleIds){
   if(!isId(id)||ids.has(id))fail('Invalid or repeated ordered id: '+id);
   const article=all.get(id);
   if(!article||article.folder!==folder)fail('Article '+id+' is not an article in articles/'+folder);
   ids.add(id);articles.push(article);
  }
  chapters.push({id:folder,title:overview.title,overview,articles});
 }
 for(const id of all.keys())if(!ids.has(id))fail('Markdown article not listed in chapters.json: '+id);
 await mkdir(destination,{recursive:true});
 for(const name of ['index.html'])await cp(path.join(site,name),path.join(destination,name));
 for(const dir of ['assets','data'])await cp(path.join(site,dir),path.join(destination,dir),{recursive:true});
 await writeFile(path.join(destination,'data','article-index.json'),JSON.stringify(chapters,null,2)+'\n');
 return {chapters:chapters.length,articles:ids.size};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const report=await build();console.log('Built '+report.articles+' articles in '+report.chapters+' chapters')}catch(error){console.error(error);process.exitCode=1}
}
).test(trimmed))fence=null;
   return line;
  }
  if(fence)return line;
  const match=line.match(/^\s*\{\{example:([A-Za-z0-9_-]+)\}\}\s*$/);
  if(!match){
   if(trimmed.includes('{{example:'))fail(source+': use {{example:ID}} on its own line');
   return line;
  }
  const sentence=examples.get(match[1]);
  if(!sentence)fail(source+': example ID not found: '+match[1]);
  return '<div class="example" data-example-id="'+escapeHTML(sentence.id)+'"><p class="original">'+escapeHTML(sentence.text)+'</p><p>'+escapeHTML(sentence.translation)+'</p></div>';
 }).join('\n');
}
export async function build(destination=path.join(root,'dist')){
 const ordering=JSON.parse(await file('data/chapters.json'));
 if(!ordering||typeof ordering!=='object'||Array.isArray(ordering))fail('chapters.json must be an object: {"phonology": ["article-id"]}');
 const articleRoot=path.join(site,'data','articles');
 const files=await scan(articleRoot);
 const all=new Map();
 for(const filename of files){
  const rel=relative(filename),meta=parseFrontmatter(await readFile(filename,'utf8'),rel);
  if(all.has(meta.id))fail('Duplicate Markdown id: '+meta.id);
  const relativeParts=path.relative(articleRoot,filename).split(path.sep);
  if(relativeParts.length<2)fail('Markdown files must be inside an English-named chapter folder: '+rel);
  const folder=relativeParts[0];
  if(!/^[a-z][a-z0-9-]*$/.test(folder))fail('Chapter folder must use English lowercase letters: '+folder);
  all.set(meta.id,{...meta,file:rel,folder});
 }
 const chapters=[],ids=new Set();
 for(const [folder,articleIds] of Object.entries(ordering)){
  if(!/^[a-z][a-z0-9-]*$/.test(folder))fail('Invalid English chapter folder: '+folder);
  if(!Array.isArray(articleIds))fail(folder+': article order must be an array');
  const configPath='data/articles/'+folder+'/config.json';
  let config;
  try{config=JSON.parse(await file(configPath));}catch(error){fail('Missing or invalid chapter config: '+configPath+' ('+error.message+')')}
  if(config.id!==undefined&&config.id!==folder)fail(configPath+': id must match folder name');
  if(typeof config.title!=='string'||!config.title.trim())fail(configPath+': title is required');
  if(all.has(folder))fail('Chapter id conflicts with an article id: '+folder);
  const overview={id:folder,title:config.title,summary:typeof config.summary==='string'?config.summary:'',
    date:typeof config.date==='string'?config.date:'',tags:Array.isArray(config.tags)?config.tags:[],
    related:Array.isArray(config.related)?config.related:[],file:configPath,folder,
    body:'# '+config.title+'\n\n'+(typeof config.summary==='string'?config.summary:'')};
  ids.add(folder);
  const articles=[];
  for(const id of articleIds){
   if(!isId(id)||ids.has(id))fail('Invalid or repeated ordered id: '+id);
   const article=all.get(id);
   if(!article||article.folder!==folder)fail('Article '+id+' is not an article in articles/'+folder);
   ids.add(id);articles.push(article);
  }
  chapters.push({id:folder,title:overview.title,overview,articles});
 }
 for(const id of all.keys())if(!ids.has(id))fail('Markdown article not listed in chapters.json: '+id);
 await mkdir(destination,{recursive:true});
 for(const name of ['index.html'])await cp(path.join(site,name),path.join(destination,name));
 for(const dir of ['assets','data'])await cp(path.join(site,dir),path.join(destination,dir),{recursive:true});
 await writeFile(path.join(destination,'data','article-index.json'),JSON.stringify(chapters,null,2)+'\n');
 return {chapters:chapters.length,articles:ids.size};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const report=await build();console.log('Built '+report.articles+' articles in '+report.chapters+' chapters')}catch(error){console.error(error);process.exitCode=1}
}
