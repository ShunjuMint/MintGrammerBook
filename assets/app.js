const $=id=>document.getElementById(id);
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
const norm=s=>String(s??'').normalize('NFKC').toLocaleLowerCase('ja');
let chapters=[],items=[],lookup=new Map(),requestCounter=0;
const selected=()=>new URL(location.href).searchParams.get('id');
const href=id=>{const u=new URL(location.href);u.searchParams.set('id',id);u.hash='';return u.pathname+u.search};
function itemLink(item){const a=node('a');a.href=href(item.id);a.dataset.id=item.id;return a}
async function read(path){const r=await fetch(new URL(path,document.baseURI),{cache:'no-cache'});if(!r.ok)throw Error(path+': HTTP '+r.status);return r.text()}
async function readJSON(path){return JSON.parse(await read(path))}
function validPath(path){return typeof path==='string'&&/^articles\/[a-zA-Z0-9_/-]+\.md$/.test(path)&&!path.split('/').includes('..')}
function markdownHTML(text){
 if(!window.marked||!window.DOMPurify)throw Error('Markdown表示ライブラリを読み込めませんでした');
 const html=window.marked.parse(text,{gfm:true,breaks:false});
 const clean=window.DOMPurify.sanitize(html);
 const template=document.createElement('template');template.innerHTML=clean;
 for(const a of template.content.querySelectorAll('a[href]')){
   const address=a.getAttribute('href')||'';
   if(address.startsWith('#'))continue;
   try{const u=new URL(address,document.baseURI);if(u.protocol==='https:'||u.protocol==='http:'){a.target='_blank';a.rel='noopener noreferrer';}else a.removeAttribute('href');}catch{a.removeAttribute('href')}
 }
 return template.content;
}
async function show(id,historyMode=false){
 const item=lookup.get(id)||items[0];if(!item)return;
 const request=++requestCounter;
 if(historyMode)history.pushState(null,'',href(item.id));
 $('query').value='';$('clear').hidden=true;$('results').hidden=true;$('article').hidden=false;
 const a=$('article');a.replaceChildren(node('p',item.chapter,'eyebrow'),node('p','記事を読み込んでいます…','muted'));
 document.querySelectorAll('#toc a').forEach(link=>link.dataset.id===item.id?link.setAttribute('aria-current','page'):link.removeAttribute('aria-current'));
 const idx=items.indexOf(item);for(const [key,target,prefix] of [['prev',items[idx-1],'← '],['next',items[idx+1],'→ ']]){const link=$(key);link.hidden=!target;if(target){link.href=href(target.id);link.dataset.id=target.id;link.textContent=prefix+target.title}}
 try{
  if(item.body===undefined)item.body=await read(item.file);
  if(request!==requestCounter)return;
  const content=node('div',undefined,'markdown-body');content.append(markdownHTML(item.body));
  a.replaceChildren(node('p',item.chapter,'eyebrow'),content);
  if(item.tags?.length){const box=node('div',undefined,'tags');for(const tag of item.tags)box.append(node('span',tag,'tag'));a.append(box)}
  const related=(item.related||[]).map(id=>lookup.get(id)).filter(Boolean);
  if(related.length){const section=node('section',undefined,'section');section.append(node('h2','関連項目'));const box=node('div',undefined,'related');for(const ref of related){const link=itemLink(ref);link.textContent=ref.title;box.append(link)}section.append(box);a.append(section)}
 }catch(e){if(request===requestCounter){console.error(e);a.replaceChildren(node('p','記事を表示できませんでした。','message'))}}
}
function search(){
 const q=norm($('query').value).trim();if(!q){show(selected()||items[0]?.id);return}
 ++requestCounter;$('clear').hidden=false;$('results').hidden=false;$('article').hidden=true;$('prev').hidden=true;$('next').hidden=true;
 const filtered=items.filter(x=>norm([x.title,x.chapter,x.summary,...(x.tags||[]),x.body||''].join(' ')).includes(q));
 $('result-count').textContent=filtered.length+' 件';$('matches').replaceChildren();
 for(const x of filtered){const a=itemLink(x);a.className='result';a.append(node('p',x.chapter),node('h3',x.title),node('p',x.summary));$('matches').append(a)}
 if(!filtered.length)$('matches').append(node('p','一致する文法項目はありません。','message'));
}
function renderTOC(){
 $('toc').replaceChildren();
 for(const chapter of chapters){
  $('toc').append(node('div',chapter.title,'chapter'));
  for(const x of chapter.articles){const item=lookup.get(x.id);if(!item)continue;const a=itemLink(item);a.textContent=item.title;$('toc').append(a)}
 }
}
$('query').addEventListener('input',search);$('clear').onclick=()=>show(selected()||items[0]?.id);
$('about').onclick=()=>$('about-dialog').showModal();$('close').onclick=()=>$('about-dialog').close();
document.addEventListener('click',e=>{const a=e.target.closest('a[data-id]');if(!a||e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();show(a.dataset.id,true)});
window.addEventListener('popstate',()=>show(selected()));
window.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!$('about-dialog').open){e.preventDefault();$('query').focus()}});
try{
 const [cfg,all]=await Promise.all([readJSON('data/config.json'),readJSON('data/chapters.json')]);
 if(!Array.isArray(all))throw Error('chapters.json は配列にしてください');
 chapters=all.filter(c=>typeof c.title==='string'&&Array.isArray(c.articles));
 items=chapters.flatMap(c=>c.articles.map(x=>({...x,chapter:c.title})));
 if(items.some(x=>typeof x.id!=='string'||typeof x.title!=='string'||!validPath(x.file)))throw Error('記事のid、title、fileを確認してください');
 if(new Set(items.map(x=>x.id)).size!==items.length)throw Error('記事IDが重複しています');
 lookup=new Map(items.map(x=>[x.id,x]));
 $('brand').textContent=cfg.title||'文法書';document.title=cfg.title||'文法書';$('about-text').textContent=cfg.about||'説明は未登録です。';
 $('count').textContent=items.length+' 項目';renderTOC();
 await Promise.all(items.map(async item=>{try{item.body=await read(item.file)}catch(e){console.error(e);item.body='';item.loadError=true}}));
 if(items.length)await show(selected());else{$('status').hidden=false;$('status').textContent='文法記事が登録されていません。'}
 if(selected()&&!lookup.has(selected())){$('status').hidden=false;$('status').textContent='指定された項目がありません。先頭の記事を表示しています。'}
 if(items.some(x=>x.loadError)){$('status').hidden=false;$('status').textContent='一部の記事の読み込みに失敗しました。chapters.json の file パスを確認してください。'}
}catch(e){console.error(e);$('status').hidden=false;$('status').textContent='文法データを読み込めませんでした。Webサーバー上で開いているか確認してください。'}
