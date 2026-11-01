/* سجل الحضور — الربط بالإنترنت (Supabase) والأعذار
   فكرة وتصميم — نعيمه الرشيدي */
(function(){
const CFG=Object.assign({url:'',key:''},window.REG_CONFIG||{},lsGet('reg.cloudcfg')||{});
const KIND_EMO={'مرضي':'🤒','وفاة':'🖤','ظرف عائلي':'🏠','موعد رسمي':'📄','أخرى':'✏️'};
const REJECT=['لا يوجد ما يثبت','خارج المدة المسموحة','العذر غير مقبول','التاريخ غير صحيح'];
const C={sb:null,user:null,owner:false,status:'off',err:'',pending:new Set(lsGet('reg.cloud.pending')||[]),lastPull:lsGet('reg.cloud.lastPull')||'',
  ex:lsGet('reg.exc')||[],ann:lsGet('reg.ann')||[],annOpen:false,exAt:lsGet('reg.excAt')||0,exFilter:'pending',rejFor:null,busy:false,applying:false,authMode:'in'};
window.CLOUD=C;
const savePending=()=>lsSet('reg.cloud.pending',[...C.pending]);
const online=()=>navigator.onLine!==false;
const configured=()=>!!(CFG.url&&CFG.key&&window.supabase);

/* ---- local writes → pending ---- */
window.onLocalWrite=p=>{if(C.applying)return;C.pending.add(p);savePending();schedulePush()};
let pushT;function schedulePush(){clearTimeout(pushT);pushT=setTimeout(()=>sync(),1200)}

/* ---- approved excuses feed the attendance sheet ---- */
const normId=s=>String(s||'').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g,'');
const normName=s=>String(s||'').replace(/[ًٌٍَُِّْـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,'');
function matchStudent(e){const c=cById(e.section_id);if(!c)return null;const st=c.students||[];
  return st.find(s=>s.uid&&normId(s.uid)===normId(e.student_uid))||st.find(s=>normName(s.name)===normName(e.student_name))||null}
window.excusedFor=(cid,date,mid,s)=>C.ex.some(e=>e.status==='approved'&&e.section_id===cid&&e.lecture_date===date&&(!e.meeting_id||e.meeting_id===mid)&&(()=>{const m=matchStudent(e);return m&&m.id===s.id})());

/* ---- connection ---- */
async function connect(){
  if(!configured()){C.status='off';return}
  await new Promise(r=>{const w=()=>S.status==='ready'?r():setTimeout(w,100);w()});
  try{C.sb=window.supabase.createClient(CFG.url,CFG.key,{auth:{persistSession:true,autoRefreshToken:true,storageKey:'reg.auth'}})}catch(e){C.status='error';C.err='بيانات الربط غير صحيحة';return}
  const {data}=await C.sb.auth.getSession();C.user=data&&data.session&&data.session.user||null;
  C.sb.auth.onAuthStateChange((_e,ses)=>{C.user=ses&&ses.user||null;if(C.user)afterLogin();else{C.owner=false;C.status='login';render()}});
  if(C.user)await afterLogin();else{C.status='login';render()}
}
async function afterLogin(){
  if(!online()){C.status='offline';C.owner=lsGet('reg.cloud.owner')===C.user.id;render();return}
  try{const {data,error}=await C.sb.rpc('claim_owner');if(error)throw error;C.owner=!!data;lsSet('reg.cloud.owner',C.owner?C.user.id:'')}
  catch(e){C.status='error';C.err='تعذّر التحقق من الحساب. تأكدي أن نص الإعداد نُفّذ في Supabase.';render();return}
  if(!C.owner){C.status='notowner';render();return}
  if(!C.lastPull){const {count}=await C.sb.from('docs').select('path',{count:'exact',head:true});
    if(!count){LDB.paths().forEach(p=>C.pending.add(p));savePending()}}
  await sync(true);
}
async function sync(full){
  if(!C.sb||!C.user||!C.owner||C.busy)return;if(!online()){C.status='offline';renderHead(computeStats());return}
  C.busy=true;C.status='syncing';renderHead(computeStats());
  try{
    /* push */
    const paths=[...C.pending];let secChanged=false;
    for(let i=0;i<paths.length;i+=200){const part=paths.slice(i,i+200);
      const rows=part.map(p=>{const d=LDB.raw(p);secChanged=true;return{path:p,data:d,deleted:d==null}});
      const {error}=await C.sb.from('docs').upsert(rows);if(error)throw error;part.forEach(p=>C.pending.delete(p));savePending()}
    if(secChanged||full)await publishSections();
    /* pull */
    let q=C.sb.from('docs').select('path,data,deleted,updated_at').order('updated_at',{ascending:true}).limit(1000);
    if(C.lastPull)q=q.gt('updated_at',C.lastPull);
    const {data,error}=await q;if(error)throw error;
    if(data&&data.length){C.applying=true;try{for(const r of data){if(C.pending.has(r.path))continue;LDB.applyRemote(r.path,r.deleted?null:r.data)}}finally{C.applying=false}
      C.lastPull=data[data.length-1].updated_at;lsSet('reg.cloud.lastPull',C.lastPull)}
    await loadExcuses();await loadAnn();
    C.status='ok';C.err='';
  }catch(e){C.status='error';C.err=(e&&e.message)||'تعذّرت المزامنة'}
  finally{C.busy=false;render()}
}
async function publishSections(){
  const t=term();if(!t)return;const list=secs();
  const since=ymd(new Date(Date.now()-35*864e5));const A=allAtt();
  const rows=list.map(c=>({id:c.id,name:c.name,short:c.short||'',meetings:(c.meetings||[]).map(m=>({id:m.id,day:m.day,start:m.start,end:endOf(m),room:m.room||'',hours:m.hours})),term_start:t.start,weeks:t.weeks,teacher:[(S.settings.profile||{}).title,(S.settings.profile||{}).name].filter(Boolean).join(' '),
    cancelled:A.filter(d=>d.classId===c.id&&d.cancelled&&d.date>=since).map(d=>({date:d.date,meeting_id:d.meetingId,reason:d.reason||''}))}));
  if(rows.length){const {error}=await C.sb.from('sections_public').upsert(rows);if(error)throw error}
  const ids=list.map(c=>c.id);const {data}=await C.sb.from('sections_public').select('id');
  const gone=(data||[]).map(r=>r.id).filter(id=>!ids.includes(id));if(gone.length)await C.sb.from('sections_public').delete().in('id',gone);
}
async function loadAnn(){const {data,error}=await C.sb.from('announcements').select('*').order('created_at',{ascending:false}).limit(200);if(!error){C.ann=data||[];lsSet('reg.ann',C.ann)}}
async function loadExcuses(){
  const {data,error}=await C.sb.from('excuses').select('*').order('created_at',{ascending:false}).limit(1000);if(error)throw error;
  C.ex=data||[];C.exAt=Date.now();lsSet('reg.exc',C.ex);lsSet('reg.excAt',C.exAt);
}
window.addEventListener('online',()=>{if(C.user)afterLogin()});
window.addEventListener('offline',()=>{if(C.sb){C.status='offline';render()}});
setInterval(()=>{if(C.owner&&online())sync()},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&C.owner&&online())sync()});

