const DATA=null;
const EMBEDDED_DATA=window.__VOCAB_DATA__;
const MODULES=[
 {id:'meaning',name:'词义检查',short:'词义'},
 {id:'irregular_verb',name:'不规则动词',short:'动词'},
 {id:'synonym_near_synonym_antonym',name:'同义 / 近义 / 反义',short:'关系'},
 {id:'same_root_prefix',name:'同根 / 前缀辨析',short:'辨析'}
];
const $=s=>document.querySelector(s); const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORE='de-vocab-final-v3';
let DB=null, state=loadState(), session=null;
function blank(){return {modules:{},history:[],unknown:[],lastSeen:{},settings:{}}}
function loadState(){try{return {...blank(),...JSON.parse(localStorage.getItem(STORE))}}catch{return blank()}}
function save(){localStorage.setItem(STORE,JSON.stringify(state))}
function key(s,m){return `${s}:${m}`}
function entriesFor(s,m){return DB.entries.filter(e=>e.source.stage.includes(s)&&e.module_eligibility[m])}
function clean(s){return String(s||'').toLowerCase().replace(/[\s“”"'’‘。！？、：:；;,.，()（）\[\]{}]/g,'')}
function meaning(e){if(e.lexical?.meaning_source)return e.lexical.meaning_source; let t=e.source?.exact_source_text||''; t=t.replace(/^\s*\d+[.]?\s*/,''); const m=t.match(/(?:Vi\.|Vt\.|Adj\.|Adv\.|N\.|D\.)\s*(.*)$/); return (m?m[1]:t).replace(/[”“]/g,'').trim()||'原书来源文本未结构化提取释义'}
function forms(e){let a=e.lexical?.irregular_forms_source?.[0]; if(!a)return ''; return a[0]||''}
function status(s,m){return state.modules[key(s,m)]?.status||'available'}
function isLocked(s,i){return i>0&&status(s,MODULES[i-1].id)!=='done'}
function nav(active){return `<nav>${[['home','学习路径'],['errors','错误本'],['review','长期复习']].map(([id,n])=>`<button class="nav ${active===id?'active':''}" data-view="${id}">${n}${id==='errors'?` <b>${state.history.length}</b>`:''}</button>`).join('')}</nav>`}
function layout(title,sub,active,body){$('#app').innerHTML=`<header><div><div class="brand">Deutsch Vocab</div><div class="sub">${esc(sub||'')}</div></div>${nav(active)}</header><main>${body}</main>`; bindNav()}
function renderHome(){const done=Object.values(state.modules).filter(x=>x.status==='done').length; const learned=new Set(state.history.map(x=>x.item_id)).size; layout('','二轮复习 · 已完成 '+done+'/44 个 Module','home',`<section class="hero"><div><div class="kicker">VOCABULARY REVIEW</div><h1>按原书顺序，把词汇真正掌握。</h1><p>11 个 Stage 全部开放；每个 Stage 内 4 个 Module 严格按顺序完成。</p></div><div class="stats"><div><strong>${learned}</strong><span>有学习记录</span></div><div><strong>${state.unknown.length}</strong><span>首次未知</span></div></div></section><section class="path">${DB.stages.map((s,i)=>stageCard(s,i+1)).join('')}</section>`)}
function stageCard(s,n){return `<article class="stage"><div class="stage-head"><div><span class="stage-no">STAGE ${n}</span><h2>第 ${n} 阶段</h2></div><span class="pages">P.${s.printed_page_start}–${s.printed_page_end}</span></div><div class="nodes">${MODULES.map((m,i)=>{const st=status(n,m.id),lock=isLocked(n,i); return `<button class="node ${lock?'locked':st}" ${lock?'disabled':''} data-stage="${n}" data-module="${m.id}"><span class="circle">${st==='done'?'✓':st==='warn'?'!':lock?'×':i+1}</span><span class="node-text"><b>${m.short}</b><small>${entriesFor(n,m.id).length} 项</small></span></button>`}).join('')}</div></article>`}
function bindNav(){document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>b.dataset.view==='home'?renderHome():b.dataset.view==='errors'?renderErrors():renderReview()); document.querySelectorAll('.node:not([disabled])').forEach(b=>b.onclick=()=>start(+b.dataset.stage,b.dataset.module))}
function start(stage,m){const all=entriesFor(stage,m);if(!all.length){showToast('这个 Module 暂无原书关系数据，未虚构题目。');return} const old=state.modules[key(stage,m)]||{}; const pending=(old.pending||[]).map(id=>all.find(e=>e.id===id)).filter(Boolean); session={stage,m,all,phase:old.status==='warn'?'reinforce':'first',items:old.status==='warn'&&pending.length?pending:[...all],idx:0,errors:[],unknown:[],round:old.status==='warn'?2:1,answers:{},selected:null}; renderQuestion()}
function qHeader(){return `<div class="study-top"><button class="back" id="back">← 学习路径</button><div class="study-name">Stage ${session.stage||'长期复习'} · ${MODULES.find(m=>m.id===session.m)?.name||'长期复习'}</div><div class="count">${session.idx+1} / ${session.items.length}</div></div>`}
function renderQuestion(){if(session.idx>=session.items.length){finish();return} const e=session.items[session.idx]; const pct=session.idx/session.items.length*100; let prompt='',content='';
 if(session.m==='meaning'){if(session.phase==='first'||session.phase==='retest'){prompt='德语 → 中文';content=`<div class="word">${esc(e.headword)}</div><div class="choice-row"><button class="choice" id="unknown">我不知道</button><button class="choice primary" id="know">我知道</button></div><div id="inputWrap" class="hidden input-row"><input id="answer" placeholder="输入中文释义" autocomplete="off"><button class="primary" id="submit">提交</button></div>`}else{prompt='中文 → 德语';content=`<div class="meaning">${esc(meaning(e))}</div><div class="input-row"><input id="answer" placeholder="输入德语词" autocomplete="off"><button class="primary" id="submit">提交</button></div>`}}
 else if(session.m==='irregular_verb'){prompt='主动写出 Präteritum 和 Partizip II';content=`<div class="word">${esc(e.headword)}</div><div class="source">${esc(e.source.exact_source_text||'')}</div><div class="input-row"><input id="answer" placeholder="例如：hielt; festgehalten" autocomplete="off"><button class="primary" id="submit">提交</button></div>`}
 else if(session.m==='synonym_near_synonym_antonym'){prompt='根据原书明确给出的关系选择';const rel=e.relationships?.source_relation_labels?.[0]||'原书关系'; const target=(e.source.exact_source_text.match(/(?:同义词|近义词|反义词)\s*:\s*([^\n]+)/)||[])[1]||''; const opts=relationOptions(e,target);content=`<div class="word">${esc(e.headword)}</div><div class="relation">${esc(rel)}</div><div class="mcq">${opts.map((o,i)=>`<button class="option" data-i="${i}">${esc(o)}</button>`).join('')}</div><button class="primary" id="submit" disabled>提交</button>`}
 else {prompt='在语境中判断最合适的词形';content=`<div class="word">${esc(e.headword)}</div><div class="context">${esc(contextFor(e))}</div><div class="mcq">${prefixOptions(e).map((o,i)=>`<button class="option" data-i="${i}">${esc(o)}</button>`).join('')}</div><button class="primary" id="submit" disabled>提交</button>`}
 $('#app').innerHTML=`<div class="study"><header>${qHeader()}</header><div class="progress"><span style="width:${pct}%"></span></div><main class="study-main"><div class="round-label">${session.phase==='first'?'第一轮':session.phase==='reinforce'?'强化轮':session.phase==='retest'?'全量重测':'长期复习'}</div><section class="card"><div class="eyebrow">${prompt}</div>${content}</section><div class="source-foot">原书 P.${e.source.printed_page} · ${esc(e.id)}</div></main></div>`;
 $('#back').onclick=renderHome; $('#know')?.addEventListener('click',()=>{$('#inputWrap').classList.remove('hidden');$('#know').classList.add('hidden');$('#unknown').classList.add('hidden');$('#answer').focus()}); $('#unknown')?.addEventListener('click',()=>answer('',true)); $('#submit')?.addEventListener('click',()=>answer($('#answer')?.value||'',false)); document.querySelectorAll('.option').forEach(o=>o.onclick=()=>{document.querySelectorAll('.option').forEach(x=>x.classList.remove('selected'));o.classList.add('selected');session.selected=+o.dataset.i;$('#submit').disabled=false}); $('#answer')?.addEventListener('keydown',e=>{if(e.key==='Enter')$('#submit')?.click()});}
function relationOptions(e,target){let pool=DB.entries.filter(x=>x.id!==e.id&&x.module_eligibility.synonym_near_synonym_antonym).map(x=>x.headword);return shuffle([target||'原书关系未结构化',...pool.slice(0,3)]).slice(0,4)}
function prefixOptions(e){let pool=DB.entries.filter(x=>x.id!==e.id&&x.module_eligibility.same_root_prefix).map(x=>x.headword);return shuffle([e.headword,...pool.slice(0,3)])}
function contextFor(e){const m=meaning(e); return `根据原书释义“${m}”，判断句中最合适的词形。题目只考察本词与同根/前缀词之间的区别。`}
function shuffle(a){return [...a].sort(()=>Math.random()-.5)}
function answer(raw,unknown){
 const e=session.items[session.idx];
 // German -> Chinese is semantic, not string-exact. After the user enters a meaning,
 // reveal the source meaning and let the learner judge whether the meaning is correct.
 if(session.m==='meaning' && !unknown && (session.phase==='first'||session.phase==='retest')){
   showMeaningEvaluation(e,raw); return;
 }
 let ok=unknown?false:grade(e,raw);
 if(session.m.includes('synonym')||session.m==='same_root_prefix'){
   const opts=document.querySelectorAll('.option'); const picked=session.selected==null?'':opts[session.selected]?.textContent.trim(); ok=grade(e,picked);raw=picked
 }
 record(e,raw,ok,unknown);
 if(!ok)session.errors.push(e.id);
 showAnswerFeedback(e, raw, ok, unknown);
}

function correctAnswerFor(e){
  if(session.m==='meaning') return session.round===2 ? e.headword : meaning(e);
  if(session.m==='irregular_verb') return forms(e);
  if(session.m==='synonym_near_synonym_antonym'){
    return (e.source.exact_source_text.match(/(?:同义词|近义词|反义词)\s*:\s*([^\n]+)/)||[])[1]||'原书关系未结构化';
  }
  if(session.m==='same_root_prefix') return e.headword;
  return meaning(e);
}
function showAnswerFeedback(e,raw,ok,unknown){
  const answer=correctAnswerFor(e);
  const title=unknown?'你还不知道':ok?'回答正确':'你答错了';
  const desc=unknown?'没关系，先记住正确答案。':ok?'这一题判断正确。':'这道题没有答对，正确答案如下。';
  const user=unknown?'我不知道':(raw||'（未填写）');
  const card=document.querySelector('.card');
  card.innerHTML=`<div class=\"feedback ${ok?'feedback-ok':'feedback-wrong'}\">
    <div class=\"feedback-mark\">${ok?'✓':unknown?'?':'×'}</div>
    <div class=\"feedback-title\">${esc(title)}</div>
    <p class=\"feedback-desc\">${esc(desc)}</p>
    ${!ok||unknown?`<div class=\"feedback-answer\"><span>正确答案</span><strong>${esc(answer)}</strong></div>`:''}
    ${!ok||unknown?`<div class=\"feedback-your\"><span>你的答案</span><div>${esc(user)}</div></div>`:''}
    <button class=\"primary feedback-next\" id=\"feedbackNext\">${session.idx+1<session.items.length?'下一题':'查看结果'}</button>
  </div>`;
  document.querySelector('#feedbackNext').onclick=()=>{session.idx++;session.selected=null;renderQuestion()};
}
function showMeaningEvaluation(e,raw){
 const card=document.querySelector('.card');
 card.innerHTML=`<div class="eyebrow">请按“意思”判断，而不是按原书措辞判断</div>
   <div class="word">${esc(e.headword)}</div>
   <div class="meaning-eval">
     <h3>你的答案</h3><div class="your-answer">${esc(raw)}</div>
     <div class="standard"><b>原书释义</b><br>${esc(meaning(e))}</div>
     <div class="eval-buttons">
       <button class="ok" id="meaningCorrect">10/10 · 意思正确</button>
       <button class="partial" id="meaningPartial">7/10 · 基本正确但不完整</button>
       <button class="wrong" id="meaningWrong">0/10 · 意思错误</button>
     </div>
     <div class="eval-note">例如“对……做贡献”和“为……作出贡献”属于意思正确；不要求和书上的中文表述逐字一致。只有你确认意思正确，才算本轮掌握。</div>
   </div>`;
 document.querySelector('#meaningCorrect').onclick=()=>finishMeaningEvaluation(e,raw,true);
 document.querySelector('#meaningPartial').onclick=()=>finishMeaningEvaluation(e,raw,false);
 document.querySelector('#meaningWrong').onclick=()=>finishMeaningEvaluation(e,raw,false);
}
function finishMeaningEvaluation(e,raw,ok){record(e,raw,ok,false);if(!ok)session.errors.push(e.id);session.idx++;session.selected=null;renderQuestion()}

function grade(e,a){if(session.m==='meaning'){const target=session.phase==='reinforce'?e.headword:session.round===3?meaning(e):meaning(e); if(session.round===2)return clean(a)===clean(e.headword);return clean(a)===clean(target)||clean(target).includes(clean(a))&&clean(a).length>2} if(session.m==='irregular_verb')return clean(a).replace(/[，,；;]/g,' ' )===clean(forms(e)).replace(/[，,；;]/g,' '); if(session.m==='synonym_near_synonym_antonym'){const t=(e.source.exact_source_text.match(/(?:同义词|近义词|反义词)\s*:\s*([^\n]+)/)||[])[1]||'';return clean(a)===clean(t)} return clean(a)===clean(e.headword)}
function record(e,a,ok,unknown){const now=new Date().toISOString();state.lastSeen[e.id]=now;if(!ok){state.history.push({id:crypto.randomUUID(),item_id:e.id,stage:session.stage,printed_page:e.source.printed_page,module:session.m,date:now,actual_answer:a,standard_answer:session.m==='meaning'?(session.round===2?e.headword:meaning(e)):session.m==='irregular_verb'?forms(e):((e.source.exact_source_text.match(/(?:同义词|近义词|反义词)\s*:\s*([^\n]+)/)||[])[1]||e.headword),error_count:1,status:'open',first_test_unknown:unknown});if(unknown)state.unknown.push({item_id:e.id,stage:session.stage,module:session.m,date:now})}save()}
function finish(){const k=key(session.stage,session.m); if(session.phase==='first'){state.modules[k]={status:session.errors.length?'warn':'available',pending:[...new Set(session.errors)],last_round:1};save(); if(session.errors.length){session.phase='reinforce';session.round=2;session.items=[...new Set(session.errors)].map(id=>session.all.find(e=>e.id===id)).filter(Boolean);session.idx=0;session.errors=[];summary('第一轮完成','以下项目需要强化。第一轮“不知道”和答错都已分别记录。','继续强化')}else{session.phase='retest';session.round=3;session.items=[...session.all];session.idx=0;session.errors=[];summary('第一轮完成','没有错误，直接进入当前 Module 的全量重测。','开始全量重测')}}else if(session.phase==='reinforce'){if(session.errors.length){state.modules[k]={status:'warn',pending:[...new Set(session.errors)],last_round:2};save();session.items=[...new Set(session.errors)].map(id=>session.all.find(e=>e.id===id)).filter(Boolean);session.idx=0;session.errors=[];summary('强化仍有错误','必须继续强化后再进行全量重测。','继续强化')}else{state.modules[k]={status:'available',pending:[],last_round:2};save();session.phase='retest';session.round=3;session.items=[...session.all];session.idx=0;session.errors=[];summary('强化完成','现在重新测试当前 Module 的全部项目。','开始全量重测')}}else if(session.phase==='retest'){if(session.errors.length){state.modules[k]={status:'warn',pending:[...new Set(session.errors)],last_round:3};save();session.phase='reinforce';session.round=2;session.items=[...new Set(session.errors)].map(id=>session.all.find(e=>e.id===id)).filter(Boolean);session.idx=0;session.errors=[];summary('全量重测未通过','即使只有一个错误，也必须强化后再次完整测试。','继续强化')}else{state.modules[k]={status:'done',pending:[],last_round:3};save();summary('Module 完成','最近一次完整测试达到 100%。','返回学习路径')}}else{renderHome()}}
function summary(title,text,action){$('#app').innerHTML=`<div class="summary"><div class="summary-card"><div class="check">${title==='Module 完成'?'✓':'↗'}</div><div class="kicker">PROGRESS SAVED</div><h1>${esc(title)}</h1><p>${esc(text)}</p><button class="primary" id="next">${esc(action)}</button><button class="text-btn" id="home">回到学习路径</button></div></div>`;$('#next').onclick=()=>action==='返回学习路径'?renderHome():renderQuestion();$('#home').onclick=renderHome}
function renderErrors(){let rows=[...state.history].sort((a,b)=>a.printed_page-b.printed_page||a.date.localeCompare(b.date));layout('','永久历史记录 · 不会因为后来答对而删除','errors',`<section class="panel"><div class="panel-head"><div><h2>错误本</h2><p>${rows.length} 条历史错误 · First-test Unknown ${state.unknown.length} 条</p></div></div>${rows.length?`<div class="table">${rows.map(r=>{const e=DB.entries.find(x=>x.id===r.item_id);return `<div class="row"><div><b>${esc(e?.headword||r.item_id)}</b><small>P.${r.printed_page} · Stage ${r.stage} · ${esc(MODULES.find(m=>m.id===r.module)?.short||r.module)}</small></div><div><span class="badge">${r.first_test_unknown?'首次未知':'答错'}</span><div class="answer">${esc(r.actual_answer||'我不知道')} → ${esc(r.standard_answer)}</div></div><time>${new Date(r.date).toLocaleString()}</time></div>`}).join('')}</div>`:'<div class="empty">还没有错误记录。</div>'}</section>`)}
function renderReview(){let freq={};state.history.forEach(h=>freq[h.item_id]=(freq[h.item_id]||0)+1);let ids=Object.keys(freq).sort((a,b)=>freq[b]-freq[a]);let pool=ids.map(id=>DB.entries.find(e=>e.id===id)).filter(Boolean);layout('','从所有已学习内容建立全局复习池','review',`<section class="review-hero"><div class="kicker">GLOBAL REVIEW</div><h1>${pool.length} 个项目可进入长期复习</h1><p>当前优先覆盖历史错误次数较多的项目。后续可加入“最近错误 / 长期未复习 / 随机正确项”的权重。</p>${pool.length?'<button class="primary" id="reviewStart">开始复习</button>':'<div class="empty">完成一些学习后，这里会自动形成全局复习池。</div>'}</section>`);$('#reviewStart')?.addEventListener('click',()=>{session={stage:0,m:'meaning',all:pool,items:shuffle(pool),phase:'review',round:3,idx:0,errors:[],unknown:[],selected:null};renderQuestion()})}
function showToast(t){let x=document.createElement('div');x.className='toast';x.textContent=t;document.body.appendChild(x);setTimeout(()=>x.remove(),2600)}
/* ================= SUPABASE ACCOUNT + CLOUD SYNC ================= */
let SB = null;
let AUTH_SESSION = null;
let cloudReady = false;
let cloudSyncTimer = null;
const LOCAL_STORE_VERSION = 'cloud-v1';

function supabaseConfigured(){
  return window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url &&
    window.SUPABASE_CONFIG.publishableKey &&
    !window.SUPABASE_CONFIG.publishableKey.includes('PASTE_YOUR_');
}

function authShell(message=''){
  $('#app').innerHTML = `<div class="auth-screen">
    <div class="auth-card">
      <div class="kicker">DEUTSCH VOCAB</div>
      <h1>登录你的学习账号</h1>
      <p class="auth-sub">登录后，学习进度、错误本和长期复习记录会保存到云端。</p>
      <div class="auth-tabs"><button class="auth-tab active" id="loginTab">登录</button><button class="auth-tab" id="signupTab">注册</button></div>
      <label>邮箱</label><input id="authEmail" type="email" autocomplete="email" placeholder="你的邮箱">
      <label>密码</label><input id="authPassword" type="password" autocomplete="current-password" placeholder="至少 6 位">
      <button class="primary auth-submit" id="authSubmit">登录</button>
      <div class="auth-message" id="authMessage">${esc(message)}</div>
      <p class="auth-note">使用同一个账号登录，就可以在不同设备继续学习。</p>
    </div>
  </div>`;
  let mode='login';
  const tab=(m)=>{mode=m;$('#loginTab').classList.toggle('active',m==='login');$('#signupTab').classList.toggle('active',m==='signup');$('#authSubmit').textContent=m==='login'?'登录':'注册';$('#authPassword').autocomplete=m==='login'?'current-password':'new-password';$('#authMessage').textContent=''};
  $('#loginTab').onclick=()=>tab('login'); $('#signupTab').onclick=()=>tab('signup');
  $('#authSubmit').onclick=async()=>{
    const email=$('#authEmail').value.trim(), password=$('#authPassword').value;
    if(!email||password.length<6){$('#authMessage').textContent='请输入邮箱和至少 6 位密码。';return}
    $('#authSubmit').disabled=true; $('#authMessage').textContent='处理中…';
    try{
      let result = mode==='login'
        ? await SB.auth.signInWithPassword({email,password})
        : await SB.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin+window.location.pathname}});
      if(result.error) throw result.error;
      if(mode==='signup' && !result.data.session){$('#authMessage').textContent='注册成功。请先打开邮箱中的确认邮件，再回来登录。';}
      else await afterLogin(result.data.session);
    }catch(e){
      console.error('Auth error:', e);
      const msg=e?.message || e?.error_description || '操作失败，请重试。';
      $('#authMessage').textContent = msg === 'Load failed' ? '连接 Supabase 失败。请检查手机网络后重试；如果电脑能登录，这通常不是账号或密码问题。' : msg;
    }
    finally{$('#authSubmit').disabled=false}
  };
}

function userId(){return AUTH_SESSION?.user?.id || null}
async function afterLogin(authSession){
  AUTH_SESSION = authSession;
  cloudReady = true;
  await loadCloudState();
  renderHome();
}

async function loadCloudState(){
  const uid=userId(); if(!uid) return;
  try{
    const {data,error}=await SB.from('user_state').select('state').eq('user_id',uid).maybeSingle();
    if(error) throw error;
    const local=state;
    if(data?.state){
      // Merge rather than overwrite: preserves any local work that predates first login.
      state={...blank(),...data.state,modules:{...local.modules,...(data.state.modules||{})},history:[...(data.state.history||[]),...(local.history||[])],unknown:[...(data.state.unknown||[]),...(local.unknown||[])]};
      state.history=dedupeById(state.history); state.unknown=dedupeUnknown(state.unknown);
    }
    await saveCloud(true);
  }catch(e){
    console.warn('Cloud state load failed:',e);
    showToast('云端同步暂时失败，仍保留本机记录。');
  }
}
function dedupeById(a){const m=new Map();a.forEach(x=>m.set(x.id||crypto.randomUUID(),x));return [...m.values()]}
function dedupeUnknown(a){const m=new Map();a.forEach(x=>m.set(`${x.item_id}:${x.stage}:${x.module}`,x));return [...m.values()]}
async function saveCloud(immediate=false){
  _localSave();
  if(!SB||!cloudReady||!userId()) return;
  clearTimeout(cloudSyncTimer);
  const run=async()=>{
    try{
      const {error}=await SB.from('user_state').upsert({user_id:userId(),state,updated_at:new Date().toISOString()},{onConflict:'user_id'});
      if(error) throw error;
    }catch(e){console.warn('Cloud save failed:',e)}
  };
  if(immediate) await run(); else cloudSyncTimer=setTimeout(run,250);
}

// Replace the local save function with a cloud-aware version after login.
const _localSave = save;
save = function(){
  _localSave();
  if(cloudReady && userId()) saveCloud();
};

function accountNav(){
  const email=AUTH_SESSION?.user?.email||'';
  return `<div class="account"><span>${esc(email)}</span><button id="logoutBtn">退出登录</button></div>`;
}
const _oldLayout=layout;
layout=function(title,sub,active,body){
  $('#app').innerHTML=`<header><div><div class="brand">Deutsch Vocab</div><div class="sub">${esc(sub||'')}</div></div><div class="header-right">${nav(active)}${accountNav()}</div></header><main>${body}</main>`;
  bindNav(); $('#logoutBtn')?.addEventListener('click',async()=>{await SB.auth.signOut();cloudReady=false;AUTH_SESSION=null;state=loadState();authShell()});
};

async function boot(){
  if(!supabaseConfigured()){
    await Promise.resolve(EMBEDDED_DATA).then(d=>{DB=d;authShell('还差最后一个配置：请把 Supabase Publishable key 填进 supabase-config.js。')});
    return;
  }
  try{
    SB=window.supabase.createClient(window.SUPABASE_CONFIG.url,window.SUPABASE_CONFIG.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage,flowType:'pkce'}});
    const {data,error}=await SB.auth.getSession(); if(error) throw error;
    DB=await Promise.resolve(EMBEDDED_DATA);
    if(data.session){await afterLogin(data.session)} else authShell();
    SB.auth.onAuthStateChange(async(_event,s)=>{
      if(s && !userId()){await afterLogin(s)}
    });
  }catch(e){
    $('#app').innerHTML=`<div class="summary"><div class="summary-card"><h1>连接失败</h1><p>${esc(e.message)}</p></div></div>`;
  }
}
boot();
