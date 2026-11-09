const $=id=>document.getElementById(id);
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
const norm=s=>String(s??'').normalize('NFKC').toLocaleLowerCase('ja');
let chapters=[],items=[],lookup=new Map(),requestCounter=0;
const selected=()=>new URL(location.href).searchParams.get('id');
const href=id=>{const u=new URL(location.href);u.searchParams.set('id',id);u.hash='';return u.pathname+u.search};
function itemLink(item){const a=node('a');a.href=href(item.id);a.dataset.id=item.id;return a}
async function read(path){const r=await fetch(new URL(path,document.baseURI),{cache:'no-cache'});if(!r.ok)throw Error(path+': HTTP '+r.status);return r.text()}
async function readJSON(path){return JSON.parse(await read(path))}
function validPath(path){return typeof path==='string'&&/^data\/articles\/[^?#\\]+\.(?:md|json)$/u.test(path)&&!path.split('/').some(s=>s==='..'||s==='.'||s==='')}
// Markdown tokenization keeps these directives literal inside code.
if(window.marked){
 window.marked.use({extensions:[{
  name:'languageText',
  level:'inline',
  start(source){return source.indexOf('{{')},
  tokenizer(source){
   const match=/^\{\{(font|text):([^{}\n]+)\}\}/.exec(source);
   if(match)return {type:'languageText',raw:match[0],mode:match[1],text:match[2]};
  },
  renderer(token){
   const script=node('span',token.text,'language-script');
   if(token.mode==='font')return script.outerHTML;
   const pair=node('ruby',undefined,'language-text');
   pair.append(script,node('rt',token.text,'romanization'));
   return pair.outerHTML;
  }
 }]});
}
document.fonts.load('1em TumRare').then(fonts=>{
 document.documentElement.dataset.languageFont=fonts.length?'ready':'failed';
}).catch(()=>{
 document.documentElement.dataset.languageFont='failed';
});
function markdownHTML(text,file){
 if(!window.marked||!window.DOMPurify)throw Error('Markdown表示ライブラリを読み込めませんでした');
 const html=window.marked.parse(text,{gfm:true,breaks:false});
 const clean=window.DOMPurify.sanitize(html);
 const template=document.createElement('template');template.innerHTML=clean;
 const base=new URL(file,document.baseURI);
 for(const img of template.content.querySelectorAll('img[src]')){
  const src=img.getAttribute('src');if(src&&!/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(src))img.setAttribute('src',new URL(src,base).href);
 }
 for(const a of template.content.querySelectorAll('a[href]')){
   const address=a.getAttribute('href')||'';
   if(address.startsWith('#'))continue;
   if(!/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(address))a.setAttribute('href',new URL(address,base).href);
   try{const u=new URL(a.getAttribute('href'),document.baseURI);if(u.protocol==='https:'||u.protocol==='http:'){a.target='_blank';a.rel='noopener noreferrer';}else a.removeAttribute('href');}catch{a.removeAttribute('href')}
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
 const activeLink=document.querySelector('#toc a[aria-current]');
 if(activeLink)activeLink.closest('details').open=true;
 const idx=items.indexOf(item);for(const [key,target,prefix] of [['prev',items[idx-1],'← '],['next',items[idx+1],'→ ']]){const link=$(key);link.hidden=!target;if(target){link.href=href(target.id);link.dataset.id=target.id;link.textContent=prefix+target.title}}
 try{
  if(typeof item.body!=='string')throw Error('記事本文がありません');
  if(request!==requestCounter)return;
  const content=node('div',undefined,'markdown-body');content.append(markdownHTML(item.body,item.file));
  a.replaceChildren(node('p',item.chapter,'eyebrow'),content);
  if(item.date)a.append(node('p','更新日: '+item.date,'muted'));
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
  const group=node('details');
  group.open=true;
  const heading=node('summary',undefined,'chapter');
  heading.append(node('span',chapter.title));
  const state=node('span',undefined,'chapter-state');
  state.setAttribute('aria-hidden','true');
  state.append(node('span','表示中','when-open'),node('span','折りたたみ中','when-closed'));
  heading.append(state);
  const list=node('div',undefined,'chapter-articles');
  for(const item of chapter.articles){
   const a=itemLink(item);
   a.textContent=item.title;
   list.append(a);
  }
  group.append(heading,list);
  $('toc').append(group);
 }
}
$('query').addEventListener('input',search);$('clear').onclick=()=>show(selected()||items[0]?.id);
$('about').onclick=()=>$('about-dialog').showModal();$('close').onclick=()=>$('about-dialog').close();
document.addEventListener('click',e=>{const a=e.target.closest('a[data-id]');if(!a||e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();show(a.dataset.id,true)});
window.addEventListener('popstate',()=>show(selected()));
window.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!$('about-dialog').open){e.preventDefault();$('query').focus()}});
try{
 const [cfg,all]=await Promise.all([readJSON('data/config.json'),readJSON('data/article-index.json')]);
 if(!Array.isArray(all))throw Error('article-index.json は配列にしてください');
 chapters=all.filter(c=>typeof c.title==='string'&&Array.isArray(c.articles));
 items=chapters.flatMap(c=>c.articles.map(x=>({...x,chapter:c.title})));
 if(items.some(x=>typeof x.id!=='string'||typeof x.title!=='string'||!validPath(x.file)))throw Error('記事のid、title、fileを確認してください');
 if(new Set(items.map(x=>x.id)).size!==items.length)throw Error('記事IDが重複しています');
 lookup=new Map(items.map(x=>[x.id,x]));
 $('brand').textContent=cfg.title||'文法書';document.title=cfg.title||'文法書';$('about-text').textContent=cfg.about||'説明は未登録です。';
 $('count').textContent=items.length+' 記事';renderTOC();
 if(items.length)await show(selected());else{$('status').hidden=false;$('status').textContent='文法記事が登録されていません。'}
 if(selected()&&!lookup.has(selected())){$('status').hidden=false;$('status').textContent='指定された項目がありません。先頭の記事を表示しています。'}
}catch(e){console.error(e);$('status').hidden=false;$('status').textContent='文法データを読み込めませんでした。Webサーバー上で開いているか確認してください。'}