/* ---- header ---- */
const _renderHead=renderHead;
renderHead=function(stats){_renderHead(stats);
  const net=document.querySelector('#sum .net');
  if(net&&C.sb){const pend=C.pending.size+Object.keys(S.outbox).length;
    const t=C.status==='ok'?(pend?'جارٍ الرفع':'متزامن'):C.status==='syncing'?'جارٍ المزامنة':C.status==='offline'?(pend?`${pend} بانتظار النت`:'بدون اتصال'):C.status==='login'?'غير مسجّلة':C.status==='error'?'خطأ في الاتصال':'على الجهاز';
    net.className='net'+(C.status==='ok'&&!pend?'':' off');net.innerHTML='<i></i>'+t}
  const n=C.ex.filter(e=>e.status==='pending').length,b=document.querySelector('.tabs button[data-tab="exc"]');
  if(b){b.querySelector('.dot')?.remove();if(n&&S.tab!=='exc'){const s=document.createElement('span');s.className='dot num';s.style.background='var(--accent)';s.textContent=n;b.appendChild(s)}}
};

/* ---- home badge ---- */
const _vHome=vHome;
vHome=function(stats){let h=_vHome(stats);const n=C.ex.filter(e=>e.status==='pending').length;
  if(n)h=h.replace('<div class="greet">',`<div class="greet"><button class="exbadge" data-act="tab" data-tab="exc">📩 ${n===1?'عندك عذر جديد':n===2?'عندك عذران جديدان':`عندك ${n} أعذار جديدة`}</button>`);
  return h};

