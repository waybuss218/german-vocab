const DATA=null;
const EMBEDDED_DATA=window.__VOCAB_DATA__;
const MODULES=[
 {id:'meaning',name:'词义',short:'词义'},
 {id:'irregular_verb',name:'不规则动词变位',short:'动词变位'},
 {id:'preposition_collocation',name:'固定搭配 / 介词搭配',short:'固定搭配'},
 {id:'synonym_near_synonym_antonym',name:'同义 / 近义 / 反义',short:'同反义'},
 {id:'same_root_prefix',name:'同根词 / 前缀词辨析',short:'词形辨析'}
];
const STORE='de-vocab-final-v3';
const USER_STORE_PREFIX='de-vocab-final-v3-user:';
const LEGACY_OWNER='de-vocab-final-v3-legacy-owner';
let ACTIVE_STORE=STORE;
let DB=null,state=loadState(STORE),session=null,SB=null,AUTH_SESSION=null,cloudReady=false,cloudSyncTimer=null;
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function blank(){return {schema_version:7,modules:{},history:[],unknown:[],lastSeen:{},settings:{},module_work:{},error_reports:{}}}
function loadState(storeKey=ACTIVE_STORE){try{const raw=localStorage.getItem(storeKey);if(!raw)return blank();const x={...blank(),...JSON.parse(raw)};x.modules=x.modules||{};x.history=x.history||[];x.unknown=x.unknown||[];x.module_work=x.module_work||{};x.error_reports=x.error_reports||{};return migrateState(x)}catch{return blank()}}
function userStoreKey(uid){return USER_STORE_PREFIX+uid}
function activateUserState(uid){
 const k=userStoreKey(uid);
 const existing=localStorage.getItem(k);
 if(!existing){
   const legacy=localStorage.getItem(STORE);
   const owner=localStorage.getItem(LEGACY_OWNER);
   // The old app used one global localStorage bucket. Claim it only once for the
   // first authenticated account; never copy it into later accounts.
   if(legacy && !owner){localStorage.setItem(LEGACY_OWNER,uid);localStorage.setItem(k,legacy)}
 }
 ACTIVE_STORE=k;
 state=loadState(k);
}
function migrateState(s){
 s.schema_version=Math.max(Number(s.schema_version||0),7);
 s.error_reports=s.error_reports||{};
 // Old module ids remain stable, so old learning records are retained. The new module has its own key.
 s.modules=s.modules||{};s.module_work=s.module_work||{};s.history=s.history.map(h=>({...h,id:h.id||crypto.randomUUID(),actual_answer:h.actual_answer??'',standard_answer:h.standard_answer??'',error_count:h.error_count||1,status:h.status||'open'}));
 s.unknown=s.unknown.map(u=>({...u,id:u.id||crypto.randomUUID()}));
 return s;
}
function save(){localStorage.setItem(STORE,JSON.stringify(state))}
function key(stage,m){return `${stage}:${m}`}
function entriesFor(stage,m){return (DB.entries||[]).filter(e=>e.source?.stage?.includes(stage)&&eligible(e,m))}
function eligible(e,m){
 if(m==='meaning')return true;
 if(m==='irregular_verb')return !!(e.module_eligibility?.irregular_verb||extractForms(e));
 if(m==='preposition_collocation')return !!collocation(e);
 if(m==='synonym_near_synonym_antonym')return !!(e.module_eligibility?.synonym_near_synonym_antonym||relationTarget(e));
 if(m==='same_root_prefix')return !!(e.module_eligibility?.same_root_prefix||e.relationships?.prefix_structure_candidate);
 return false;
}
function clean(s){return String(s||'').toLowerCase().replace(/[\s“”"'’‘。！？、：:；;,.，()（）\[\]{}]/g,'')}
function meaning(e){return e.lexical?.meaning_source||e.meaning||parseMeaning(e.source?.exact_source_text)||'原书来源文本未结构化提取释义'}
function parseMeaning(t){let s=String(t||'').replace(/^\s*\d+[.]?\s*/,'');s=s.replace(/^(?:Vi\.|Vt\.|Adj\.|Adv\.|N\.|D\.)\s*/,'');s=s.split(/\n(?:近义词|同义词|反义词|Beispiel|例)/)[0];return s.replace(/[”“]/g,'').trim()}
function extractForms(e){
 if(e.lexical?.irregular_forms_source?.length){const f=e.lexical.irregular_forms_source[0];return Array.isArray(f)?f.join('; '):String(f)}
 const t=e.source?.exact_source_text||'';
 const m=t.match(/\(([^)]*(?:ging|gingen|kam|kamen|war|waren|wurde|wurden|hielt|nahm|gab|sah|fand|ließ|ließ|trug|brachte|fuhr|lief|schlug|sprach|schrieb|las|aß|getan|gegangen|gekommen|genommen|gebracht|gehalten|gefunden|gelassen|getragen|gefahren|gelaufen|geschlagen|gesprochen|geschrieben|gelesen|gegessen)[^)]*)\)/i);
 return m?m[1]:'';
}
function relationTarget(e){const t=e.source?.exact_source_text||'';return (t.match(/(?:同义词|近义词|反义词)\s*:\s*([^\n]+)/)||[])[1]||''}
function collocation(e){
 if(e.collocation?.preposition){const c={...e.collocation}; c.base=c.base||stripPrep(e.headword,c.preposition); c.meaning=c.meaning||meaning(e); return c;}
 if(e.preposition_collocation){const c=typeof e.preposition_collocation==='string'?{preposition:e.preposition_collocation}: {...e.preposition_collocation}; c.base=c.base||stripPrep(e.headword,c.preposition); c.meaning=c.meaning||meaning(e); return c;}
 const t=e.source?.exact_source_text||'';
 const m=t.match(/\b(auf|an|aus|bei|durch|für|gegen|in|mit|nach|ohne|über|um|unter|von|vor|zu|zwischen)\s+(?:[ADGN]\.|A\.|D\.)/i);
 if(!m)return null;
 const caseMatch=t.match(new RegExp(m[1].replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s+([ADGN]\.)','i'));
 return {preposition:m[1],case:caseMatch?.[1]||'',meaning:meaning(e),base:stripPrep(e.headword,m[1]),source:true};
}
function stripPrep(headword,prep){
 let h=String(headword||'').trim();
 if(!prep)return h;
 const re=new RegExp('\\s+'+String(prep).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:\\s+[ADGN]\\.)?$','i');
 return h.replace(re,'').trim()||h;
}
function status(stage,m){return state.modules[key(stage,m)]?.status||'available'}
function stats(stage,m){
 const all=entriesFor(stage,m);
 const ids=new Set(all.map(e=>e.id));
 const k=key(stage,m),mod=state.modules[k]||{};
 const seenIds=new Set(mod.seenIds||[]);
 state.history.filter(h=>Number(h.stage)===Number(stage)&&h.module===m).forEach(h=>seenIds.add(h.item_id));
 const errs=state.history.filter(h=>Number(h.stage)===Number(stage)&&h.module===m);
 const uniqueErr=new Set(errs.map(h=>h.item_id));
 const corrected=new Set(mod.correctedIds||[]);
 errs.filter(h=>h.status==='corrected').forEach(h=>corrected.add(h.item_id));
 return {total:all.length,seen:[...seenIds].filter(id=>ids.has(id)).length,corrected:[...corrected].filter(id=>ids.has(id)).length,errors:uniqueErr.size};
}
function nav(active){return `<nav>${[['home','学习路径'],['errors','错误本'],['review','长期复习']].map(([id,n])=>`<button class="nav ${active===id?'active':''}" data-view="${id}">${n}${id==='errors'?` <b>${state.history.length}</b>`:''}</button>`).join('')}</nav>`}
function layout(title,sub,active,body){$('#app').innerHTML=`<header><div><div class="brand">德福考前必备-词汇 复习</div></div><div class="header-right">${nav(active)}${accountNav()}</div></header><main>${body}</main>`;bindNav();$('#logoutBtn')?.addEventListener('click',logout)}
async function logout(){const btn=$('#logoutBtn');if(btn)btn.disabled=true;try{if(cloudSyncTimer)clearTimeout(cloudSyncTimer);if(SB)await SB.auth.signOut();}catch(e){console.warn('Logout failed:',e);showToast('退出登录失败，请重试。');if(btn)btn.disabled=false;return}cloudReady=false;AUTH_SESSION=null;ACTIVE_STORE=STORE;state=blank();authShell('已退出当前账号。')}
function renderHome(){const learned=new Set(state.history.map(x=>x.item_id)).size;const total=(DB.entries||[]).length;layout('','11 个部分 · 每部分 5 个模块 · 全部开放','home',`<section class="hero"><div><div class="kicker">VOCABULARY REVIEW</div><h1>德福考前必备-词汇 复习</h1></div><div class="stats"><div><strong>${learned} / ${total}</strong><span>已过单词</span></div><div><strong>${state.unknown.length}</strong><span>首次未知</span></div></div></section><section class="path">${DB.stages.map((s,i)=>stageCard(s,i+1)).join('')}</section>`)}
function stageCard(s,n){return `<article class="stage"><div class="stage-head"><div><span class="stage-no">PART ${n}</span><h2>第 ${n} 部分</h2></div><span class="pages">P${s.printed_page_start}–${s.printed_page_end}</span></div><div class="nodes">${MODULES.map((m,i)=>{const st=status(n,m.id),x=stats(n,m.id);return `<button class="node ${st}" data-stage="${n}" data-module="${m.id}"><span class="circle">${st==='done'?'✓':i+1}</span><span class="node-text"><b>${m.short}</b><small>已过 ${x.seen} / ${x.total}</small><small>已改正 ${x.corrected} / 累计错题 ${x.errors}</small></span></button>`}).join('')}</div></article>`}
function bindNav(){document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>b.dataset.view==='home'?renderHome():b.dataset.view==='errors'?renderErrors():renderReview());document.querySelectorAll('.node').forEach(b=>b.onclick=()=>start(+b.dataset.stage,b.dataset.module))}
function start(stage,m){
 const all=entriesFor(stage,m);
 if(!all.length){showToast('这个模块暂时没有对应的结构化数据；等正式数据接入后会自动出现。');return}
 const k=key(stage,m),old=state.modules[k]||{},work=state.module_work[k],report=state.error_reports[k];
 // 错误报告是独立的持久状态：只要用户还没有主动点击“开始针对性训练”，
 // 从学习路径再次进入时永远先回到错误报告，而不是直接进入强化题目。
 if(report?.active && (report.items||[]).length){
   const reportItems=(report.items||old.pending||[]).map(id=>all.find(e=>e.id===id)).filter(Boolean);
   session={stage,m,all,phase:'reinforce',items:reportItems,idx:0,errors:[],round:2,selected:null,errorHistoryIds:report.errorHistoryIds||[]};
   showErrorTable(report.title||'错误问题汇集表');return;
 }
 if(work?.show_table){session={stage,m,all,phase:'reinforce',items:(work.items||old.pending||[]).map(id=>all.find(e=>e.id===id)).filter(Boolean),idx:0,errors:[],round:2,selected:null,errorHistoryIds:work.errorHistoryIds||[]};showErrorTable(work.table_title||'错误问题汇集表');return}
 let phase=work?.phase||((old.status==='warn')?'reinforce':'first');
 let items=(work?.items||[]).map(id=>all.find(e=>e.id===id)).filter(Boolean);
 if(!items.length)items=phase==='reinforce'?(old.pending||[]).map(id=>all.find(e=>e.id===id)).filter(Boolean):[...all];
 session={stage,m,all,phase,items,idx:Math.min(work?.idx||0,Math.max(0,items.length-1)),errors:[],round:work?.round||(phase==='first'?1:phase==='reinforce'?2:3),selected:null,errorHistoryIds:[]};
 saveWork();renderQuestion();
}
function saveWork(){if(!session||!session.stage)return;const k=key(session.stage,session.m);state.module_work[k]={phase:session.phase,round:session.round,items:session.items.map(e=>e.id),idx:session.idx,updated_at:new Date().toISOString()};save()}
function qHeader(){return `<div class="study-top"><button class="back" id="back">← 学习路径</button><div class="study-name">第 ${session.stage} 部分 · ${MODULES.find(m=>m.id===session.m)?.name}</div><div class="count">${session.idx+1} / ${session.items.length}</div></div>`}
function renderQuestion(){if(session.idx>=session.items.length){finish();return}const e=session.items[session.idx];const pct=session.idx/session.items.length*100;let prompt='',content='';if(session.m==='meaning'){if(session.phase==='first'||session.phase==='retest'){prompt='德语 → 中文';content=`<div class="word">${esc(e.headword)}</div><div class="choice-row"><button class="choice" id="unknown">我不知道</button><button class="choice primary" id="know">我知道</button></div><div id="inputWrap" class="hidden input-row"><input id="answer" placeholder="输入中文释义" autocomplete="off"><button class="primary" id="submit">提交</button></div>`}else{prompt='中文 → 德语';content=`<div class="meaning">${esc(meaning(e))}</div><div class="input-row"><input id="answer" placeholder="输入德语词" autocomplete="off"><button class="primary" id="submit">提交</button></div>`}}
 else if(session.m==='irregular_verb'){prompt='主动写出 Präteritum 和 Partizip II';content=`<div class="word">${esc(e.headword)}</div><div class="source">${esc(extractForms(e)||e.source?.exact_source_text||'')}</div><div class="input-row"><input id="answer" placeholder="例如：hielt; festgehalten" autocomplete="off"><button class="primary" id="submit">提交</button></div>`}
 else if(session.m==='preposition_collocation'){const c=collocation(e);prompt='固定搭配 · 填入介词';content=`<div class="word">${esc(c?.base||e.headword)}</div><div class="meaning">中文：${esc(c?.meaning||meaning(e))}</div><div class="collocation-box">${esc(c?.base||e.headword)} <strong>___</strong>${c?.case?` <span>+ ${esc(c.case)}</span>`:''}</div><div class="input-row"><input id="answer" placeholder="填写介词，例如：mit" autocomplete="off"><button class="primary" id="submit">提交</button></div>`}
 else if(session.m==='synonym_near_synonym_antonym'){prompt='根据原书明确给出的关系选择';const target=relationTarget(e);const rel=(e.relationships?.source_relation_labels||[])[0]||'原书关系';const opts=relationOptions(e,target);content=`<div class="word">${esc(e.headword)}</div><div class="relation">${esc(rel)}</div><div class="mcq">${opts.map((o,i)=>`<button class="option" data-i="${i}">${esc(o)}</button>`).join('')}</div><button class="primary" id="submit" disabled>提交</button>`}
 else{prompt='在语境中判断最合适的词形';content=`<div class="word">${esc(e.headword)}</div><div class="context">${esc(contextFor(e))}</div><div class="mcq">${prefixOptions(e).map((o,i)=>`<button class="option" data-i="${i}">${esc(o)}</button>`).join('')}</div><button class="primary" id="submit" disabled>提交</button>`}
 $('#app').innerHTML=`<div class="study"><header>${qHeader()}</header><div class="progress"><span style="width:${pct}%"></span></div><main class="study-main"><div class="round-label">${session.phase==='first'?'第一轮':session.phase==='reinforce'?'强化轮':session.phase==='retest'?'全量重测':'长期复习'}</div><section class="card"><div class="eyebrow">${prompt}</div>${content}</section><div class="source-foot">原书 P.${e.source?.printed_page||''} · ${esc(e.id)}</div></main></div>`;
 $('#back').onclick=()=>{saveWork();renderHome()};$('#know')?.addEventListener('click',()=>{$('#inputWrap').classList.remove('hidden');$('#know').classList.add('hidden');$('#unknown').classList.add('hidden');$('#answer').focus()});$('#unknown')?.addEventListener('click',()=>answer('',true));$('#submit')?.addEventListener('click',()=>answer($('#answer')?.value||'',false));document.querySelectorAll('.option').forEach(o=>o.onclick=()=>{document.querySelectorAll('.option').forEach(x=>x.classList.remove('selected'));o.classList.add('selected');session.selected=+o.dataset.i;$('#submit').disabled=false});$('#answer')?.addEventListener('keydown',e=>{if(e.key==='Enter')$('#submit')?.click()})}
function relationOptions(e,target){const pool=DB.entries.filter(x=>x.id!==e.id&&eligible(x,'synonym_near_synonym_antonym')).map(x=>x.headword);return shuffle([target||'原书关系未结构化',...pool.slice(0,8)]).slice(0,4)}
function prefixOptions(e){const pool=DB.entries.filter(x=>x.id!==e.id&&eligible(x,'same_root_prefix')).map(x=>x.headword);return shuffle([e.headword,...pool.slice(0,8)]).slice(0,4)}
function contextFor(e){return e.context?.sentence||e.example?.de||`请根据原书提供的词义和同根/前缀关系判断：${meaning(e)}`}
function shuffle(a){return [...a].sort(()=>Math.random()-.5)}
function answer(raw,unknown){
 const e=session.items[session.idx];
 if(session.m==='meaning'&&!unknown&&(session.phase==='first'||session.phase==='retest')){showMeaningEvaluation(e,raw);return}
 let ok=unknown?false:grade(e,raw);
 if(session.m.includes('synonym')||session.m==='same_root_prefix'){const opts=document.querySelectorAll('.option');const picked=session.selected==null?'':opts[session.selected]?.textContent.trim();ok=grade(e,picked);raw=picked}
 record(e,raw,ok,unknown);
 markSeen(e);
 if(!ok)session.errors.push(e.id); else markCorrected(e);
 showAnswerFeedback(e,raw,ok,unknown);
}
function markSeen(e){const k=key(session.stage,session.m);const mod=state.modules[k]||{};mod.seenIds=[...new Set([...(mod.seenIds||[]),e.id])];state.modules[k]=mod;save()}
function correctAnswerFor(e){if(session.m==='meaning')return session.phase==='reinforce'?e.headword:meaning(e);if(session.m==='irregular_verb')return extractForms(e);if(session.m==='preposition_collocation')return collocation(e)?.preposition||'';if(session.m==='synonym_near_synonym_antonym')return relationTarget(e)||'原书关系未结构化';return e.headword}
function showAnswerFeedback(e,raw,ok,unknown){const a=correctAnswerFor(e),title=unknown?'你还不知道':ok?'回答正确':'你答错了',user=unknown?'我不知道':(raw||'（未填写）'),card=document.querySelector('.card');card.innerHTML=`<div class="feedback ${ok?'feedback-ok':'feedback-wrong'}"><div class="feedback-mark">${ok?'✓':unknown?'?':'×'}</div><div class="feedback-title">${esc(title)}</div><p class="feedback-desc">${unknown?'先记住正确答案。':ok?'这一题判断正确。':'这道题没有答对，正确答案如下。'}</p>${!ok||unknown?`<div class="feedback-answer"><span>正确答案</span><strong>${esc(a)}</strong></div><div class="feedback-your"><span>你的答案</span><div>${esc(user)}</div></div>`:''}<button class="primary feedback-next" id="feedbackNext">${session.idx+1<session.items.length?'下一题':'查看结果'}</button></div>`;$('#feedbackNext').onclick=()=>{session.idx++;session.selected=null;saveWork();renderQuestion()}}
function showMeaningEvaluation(e,raw){const card=document.querySelector('.card');card.innerHTML=`<div class="eyebrow">请按“意思”判断，而不是按原书措辞判断</div><div class="word">${esc(e.headword)}</div><div class="meaning-eval"><h3>你的答案</h3><div class="your-answer">${esc(raw)}</div><div class="standard"><b>原书释义</b><br>${esc(meaning(e))}</div><div class="eval-buttons"><button class="ok" id="meaningCorrect">意思正确</button><button class="partial" id="meaningPartial">基本正确但不完整</button><button class="wrong" id="meaningWrong">意思错误</button></div><div class="eval-note">不要求和书上的中文表述逐字一致；意思相同即可。基本正确但不完整仍进入强化。</div></div>`;$('#meaningCorrect').onclick=()=>finishMeaningEvaluation(e,raw,true);$('#meaningPartial').onclick=()=>finishMeaningEvaluation(e,raw,false);$('#meaningWrong').onclick=()=>finishMeaningEvaluation(e,raw,false)}
function finishMeaningEvaluation(e,raw,ok){record(e,raw,ok,false);markSeen(e);if(!ok)session.errors.push(e.id);else markCorrected(e);session.idx++;saveWork();renderQuestion()}
function grade(e,a){if(session.m==='meaning'){if(session.round===2)return clean(a)===clean(e.headword);const t=meaning(e);return clean(a)===clean(t)||clean(t).includes(clean(a))&&clean(a).length>2}if(session.m==='irregular_verb')return clean(a).replace(/[，,；;]/g,' ')===clean(extractForms(e)).replace(/[，,；;]/g,' ');if(session.m==='preposition_collocation')return clean(a)===clean(collocation(e)?.preposition||'');if(session.m==='synonym_near_synonym_antonym')return clean(a)===clean(relationTarget(e));return clean(a)===clean(e.headword)}
function record(e,a,ok,unknown){
 const now=new Date().toISOString();state.lastSeen[e.id]=now;
 if(!ok){const rec={id:crypto.randomUUID(),item_id:e.id,stage:session.stage,printed_page:e.source?.printed_page,module:session.m,date:now,actual_answer:a,standard_answer:correctAnswerFor(e),error_count:1,status:'open',first_test_unknown:unknown};state.history.push(rec);session.errorHistoryIds=session.errorHistoryIds||[];session.errorHistoryIds.push(rec.id);}
 if(unknown)state.unknown.push({id:crypto.randomUUID(),item_id:e.id,stage:session.stage,module:session.m,date:now});save()
}
function markCorrected(e){const prior=state.history.filter(h=>h.item_id===e.id&&h.module===session.m&&h.status!=='corrected');if(prior.length)prior.forEach(h=>h.status='corrected');save()}
function finish(){
 const k=key(session.stage,session.m);
 if(session.phase==='first'){
  state.modules[k]={...(state.modules[k]||{}),status:session.errors.length?'warn':'available',pending:[...new Set(session.errors)],last_round:1};
  if(session.errors.length){state.module_work[k]={phase:'reinforce',round:2,items:[...new Set(session.errors)],idx:0,show_table:true,table_title:'第一轮完成',errorHistoryIds:session.errorHistoryIds||[],updated_at:new Date().toISOString()};state.error_reports[k]={active:true,items:[...new Set(session.errors)],title:'第一轮完成',errorHistoryIds:session.errorHistoryIds||[],updated_at:new Date().toISOString()};save();showErrorTable('第一轮完成')}
  else{state.error_reports[k]={active:false};session.phase='retest';session.round=3;session.items=[...session.all];session.idx=0;session.errors=[];saveWork();summary('第一轮完成','没有错误，现在进行当前模块的全量重测。','开始全量重测')}
 }else if(session.phase==='reinforce'){
  if(session.errors.length){state.modules[k]={...(state.modules[k]||{}),status:'warn',pending:[...new Set(session.errors)],last_round:2};state.module_work[k]={phase:'reinforce',round:2,items:[...new Set(session.errors)],idx:0,show_table:true,table_title:'强化仍有错误',errorHistoryIds:session.errorHistoryIds||[],updated_at:new Date().toISOString()};state.error_reports[k]={active:true,items:[...new Set(session.errors)],title:'强化仍有错误',errorHistoryIds:session.errorHistoryIds||[],updated_at:new Date().toISOString()};save();showErrorTable('强化仍有错误')}
  else{state.modules[k]={...(state.modules[k]||{}),status:'available',pending:[],last_round:2};session.phase='retest';session.round=3;session.items=[...session.all];session.idx=0;session.errors=[];saveWork();summary('强化完成','现在重新测试当前模块的全部项目。','开始全量重测')}
 }else if(session.phase==='retest'){
  if(session.errors.length){state.modules[k]={...(state.modules[k]||{}),status:'warn',pending:[...new Set(session.errors)],last_round:3};state.module_work[k]={phase:'reinforce',round:2,items:[...new Set(session.errors)],idx:0,show_table:true,table_title:'全量重测未通过',errorHistoryIds:session.errorHistoryIds||[],updated_at:new Date().toISOString()};state.error_reports[k]={active:true,items:[...new Set(session.errors)],title:'全量重测未通过',errorHistoryIds:session.errorHistoryIds||[],updated_at:new Date().toISOString()};save();showErrorTable('全量重测未通过')}
  else{state.modules[k]={...(state.modules[k]||{}),status:'done',pending:[],last_round:3};state.module_work[k]=null;state.error_reports[k]={active:false};save();summary('模块完成','最近一次完整测试达到 100%。','返回学习路径')}
 }
}
function errorRowsFor(stage,m){return state.history.filter(h=>Number(h.stage)===Number(stage)&&h.module===m).map(h=>({...h,e:DB.entries.find(x=>x.id===h.item_id)})).filter(x=>x.e)}
function showErrorTable(title){
 const k=key(session.stage,session.m),mod=state.modules[k]||{};
 const pending=new Set(mod.pending||[]);
 const work=state.module_work[k]||{};
 let rows=[];
 const historyIds=new Set(work.errorHistoryIds||[]);
 if(historyIds.size) rows=state.history.filter(r=>historyIds.has(r.id));
 if(!rows.length) rows=state.history.filter(r=>Number(r.stage)===Number(session.stage)&&r.module===session.m&&pending.has(r.item_id)&&r.status!=='corrected');
 rows=rows.filter(r=>r.status!=='corrected');
 $('#app').innerHTML=`<div class="summary error-summary"><div class="summary-card wide"><div class="kicker">错误问题汇集表</div><h1>${esc(title)}</h1><div class="error-table"><div class="error-head"><span>单词本身</span><span>中文意思</span><span>自己写错的是什么</span></div>${rows.length?rows.map(r=>{const e=DB.entries.find(x=>x.id===r.item_id);return `<div class="error-row"><span><b>${esc(e?.headword||r.item_id)}</b><small>P.${e?.source?.printed_page||r.printed_page||''}</small></span><span>${esc(e?meaning(e):r.standard_answer)}</span><span>${esc(r.first_test_unknown?'我不知道':r.actual_answer||'（未填写）')}</span></div>`}).join(''):'<div class="error-empty">当前没有需要强化的问题。</div>'}</div><button class="primary" id="startTargeted">开始针对性中文 → 德语训练</button><button class="text-btn" id="home">回到学习路径</button></div></div>`;
 $('#startTargeted').onclick=()=>{state.error_reports[k]={...(state.error_reports[k]||{}),active:false,started_at:new Date().toISOString()};state.module_work[k]={...(state.module_work[k]||{}),phase:'reinforce',round:2,items:[...pending],idx:0,show_table:false,errorHistoryIds:(state.module_work[k]?.errorHistoryIds||[]),updated_at:new Date().toISOString()};save();session.phase='reinforce';session.round=2;session.items=[...pending].map(id=>session.all.find(e=>e.id===id)).filter(Boolean);session.idx=0;session.errors=[];session.selected=null;renderQuestion()};
 $('#home').onclick=()=>{save();renderHome()};
}
function summary(title,text,action){$('#app').innerHTML=`<div class="summary"><div class="summary-card"><div class="check">${title==='模块完成'?'✓':'↗'}</div><div class="kicker">PROGRESS SAVED</div><h1>${esc(title)}</h1><p>${esc(text)}</p><button class="primary" id="next">${esc(action)}</button><button class="text-btn" id="home">回到学习路径</button></div></div>`;$('#next').onclick=()=>action==='返回学习路径'?renderHome():renderQuestion();$('#home').onclick=renderHome}
function renderErrors(){const rows=[...state.history].sort((a,b)=>a.printed_page-b.printed_page||a.date.localeCompare(b.date));const grouped=[...new Set(rows.map(r=>r.stage))].sort((a,b)=>a-b);layout('','按 11 个部分整理的永久错误历史','errors',`<section class="panel"><div class="panel-head"><div><h2>错误本</h2><p>${rows.length} 条永久历史错误 · 首次未知 ${state.unknown.length} 条</p></div></div>${grouped.map(stage=>{const ids=[...new Set(rows.filter(r=>Number(r.stage)===Number(stage)).map(r=>r.item_id))];return `<details class="error-section" open><summary>第 ${stage} 部分 · ${ids.length} 个词条</summary>${ids.map(id=>wordErrorCard(stage,id)).join('')}</details>`}).join('')||'<div class="empty">还没有错误记录。</div>'}</section>`)}
function wordErrorCard(stage,id){const e=DB.entries.find(x=>x.id===id),hist=state.history.filter(h=>Number(h.stage)===Number(stage)&&h.item_id===id);if(!e)return '';const c=collocation(e),rel=relationTarget(e),formsText=extractForms(e);return `<article class="word-card"><div class="word-card-head"><h3>${esc(e.headword)}</h3><span>P.${esc(e.source?.printed_page||'')}</span></div><div class="metadata"><span><b>中文意思：</b>${esc(meaning(e))}</span>${c?`<span><b>介词搭配：</b>${esc(c.base||e.headword)} ${esc(c.preposition)}${c.case?` + ${esc(c.case)}`:''}</span>`:''}${formsText?`<span><b>变位：</b>${esc(formsText)}</span>`:''}${rel?`<span><b>书中关系：</b>${esc(rel)}</span>`:''}</div><div class="history-list">${hist.map(h=>`<div class="history-item"><span>${esc(MODULES.find(m=>m.id===h.module)?.name||h.module)}</span><time>${new Date(h.date).toLocaleString()}</time><span>${h.first_test_unknown?'首次未知':'答错'} · 你的答案：${esc(h.actual_answer||'我不知道')} · 标准答案：${esc(h.standard_answer)}</span><em>${h.status==='corrected'?'已改正':'待强化'}</em></div>`).join('')}</div></article>`}
function renderReview(){const freq={};state.history.forEach(h=>freq[h.item_id]=(freq[h.item_id]||0)+1);const ids=Object.keys(freq).sort((a,b)=>freq[b]-freq[a]);const pool=ids.map(id=>DB.entries.find(e=>e.id===id)).filter(Boolean);layout('','跨 11 个部分、跨模块的全局复习池','review',`<section class="review-hero"><div class="kicker">GLOBAL REVIEW</div><h1>${pool.length} 个项目可进入长期复习</h1><p>优先覆盖历史错误；以后再加入最近错误、长期未复习和随机正确项的权重。</p>${pool.length?'<button class="primary" id="reviewStart">开始复习</button>':'<div class="empty">完成一些学习后，这里会自动形成全局复习池。</div>'}</section>`);$('#reviewStart')?.addEventListener('click',()=>{session={stage:0,m:'meaning',all:pool,items:shuffle(pool),phase:'review',round:3,idx:0,errors:[],selected:null};renderQuestion()})}
function showToast(t){const x=document.createElement('div');x.className='toast';x.textContent=t;document.body.appendChild(x);setTimeout(()=>x.remove(),2600)}
function supabaseConfigured(){return window.SUPABASE_CONFIG&&window.SUPABASE_CONFIG.url&&window.SUPABASE_CONFIG.publishableKey&&!window.SUPABASE_CONFIG.publishableKey.includes('PASTE_YOUR_')}
function passwordField(id,label,autocomplete,placeholder){return `<div class="password-field"><input id="${id}" type="password" autocomplete="${autocomplete}" placeholder="${placeholder}"><button type="button" class="password-toggle" data-password-target="${id}" aria-label="显示密码" title="显示密码"><span class="eye eye-open" aria-hidden="true"></span></button></div>`}
function authShell(message='',initialMode='login'){DB=DB||EMBEDDED_DATA;$('#app').innerHTML=`<div class="auth-screen"><div class="auth-card"><div class="kicker">DEUTSCH VOCAB</div><h1>登录你的学习账号</h1><p class="auth-sub">登录后，学习进度、错误本和长期复习记录会保存到云端。</p><div class="auth-tabs"><button class="auth-tab ${initialMode==='login'?'active':''}" id="loginTab">登录</button><button class="auth-tab ${initialMode==='signup'?'active':''}" id="signupTab">注册</button></div><div id="authFields"></div><button class="primary auth-submit" id="authSubmit">${initialMode==='login'?'登录':'注册'}</button><div class="auth-message" id="authMessage">${esc(message)}</div><p class="auth-note">使用同一个账号登录，就可以在不同设备继续学习。</p></div></div>`;let mode=initialMode;const fields=()=>{if(mode==='login')return `<label>邮箱</label><input id="authEmail" type="email" autocomplete="email" placeholder="你的邮箱">${passwordField('authPassword','密码','current-password','至少 6 位')}<button type="button" class="forgot-link" id="forgotPassword">忘记密码？</button>`;return `<label>邮箱</label><input id="authEmail" type="email" autocomplete="email" placeholder="你的邮箱">${passwordField('authPassword','密码','new-password','至少 6 位')}<label>确认密码</label>${passwordField('authPasswordConfirm','确认密码','new-password','再次输入密码')}`};const renderFields=()=>{$('#authFields').innerHTML=fields();bindPasswordToggles();$('#forgotPassword')?.addEventListener('click',()=>forgotPasswordShell())};renderFields();const tab=m=>{mode=m;$('#loginTab').classList.toggle('active',m==='login');$('#signupTab').classList.toggle('active',m==='signup');$('#authSubmit').textContent=m==='login'?'登录':'注册';$('#authMessage').textContent='';renderFields()};$('#loginTab').onclick=()=>tab('login');$('#signupTab').onclick=()=>tab('signup');$('#authSubmit').onclick=async()=>{const email=$('#authEmail').value.trim(),password=$('#authPassword').value;const confirm=$('#authPasswordConfirm')?.value;if(!email||password.length<6){$('#authMessage').textContent='请输入邮箱和至少 6 位密码。';return}if(mode==='signup'&&password!==confirm){$('#authMessage').textContent='两次输入的密码不一致。';return}$('#authSubmit').disabled=true;try{if(mode==='login'){const r=await SB.auth.signInWithPassword({email,password});if(r.error)throw r.error;if(!r.data.session)throw new Error('登录没有建立有效会话，请重试。');await afterLogin(r.data.session)}else{const r=await SB.auth.signUp({email,password,options:{emailRedirectTo:verificationRedirect()}});if(r.error)throw r.error;if(r.data.user?.identities?.length===0){$('#authMessage').textContent='该邮箱已注册，请直接登录。';return}if(!r.data.session){$('#authMessage').textContent='注册成功。请打开邮箱中的确认邮件完成验证。';}else await afterLogin(r.data.session)}}catch(e){const msg=String(e?.message||'操作失败，请重试。');if(/already registered|already exists|user already registered/i.test(msg))$('#authMessage').textContent='该邮箱已注册，请直接登录。';else if(/invalid login credentials/i.test(msg))$('#authMessage').textContent='邮箱或密码不正确。';else if(/email not confirmed/i.test(msg))$('#authMessage').textContent='邮箱还没有完成验证，请先点击确认邮件中的链接。';else $('#authMessage').textContent=msg}finally{$('#authSubmit').disabled=false}}}
function bindPasswordToggles(){document.querySelectorAll('.password-toggle').forEach(btn=>btn.onclick=()=>{const input=document.getElementById(btn.dataset.passwordTarget);if(!input)return;const visible=input.type==='text';input.type=visible?'password':'text';btn.setAttribute('aria-label',visible?'显示密码':'隐藏密码');btn.title=visible?'显示密码':'隐藏密码';btn.classList.toggle('is-visible',!visible)})}
function verificationRedirect(){return `${window.location.origin}${window.location.pathname}?verified=1`}
async function forgotPasswordShell(message=''){DB=DB||EMBEDDED_DATA;$('#app').innerHTML=`<div class="auth-screen"><div class="auth-card"><div class="kicker">PASSWORD RESET</div><h1>找回密码</h1><p class="auth-sub">输入注册邮箱，我们会发送密码重置邮件。</p><label>邮箱</label><input id="resetEmail" type="email" autocomplete="email" placeholder="你的邮箱"><button class="primary auth-submit" id="sendReset">发送重置邮件</button><button class="text-btn" id="backLogin">← 返回登录</button><div class="auth-message" id="authMessage">${esc(message)}</div></div></div>`;$('#backLogin').onclick=()=>authShell();$('#sendReset').onclick=async()=>{const email=$('#resetEmail').value.trim();if(!email){$('#authMessage').textContent='请输入注册邮箱。';return}$('#sendReset').disabled=true;try{const r=await SB.auth.resetPasswordForEmail(email,{redirectTo:passwordResetRedirect()});if(r.error)throw r.error;$('#authMessage').textContent='重置邮件已发送，请检查邮箱。'}catch(e){$('#authMessage').textContent=e?.message||'发送失败，请重试。'}finally{$('#sendReset').disabled=false}}}
function passwordResetRedirect(){return `${window.location.origin}${window.location.pathname}?reset=1`}
function resetPasswordShell(message=''){DB=DB||EMBEDDED_DATA;$('#app').innerHTML=`<div class="auth-screen"><div class="auth-card"><div class="kicker">PASSWORD RESET</div><h1>设置新密码</h1><p class="auth-sub">请输入新的登录密码。</p>${passwordField('newPassword','新密码','new-password','至少 6 位')}${passwordField('newPasswordConfirm','确认密码','new-password','再次输入密码')}<button class="primary auth-submit" id="saveNewPassword">保存新密码</button><div class="auth-message" id="authMessage">${esc(message)}</div></div></div>`;bindPasswordToggles();$('#saveNewPassword').onclick=async()=>{const p=$('#newPassword').value,c=$('#newPasswordConfirm').value;if(p.length<6){$('#authMessage').textContent='新密码至少需要 6 位。';return}if(p!==c){$('#authMessage').textContent='两次输入的密码不一致。';return}$('#saveNewPassword').disabled=true;try{const r=await SB.auth.updateUser({password:p});if(r.error)throw r.error;await SB.auth.signOut();authShell('密码修改成功，请登录。')}catch(e){$('#authMessage').textContent=e?.message||'修改失败，请重试。'}finally{$('#saveNewPassword').disabled=false}}}
function userId(){return AUTH_SESSION?.user?.id||null}
async function afterLogin(s){if(!s?.user?.id)throw new Error('登录会话无效，请重新登录。');AUTH_SESSION=s;activateUserState(s.user.id);cloudReady=true;await loadCloudState();renderHome()}
async function loadCloudState(){const uid=userId();if(!uid)return;try{const {data,error}=await SB.from('user_state').select('state').eq('user_id',uid).maybeSingle();if(error)throw error;const local=state;if(data?.state){const cloud=migrateState(data.state);state={...blank(),...cloud,modules:{...cloud.modules,...local.modules},history:[...(cloud.history||[]),...(local.history||[])],unknown:[...(cloud.unknown||[]),...(local.unknown||[])],module_work:{...(cloud.module_work||{}),...(local.module_work||{})},error_reports:{...(cloud.error_reports||{}),...(local.error_reports||{})}};state.history=dedupeById(state.history);state.unknown=dedupeUnknown(state.unknown);state.module_work=state.module_work||{}}await saveCloud(true)}catch(e){console.warn('Cloud state load failed:',e);showToast('云端同步暂时失败，仍保留本机记录。')}}
function dedupeById(a){const m=new Map();a.forEach(x=>m.set(x.id||crypto.randomUUID(),x));return [...m.values()]}
function dedupeUnknown(a){const m=new Map();a.forEach(x=>m.set(`${x.item_id}:${x.stage}:${x.module}:${x.date}`,x));return [...m.values()]}
async function saveCloud(immediate=false){_localSave();if(!SB||!cloudReady||!userId())return;clearTimeout(cloudSyncTimer);const run=async()=>{try{const {error}=await SB.from('user_state').upsert({user_id:userId(),state,updated_at:new Date().toISOString()},{onConflict:'user_id'});if(error)throw error}catch(e){console.warn('Cloud save failed:',e)}};if(immediate)await run();else cloudSyncTimer=setTimeout(run,250)}
const _localSave=save;save=function(){_localSave();if(cloudReady&&userId())saveCloud()}
function _handleAuthUrl(){const url=new URL(window.location.href);if(url.searchParams.get('reset')==='1'){try{history.replaceState({},'',window.location.pathname)}catch{}return 'reset'}if(url.searchParams.get('verified')==='1'){try{history.replaceState({},'',window.location.pathname)}catch{}return 'verified'}return null}
async function boot(){DB=EMBEDDED_DATA;if(!supabaseConfigured()){authShell('还差最后一个配置：请把 Supabase Publishable key 填进 supabase-config.js。');return}try{SB=window.supabase.createClient(window.SUPABASE_CONFIG.url,window.SUPABASE_CONFIG.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage,flowType:'pkce'}});const urlMode=_handleAuthUrl();const {data,error}=await SB.auth.getSession();if(error)throw error;if(urlMode==='reset'){resetPasswordShell();return}if(urlMode==='verified'){if(data.session)await SB.auth.signOut();authShell('验证成功，请登录。');return}if(data.session)await afterLogin(data.session);else authShell();SB.auth.onAuthStateChange(async(event,s)=>{if(event==='SIGNED_OUT'){cloudReady=false;AUTH_SESSION=null;ACTIVE_STORE=STORE;state=blank();authShell();return}if(event==='PASSWORD_RECOVERY'){resetPasswordShell();return}if(event==='SIGNED_IN'&&s&&!userId())await afterLogin(s)})}catch(e){$('#app').innerHTML=`<div class="summary"><div class="summary-card"><h1>连接失败</h1><p>${esc(e.message)}</p></div></div>`}}
// Override save-aware layout after all functions exist.
boot();
