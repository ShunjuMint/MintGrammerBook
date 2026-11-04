const $=id=>document.getElementById(id);
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
const norm=s=>String(s??'').normalize('NFKC').toLocaleLowerCase('ja');
let items=[],lookup=new Map();
const selected=()=>new URL(location.href).searchParams.get('id');
const href=id=>{const u=new URL(location.href);u.searchParams.set('id',id);u.hash='';return u.pathname+u.search};
function itemLink(item){const a=node('a');a.href=href(item.id);a.dataset.id=item.id;return a}
function show(id,historyMode=false){
 const item=lookup.get(id)||items[0];if(!item)return;
 if(historyMode)history.pushState(null,'',href(item.id));
 $('query').value='';$('clear').hidden=true;$('results').hidden=true;$('article').hidden=false;
 const a=$('article');a.replaceChildren(node('p',item.chapter,'eyebrow'),node('h1',item.title),node('p',item.summary,'lead'));
 if(item.tags?.length){const box=node('div',undefined,'tags');for(const tag of item.tags)box.append(node('span',tag,'tag'));a.append(box)}
 for(const s of item.sections||[]){const section=node('section',undefined,'section');section.append(node('h2',s.title));for(const p of s.paragraphs||[])section.append(node('p',p));for(const ex of s.examples||[]){const card=node('div',undefined,'example');card.append(node('p',ex.text||'','original'));if(ex.segmented)card.append(node('p',ex.segmented,'gloss'));if(ex.gloss)card.append(node('p',ex.gloss,'gloss'));if(ex.translation)card.append(node('p',ex.translation));section.append(card)}a.append(section)}
 const related=(item.related||[]).map(id=>lookup.get(id)).filter(Boolean);if(related.length){const section=node('section',undefined,'section');section.append(node('h2','関連項目'));const box=node('div',undefined,'related');for(const ref of related){const link=itemLink(ref);link.textContent=ref.title;box.append(link)}section.append(box);a.append(section)}
 document.querySelectorAll('#toc a').forEach(link=>link.dataset.id===item.id?link.setAttribute('aria-current','page'):link.removeAttribute('aria-current'));
 const idx=items.indexOf(item);for(const [key,target,prefix] of [['prev',items[idx-1],'← '],['next',items[idx+1],'→ ']]){const link=$(key);link.hidden=!target;if(target){link.href=href(target.id);link.dataset.id=target.id;link.textContent=prefix+target.title}}
}
function search(){const q=norm($('query').value).trim();if(!q){show(selected()||items[0]?.id);return}
 $('clear').hidden=false;$('results').hidden=false;$('article').hidden=true;$('prev').hidden=true;$('next').hidden=true;
 const filtered=items.filter(x=>norm([x.title,x.chapter,x.summary,...(x.tags||[]),...(x.sections||[]).flatMap(s=>[s.title,...(s.paragraphs||[]),...(s.examples||[]).map(e=>[e.text,e.translation,e.gloss].join(' '))])].join(' ')).includes(q));
 $('result-count').textContent=filtered.length+' 件';$('matches').replaceChildren();for(const x of filtered){const a=itemLink(x);a.className='result';a.append(node('p',x.chapter),node('h3',x.title),node('p',x.summary));$('matches').append(a)}if(!filtered.length)$('matches').append(node('p','一致する文法項目はありません。','message'))}
$('query').addEventListener('input',search);$('clear').onclick=()=>show(selected());$('about').onclick=()=>$('about-dialog').showModal();$('close').onclick=()=>$('about-dialog').close();
document.addEventListener('click',event=>{const a=event.target.closest('a[data-id]');if(!a||event.defaultPrevented||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();show(a.dataset.id,true)});
window.addEventListener('popstate',()=>show(selected()));window.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!$('about-dialog').open){e.preventDefault();$('query').focus()}});
async function load(path){const r=await fetch(new URL(path,document.baseURI),{cache:'no-cache'});if(!r.ok)throw Error(path+': HTTP '+r.status);return r.json()}
try{const [cfg,data]=await Promise.all([load('data/config.json'),load('data/grammar.json')]);if(!Array.isArray(data))throw Error('grammar.json は配列にしてください');items=data.filter(x=>typeof x.id==='string'&&typeof x.title==='string'&&typeof x.chapter==='string');lookup=new Map(items.map(x=>[x.id,x]));$('brand').textContent=cfg.title||'文法書';document.title=cfg.title||'文法書';$('about-text').textContent=cfg.about||'説明は未登録です。';$('count').textContent=items.length+' 項目';let chapter='';for(const x of items){if(x.chapter!==chapter){chapter=x.chapter;$('toc').append(node('div',chapter,'chapter'))}const a=itemLink(x);a.textContent=x.title;$('toc').append(a)}if(items.length)show(selected());else{$('status').hidden=false;$('status').textContent='文法項目が登録されていません。'}if(selected()&&!lookup.has(selected())){$('status').hidden=false;$('status').textContent='指定された項目はありません。先頭の項目を表示しています。'}}catch(e){console.error(e);$('status').hidden=false;$('status').textContent='文法データを読み込めませんでした。Webサーバー上で開いているか確認してください。'}