/* ---- excuses view ---- */
const fD=F({weekday:'long',day:'numeric',month:'long'}),fT=F({day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
function lectureOf(e){const c=cById(e.section_id);const m=c&&(c.meetings||[]).find(x=>x.id===e.meeting_id);return{c,m}}
function markOf(e,s){const{c,m}=lectureOf(e);if(!c||!s)return null;const d=allAtt().find(x=>x.classId===c.id&&x.date===e.lecture_date&&(!m||x.meetingId===m.id));
  if(!d)return{t:'لم تُحضّر بعد',c:'muted'};if(d.cancelled)return{t:'المحاضرة مُلغاة',c:'muted'};const k=(d.marks||{})[s.id];
  return k==='a'?{t:'مسجّلة غائبة',c:'deny'}:k==='e'?{t:'غائبة بعذر',c:'ok'}:k==='l'?{t:'متأخرة',c:'warn'}:k==='p'?{t:'مسجّلة حاضرة',c:'warn'}:{t:'غير مسجّلة',c:'muted'}}
const lateDays=()=>+(S.settings.excuseDays||7);
function isLate(e){return (new Date(e.created_at)-pd(e.lecture_date))/864e5>lateDays()+1}
function replyFor(e){const{c,m}=lectureOf(e);const when=fD.format(pd(e.lecture_date))+(m?' '+t12(m.start):'');
  return e.status==='approved'?`أهلًا ${e.student_name.split(' ')[0]} 🌿\nتم اعتماد عذرك عن محاضرة ${c?c.short||c.name:''} يوم ${when}، ولن يُحتسب عليك غيابًا.`
    :`أهلًا ${e.student_name.split(' ')[0]}\nنعتذر، لم يُعتمد عذرك عن محاضرة ${c?c.short||c.name:''} يوم ${when}.${e.reason?'\nالسبب: '+e.reason:''}`}
window.vExc=function(stats){
  if(!configured())return `<div class="card empty"><b>استقبال الأعذار يحتاج الربط بالإنترنت</b>بعد إضافة بيانات Supabase في ملف config.js، سجّلي دخولك من «الإعداد».<br><br><button class="btn pri" data-act="tab" data-tab="manage">الإعداد</button></div>`;
  if(!C.user||!C.owner)return `<div class="card empty"><b>سجّلي دخولك أولًا</b>من «الإعداد» ← الربط بالإنترنت، لتصلك أعذار الطالبات.<br><br><button class="btn pri" data-act="tab" data-tab="manage">تسجيل الدخول</button></div>`;
  const cnt=k=>C.ex.filter(e=>e.status===k).length;const f=C.exFilter;
  const today=ymd(new Date()),act=C.ann.filter(a=>!a.until||a.until>=today);
  let h=`<section class="sec"><div class="sec-h"><h2>إعلانات للطالبات</h2><button class="lnk" data-act="annToggle">${C.annOpen?'إغلاق':'+ إعلان جديد'}</button></div>
  ${C.annOpen?`<div class="card form"><div class="f"><label for="anb">نص الإعلان</label><textarea id="anb" maxlength="500" placeholder="مثال: محاضرة الأحد ستكون في قاعة SH-BF-04 بدل القاعة المعتادة"></textarea></div>
    <div class="setgrid"><div class="f"><label for="ans">لمن؟</label><select id="ans"><option value="">كل الشعب</option>${secs().map(c=>`<option value="${esc(c.id)}">${esc(c.short||c.name)}</option>`).join('')}</select></div>
    <div class="f"><label for="anu">يظهر حتى</label><input id="anu" type="date" value="${ymd(new Date(Date.now()+7*864e5))}"></div></div>
    <div><button class="btn pri" data-act="annPost"${online()?'':' disabled'}>نشر الإعلان</button></div></div>`:''}
  ${act.length?`<div class="alerts">${act.map(a=>{const c=a.section_id&&cById(a.section_id);return `<div class="card annc"><p>📢 ${esc(a.body)}</p><div class="facts"><span>${c?esc(c.short||c.name):'كل الشعب'}</span>${a.until?`<span class="num">حتى ${esc(fD.format(pd(a.until)))}</span>`:''}<button class="lnk red" data-act="annDel" data-id="${esc(a.id)}"${online()?'':' disabled'}>حذف</button></div></div>`}).join('')}</div>`:'<p class="hint">لا إعلانات حالية. المحاضرات المُلغاة تظهر للطالبات تلقائيًا.</p>'}
  </section><section class="sec"><div class="sec-h"><h2>أعذار الطالبات</h2><button class="lnk" data-act="exRefresh">${C.busy?'جارٍ التحديث…':'تحديث'}</button></div>
  ${!online()?`<div class="banner warn" style="margin:0">بدون اتصال. تعرض آخر أعذار وصلت ${C.exAt?'('+esc(fT.format(new Date(C.exAt)))+')':''}، والاعتماد يحتاج اتصالًا.</div>`:''}
  <div class="filters">${[['pending','بانتظارك'],['approved','معتمدة'],['rejected','مرفوضة']].map(([k,t])=>`<button data-act="exFilter" data-f="${k}" aria-pressed="${f===k}">${t} <span class="num">${cnt(k)}</span></button>`).join('')}</div>
  <div class="rule" style="display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap"><span>رابط صفحة الطالبات (الجدول والإعلانات والأعذار)</span><button class="btn sm" data-act="exLink">نسخ الرابط</button></div>`;
  const list=C.ex.filter(e=>e.status===f);
  if(!list.length)h+=`<div class="card empty"><b>${f==='pending'?'لا أعذار بانتظارك':'لا شيء هنا بعد'}</b>${f==='pending'?'أي عذر ترسله طالبة يظهر هنا فور الاتصال.':''}</div>`;
  else{h+='<div class="alerts">';
    for(const e of list){const{c,m}=lectureOf(e),s=matchStudent(e),x=s&&stats.find(z=>z.s.id===s.id&&z.c.id===e.section_id),mk=markOf(e,s);
      const st=e.status==='approved'?'ok':e.status==='rejected'?'deny':'';
      h+=`<article class="card al ${e.status==='rejected'?'l3':e.status==='approved'?'':'l1'}"><span class="stripe" ${e.status==='approved'?'style="background:var(--ok)"':''}></span><div class="body">
        <div class="top1"><div><div class="name">${esc(e.student_name)}</div><div class="cls num">${esc(c?c.short||c.name:'شعبة محذوفة')} · ${esc(e.student_uid)}</div></div>
        <div class="sum">${!s?'<span class="pill warn">غير موجودة في الكشف</span>':''}${isLate(e)?'<span class="pill warn2">متأخر</span>':''}${st?`<span class="pill ${st}">${e.status==='approved'?'معتمد':'مرفوض'}</span>`:''}</div></div>
        <div class="facts num"><span>المحاضرة <b>${esc(fD.format(pd(e.lecture_date)))}${m?' · '+t12(m.start):''}</b></span>${mk?`<span class="pill ${mk.c}">${mk.t}</span>`:''}${x?`<span>حضورها <b>${x.attPct}%</b></span>`:''}</div>
        <div class="exbody"><b>${KIND_EMO[e.kind]||''} ${esc(e.kind||'')}</b><p>${esc(e.body||'—')}</p></div>
        <div class="facts"><span>أُرسل ${esc(fT.format(new Date(e.created_at)))}</span>${e.file_path?`<button class="lnk" data-act="exFile" data-id="${esc(e.id)}">📎 عرض المرفق</button>`:''}</div>
        ${e.status==='rejected'&&e.reason?`<div class="absd">سبب الرفض: ${esc(e.reason)}</div>`:''}
        ${e.status==='pending'?(C.rejFor===e.id?`<div class="rule"><b>سبب الرفض</b><div class="reasons" style="margin-top:8px">${REJECT.map(r=>`<button class="btn sm" data-act="exReason" data-r="${esc(r)}">${r}</button>`).join('')}</div>
            <div class="inline" style="margin-top:8px"><div class="f"><input id="rj-${esc(e.id)}" placeholder="أو اكتبي السبب"></div><button class="btn danger armed" data-act="exReject" data-id="${esc(e.id)}">تأكيد الرفض</button><button class="btn" data-act="exRejCancel">إلغاء</button></div></div>`
          :`<div class="exacts"><button class="btn pri lg" data-act="exApprove" data-id="${esc(e.id)}"${online()?'':' disabled'}>✓ اعتماد</button><button class="btn danger lg" data-act="exRejOpen" data-id="${esc(e.id)}"${online()?'':' disabled'}>✗ رفض</button></div>`)
          :`<div class="inline"><button class="btn sm" data-act="exCopy" data-id="${esc(e.id)}">نسخ الرد للطالبة</button><button class="lnk mut" data-act="exUndo" data-id="${esc(e.id)}"${online()?'':' disabled'}>تراجع</button></div>`}
      </div></article>`}
    h+='</div>'}
  return h+`<p class="rule">عند الاعتماد يتحوّل غياب الطالبة في تلك المحاضرة إلى «غائبة بعذر» وتتعدّل نسبتها. العذر المرسل بعد أكثر من <b class="num">${lateDays()}</b> أيام من المحاضرة يظهر بعلامة «متأخر».</p></section>`;
};
async function decide(id,status,reason){
  const e=C.ex.find(x=>x.id===id);if(!e)return;
  const {error}=await C.sb.from('excuses').update({status,reason:reason||null,decided_at:status==='pending'?null:new Date().toISOString()}).eq('id',id);
  if(error){toast('تعذّر الحفظ، تحققي من الاتصال');return}
  e.status=status;e.reason=reason||null;lsSet('reg.exc',C.ex);
  const s=matchStudent(e),{c,m}=lectureOf(e);
  if(s&&c){const d=allAtt().find(x=>x.classId===c.id&&x.date===e.lecture_date&&(!m||x.meetingId===m.id)&&!x.cancelled);
    if(d){const cur=(d.marks||{})[s.id];let nv=null;
      if(status==='approved'&&cur!=='e'&&cur!=='p'&&cur!=='l')nv='e';
      if(status!=='approved'&&cur==='e')nv='a';
      if(nv){const body={...d,marks:{...d.marks,[s.id]:nv},updatedAt:new Date().toISOString()};delete body.id;queue(d.id,body)}}}
  toast(status==='approved'?'اعتُمد العذر ✓':status==='rejected'?'رُفض العذر':'أُعيد العذر للانتظار');C.rejFor=null;render();
}
async function openFile(id){const e=C.ex.find(x=>x.id===id);if(!e||!e.file_path)return;
  const w=window.open('','_blank');
  const {data,error}=await C.sb.storage.from('excuse-files').createSignedUrl(e.file_path,3600);
  if(error||!data){w&&w.close();toast('تعذّر فتح المرفق');return}
  if(w)w.location=data.signedUrl;else location.href=data.signedUrl}
function studentLink(){return location.href.replace(/[#?].*$/,'').replace(/[^/]*$/,'')+'excuse.html'}

/* ---- settings: connection ---- */
const _vManage=vManage;
vManage=function(){let h=_vManage();
  let box;
  if(!window.supabase)box=`<p class="rule">مكتبة الربط لم تُحمّل بعد. افتحي التطبيق مرة وأنتِ متصلة بالإنترنت.</p>`;
  else if(!CFG.url||!CFG.key)box=`<p class="rule">أضيفي رابط مشروع Supabase ومفتاح anon في ملف <b>config.js</b> على GitHub، ثم أعيدي فتح التطبيق.</p>`;
  else if(!C.user)box=`<p class="hint">${C.authMode==='up'?'أنشئي حسابك مرة واحدة. سيصلك بريد تأكيد، اضغطي الرابط فيه ثم ارجعي وسجّلي الدخول.':'سجّلي دخولك لتتزامن بياناتك وتصلك الأعذار.'}</p>
    <div class="setgrid"><div class="f"><label for="ce">البريد الإلكتروني</label><input id="ce" type="email" autocomplete="email" dir="ltr"></div><div class="f"><label for="cp">كلمة المرور</label><input id="cp" type="password" autocomplete="${C.authMode==='up'?'new-password':'current-password'}" dir="ltr"></div></div>
    <div class="inline"><button class="btn pri" data-act="cAuth">${C.authMode==='up'?'إنشاء الحساب':'تسجيل الدخول'}</button><button class="lnk" data-act="cMode">${C.authMode==='up'?'عندي حساب':'أول مرة؟ أنشئي حسابًا'}</button></div>`;
  else box=`<div class="state"><span>${C.owner?'✅ مرتبطة':C.status==='notowner'?'⚠️ هذا الحساب ليس صاحب السجل':'…'} <span class="hint" dir="ltr">${esc(C.user.email||'')}</span></span><button class="lnk mut" data-act="cOut">تسجيل الخروج</button></div>
    <div class="facts num"><span>الحالة: <b>${{ok:'متزامن',syncing:'جارٍ المزامنة',offline:'بدون اتصال',error:'خطأ',notowner:'غير مصرّح'}[C.status]||'—'}</b></span><span>بانتظار الرفع: <b>${C.pending.size}</b></span></div>
    ${C.owner?`<div class="inline"><button class="btn" data-act="exLink">نسخ رابط الأعذار للطالبات</button><button class="btn" data-act="cSync">مزامنة الآن</button></div>
    <div class="setgrid"><div class="f"><label for="xd">العذر متأخر بعد (أيام)</label><input id="xd" type="number" min="1" max="60" value="${lateDays()}"></div></div><div><button class="btn sm" data-act="cDays">حفظ</button></div>`:''}`;
  if(C.err)box+=`<div class="banner err" style="margin:0">${esc(C.err)}</div>`;
  const sec=`<section class="sec"><h2>الربط بالإنترنت والأعذار</h2><div class="card form">${box}<p class="rule">التحضير يُحفظ على جوالك دائمًا، ويُرفع تلقائيًا عند توفر النت. الأعذار تبقى على الإنترنت ولا تأخذ مساحة من جوالك.</p></div></section>`;
  return sec+h};

/* ---- actions ---- */
document.addEventListener('click',async ev=>{const t=ev.target.closest('[data-act]');if(!t)return;const a=t.dataset.act;
  switch(a){
  case 'annToggle':C.annOpen=!C.annOpen;render();break;
  case 'annPost':{const body=document.getElementById('anb').value.trim();if(body.length<2){toast('اكتبي نص الإعلان');return}
    const row={body,section_id:document.getElementById('ans').value||null,until:document.getElementById('anu').value||null};
    const {error}=await C.sb.from('announcements').insert(row);if(error){toast('تعذّر النشر');return}C.annOpen=false;await loadAnn();toast('نُشر الإعلان للطالبات 📢');render();break}
  case 'annDel':{const {error}=await C.sb.from('announcements').delete().eq('id',t.dataset.id);if(error){toast('تعذّر الحذف');return}await loadAnn();render();break}
  case 'exFilter':C.exFilter=t.dataset.f;C.rejFor=null;render();break;
  case 'exRefresh':sync();break;
  case 'exApprove':decide(t.dataset.id,'approved');break;
  case 'exRejOpen':C.rejFor=t.dataset.id;render();break;
  case 'exRejCancel':C.rejFor=null;render();break;
  case 'exReason':{const i=document.getElementById('rj-'+C.rejFor);if(i)i.value=t.dataset.r;break}
  case 'exReject':{const i=document.getElementById('rj-'+t.dataset.id);const r=i&&i.value.trim();if(!r){toast('اختاري سببًا أو اكتبيه');return}decide(t.dataset.id,'rejected',r);break}
  case 'exUndo':decide(t.dataset.id,'pending');break;
  case 'exFile':openFile(t.dataset.id);break;
  case 'exCopy':{const e=C.ex.find(x=>x.id===t.dataset.id);try{await navigator.clipboard.writeText(replyFor(e));toast('نُسخ الرد، الصقيه في واتساب')}catch(_){toast('تعذّر النسخ')}break}
  case 'exLink':{try{await navigator.clipboard.writeText(studentLink());toast('نُسخ رابط الأعذار')}catch(_){toast(studentLink(),5000)}break}
  case 'cMode':C.authMode=C.authMode==='up'?'in':'up';render();break;
  case 'cAuth':{const email=document.getElementById('ce').value.trim(),pw=document.getElementById('cp').value;if(!email||pw.length<6){toast('اكتبي البريد وكلمة مرور من ٦ أحرف على الأقل');return}
    const r=C.authMode==='up'?await C.sb.auth.signUp({email,password:pw,options:{emailRedirectTo:location.href.replace(/[#?].*$/,'')}}):await C.sb.auth.signInWithPassword({email,password:pw});
    if(r.error){C.err=/confirm/i.test(r.error.message)?'أكّدي بريدك أولًا من الرسالة التي وصلتك':/Invalid login/i.test(r.error.message)?'البريد أو كلمة المرور غير صحيحة':r.error.message;render();return}
    C.err='';if(C.authMode==='up'&&!(r.data&&r.data.session)){toast('أُرسل بريد التأكيد، اضغطي الرابط ثم سجّلي الدخول',5000);C.authMode='in';render()}break}
  case 'cOut':await C.sb.auth.signOut();C.owner=false;render();break;
  case 'cSync':sync(true);break;
  case 'cDays':{const v=Math.max(1,parseInt(document.getElementById('xd').value,10)||7);write(()=>db.doc('config/settings').set({...S.settings,excuseDays:v}),'حُفظ');break}
  }
});

/* ---- styles ---- */
const st=document.createElement('style');st.textContent=`
.exbadge{display:inline-flex;align-items:center;gap:6px;border:0;background:var(--ink);color:var(--surface);border-radius:999px;padding:5px 14px;font-weight:700;font-size:.84rem;margin-bottom:10px;cursor:pointer}
.exbody{background:var(--bg);border-radius:10px;padding:10px 12px}.exbody p{margin:4px 0 0;white-space:pre-wrap;line-height:1.7}
.exacts{display:grid;grid-template-columns:1fr 1fr;gap:8px}.exacts .btn{width:100%}
.reasons{display:flex;gap:6px;flex-wrap:wrap}
.annc{padding:12px 14px;display:flex;flex-direction:column;gap:6px}.annc p{margin:0;line-height:1.7}`;document.head.appendChild(st);

connect().then(()=>render());
})();
