/* سجل الحضور — الربط بالإنترنت (Supabase) والأعذار
   فكرة وتصميم — نعيمه الرشيدي */
(function(){
const CFG=Object.assign({url:'',key:'',studentDomain:'albaha.onmicrosoft.com'},window.REG_CONFIG||{},lsGet('reg.cloudcfg')||{});
const isStudentEmail=e=>String(e||'').toLowerCase().endsWith('@'+String(CFG.studentDomain||'').toLowerCase())&&!!CFG.studentDomain;
const KIND_EMO={'مرضي':'🤒','وفاة':'🖤','ظرف عائلي':'🏠','موعد رسمي':'📄','أخرى':'✏️'};
const REJECT=['لا يوجد ما يثبت','خارج المدة المسموحة','العذر غير مقبول','التاريخ غير صحيح'];
const C={sb:null,user:null,owner:false,status:'off',err:'',pending:new Set(lsGet('reg.cloud.pending')||[]),lastPull:lsGet('reg.cloud.lastPull')||'',
  ex:[],exLoaded:false,ann:lsGet('reg.ann')||[],annOpen:false,exAt:0,exFilter:'pending',rejFor:null,busy:false,applying:false,authMode:'in',msgs:lsGet('reg.msgs')||[],exView:'exc',thread:null,grades:{},gImp:null,gBusy:null,q:lsGet('reg.cloud.q')||[],ver:{}};
window.CLOUD=C;
/* excuses live in Supabase only — never stored on the teacher's phone */
try{localStorage.removeItem('reg.exc');localStorage.removeItem('reg.excAt')}catch(_){}
const savePending=()=>lsSet('reg.cloud.pending',[...C.pending]);
const saveQ=()=>lsSet('reg.cloud.q',C.q);
const online=()=>navigator.onLine!==false;
const configured=()=>!!(CFG.url&&CFG.key&&window.supabase);

/* ---- local writes → pending ---- */
window.onLocalWrite=p=>{if(C.applying)return;C.ver[p]=(C.ver[p]||0)+1;C.pending.add(p);savePending();schedulePush()};
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
  /* every teacher has her own account and data; a student (university-email) account cannot be a teacher */
  if(isStudentEmail(C.user.email)){C.owner=false;C.status='notowner';C.err='هذا إيميل طالبة. حساب الأستاذة يكون بإيميلك أنتِ.';render();return}
  const prev=lsGet('reg.cloud.uid');
  if(prev&&prev!==C.user.id){
    if(C.pending.size||Object.keys(S.outbox).length){C.err='على هذا الجهاز بيانات حساب آخر لم تُرفع بعد. سجّلي دخول الحساب السابق أولًا حتى تُرفع.';C.owner=false;C.status='error';await C.sb.auth.signOut();render();return}
    LDB.load({});lsSet('reg.attpub',{});C.lastPull='';lsSet('reg.cloud.lastPull','');C.ex=[];C.exLoaded=false;C.ann=[];C.q=[];saveQ();S.sheet=null}
  lsSet('reg.cloud.uid',C.user.id);C.owner=true;
  if(!online()){C.status='offline';render();return}
  try{if(!C.lastPull){const {count,error}=await C.sb.from('docs').select('path',{count:'exact',head:true});if(error)throw error;
    if(!count){LDB.paths().forEach(p=>C.pending.add(p));savePending()}}}
  catch(e){C.status='error';C.err='تعذّر الاتصال بقاعدة البيانات. تأكدي أن نص الإعداد (setup.sql) نُفّذ في Supabase.';render();return}
  await sync(true);
}
async function sync(full){
  if(!C.sb||!C.user||!C.owner||C.busy)return;if(!online()){C.status='offline';renderHead(computeStats());return}
  C.busy=true;C.status='syncing';renderHead(computeStats());
  try{
    /* push */
    const paths=[...C.pending];let secChanged=false;
    for(let i=0;i<paths.length;i+=200){const part=paths.slice(i,i+200);
      const v0={};const rows=part.map(p=>{v0[p]=C.ver[p]||0;const d=LDB.raw(p);secChanged=true;return{owner:C.user.id,path:p,data:d,deleted:d==null}});
      const {error}=await C.sb.from('docs').upsert(rows,{onConflict:'owner,path'});if(error)throw error;part.forEach(p=>{if((C.ver[p]||0)===v0[p])C.pending.delete(p)});savePending()}
    await flushQ();
    if(secChanged||full)await publishSections();
    /* pull */
    for(let page=0;page<50;page++){
      let q=C.sb.from('docs').select('path,data,deleted,updated_at').order('updated_at',{ascending:true}).limit(1000);
      if(C.lastPull)q=q.gt('updated_at',C.lastPull);
      const {data,error}=await q;if(error)throw error;if(!data||!data.length)break;
      C.applying=true;try{for(const r of data){if(C.pending.has(r.path))continue;LDB.applyRemote(r.path,r.deleted?null:r.data)}}finally{C.applying=false}
      C.lastPull=data[data.length-1].updated_at;lsSet('reg.cloud.lastPull',C.lastPull);if(data.length<1000)break}
    await loadExcuses();await loadAnn();await loadGrades();await loadMsgs();
    C.status='ok';C.err='';
  }catch(e){C.status='error';C.err=(e&&e.message)||'تعذّرت المزامنة'}
  finally{C.busy=false;render()}
}
async function publishSections(){
  const t=term();if(!t)return;const list=secs();
  const since=ymd(new Date(Date.now()-35*864e5));const A=allAtt();
  const rows=list.map(c=>({id:c.id,owner:C.user.id,name:c.name,short:c.short||'',meetings:(c.meetings||[]).map(m=>({id:m.id,day:m.day,start:m.start,end:endOf(m),room:m.room||'',hours:m.hours})),term_start:t.start,weeks:t.weeks,teacher:[(S.settings.profile||{}).title,(S.settings.profile||{}).name].filter(Boolean).join(' '),hours_note:(S.settings.profile||{}).hours||'',
    cancelled:A.filter(d=>d.classId===c.id&&d.cancelled&&d.date>=since).map(d=>({date:d.date,meeting_id:d.meetingId,reason:d.reason||''}))}));
  if(rows.length){const {error}=await C.sb.from('sections_public').upsert(rows);if(error)throw error}
  await publishRoster(list);
  await publishAttendance(list);
  const ids=list.map(c=>c.id);const {data}=await C.sb.from('sections_public').select('id').eq('owner',C.user.id);
  const gone=(data||[]).map(r=>r.id).filter(id=>!ids.includes(id));if(gone.length)await C.sb.from('sections_public').delete().eq('owner',C.user.id).in('id',gone);
}
/* the teacher's rosters, as (section, university ID): lets each student see only her own sections */
async function publishRoster(list){
  const me=C.user.id,want=new Map();
  for(const c of list)for(const st of c.students||[]){const u=normId(st.uid);if(u)want.set(c.id+'|'+u,{section_id:c.id,uid:u,name:st.name||'',owner:me})}
  let have=[];for(let from=0;;from+=1000){const {data,error}=await C.sb.from('roster').select('section_id,uid,name').eq('owner',me).range(from,from+999);if(error)throw error;have=have.concat(data||[]);if(!data||data.length<1000)break}
  const hk=new Map(have.map(r=>[r.section_id+'|'+r.uid,r]));
  const up=[...want.entries()].filter(([k,v])=>!hk.has(k)||hk.get(k).name!==v.name).map(([,v])=>v);
  for(let i=0;i<up.length;i+=500){const {error}=await C.sb.from('roster').upsert(up.slice(i,i+500),{onConflict:'section_id,uid'});if(error)throw error}
  const gone=new Map();for(const k of hk.keys())if(!want.has(k)){const[sid,u]=k.split('|');if(!gone.has(sid))gone.set(sid,[]);gone.get(sid).push(u)}
  for(const[sid,us]of gone)for(let i=0;i<us.length;i+=200){const {error}=await C.sb.from('roster').delete().eq('owner',me).eq('section_id',sid).in('uid',us.slice(i,i+200));if(error)throw error}
}
/* each student's attendance numbers (only she can read her row) */
async function publishAttendance(list){
  const me=C.user.id,ids=new Set(list.map(c=>c.id)),st=S.settings,stats=computeStats().filter(x=>ids.has(x.c.id));
  const prev=lsGet('reg.attpub')||{},next={},rows=[];
  for(const x of stats){const u=normId(x.s.uid);if(!u)continue;const k=x.c.id+'|'+u;
    const items=sessOf(x.c.id).filter(d=>!d.cancelled).map(d=>{const m=(d.marks||{})[x.s.id];return m&&m!=='p'?{d:d.date,m,h:+d.hours||0}:null}).filter(Boolean);
    const row={section_id:x.c.id,uid:u,owner:me,att_pct:x.attPct,abs_h:x.absH,planned:r2(x.planned),max_abs:r2(x.maxAbs),left_h:r2(Math.max(0,x.left)),level:x.level,cut:!!x.cut,min_attend:st.minAttend,items};
    const sig=JSON.stringify(row);next[k]=sig;if(prev[k]!==sig)rows.push(row)}
  for(let i=0;i<rows.length;i+=300){const {error}=await C.sb.from('attendance_public').upsert(rows.slice(i,i+300),{onConflict:'section_id,uid'});if(error)throw error}
  const gone=Object.keys(prev).filter(k=>!(k in next));
  for(const k of gone){const[sid,u]=k.split('|');await C.sb.from('attendance_public').delete().eq('owner',me).eq('section_id',sid).eq('uid',u)}
  lsSet('reg.attpub',next);
}
/* actions done without internet wait here and are sent in order once online */
async function flushQ(){
  const hadMsg=C.q.some(a=>a.t==='msg');
  while(C.q.length){const a=C.q[0];let r;
    if(a.t==='dec')r=await C.sb.from('excuses').update({status:a.status,reason:a.reason||null,decided_at:a.status==='pending'?null:a.at}).eq('id',a.id);
    else if(a.t==='ann'){const row={...a.row};delete row.id;delete row.created_at;r=await C.sb.from('announcements').insert(row)}
    else if(a.t==='annDel')r=await C.sb.from('announcements').delete().eq('id',a.id);
    else if(a.t==='msg')r=await C.sb.from('messages').insert({section_id:a.row.section_id,student_user:a.row.student_user,body:a.row.body});
    if(r&&r.error)throw r.error;C.q.shift();saveQ()}
  if(hadMsg){C.msgs=C.msgs.filter(m=>!String(m.id).startsWith('tmp-'));await loadMsgs()}
}
function overlayQ(){
  for(const a of C.q){
    if(a.t==='dec'){const e=C.ex.find(x=>x.id===a.id);if(e){e.status=a.status;e.reason=a.reason||null}}
    else if(a.t==='ann'){if(!C.ann.find(x=>x.id===a.row.id))C.ann.unshift(a.row)}
    else if(a.t==='annDel')C.ann=C.ann.filter(x=>x.id!==a.id);
    else if(a.t==='msg'){if(!C.msgs.find(x=>x.id===a.row.id))C.msgs.push(a.row)}}
}
function enqueue(a){C.q.push(a);saveQ();overlayQ();lsSet('reg.ann',C.ann);if(online())sync();else renderHead(computeStats())}
async function loadAnn(){const {data,error}=await C.sb.from('announcements').select('*').eq('owner',C.user.id).order('created_at',{ascending:false}).limit(200);if(!error){C.ann=data||[];overlayQ();lsSet('reg.ann',C.ann)}}
async function loadExcuses(){
  const {data,error}=await C.sb.from('excuses').select('*').eq('teacher',C.user.id).order('created_at',{ascending:false}).limit(1000);if(error)throw error;
  C.ex=data||[];overlayQ();C.exAt=Date.now();C.exLoaded=true;
}
window.addEventListener('online',()=>{if(C.user)afterLogin()});
window.addEventListener('offline',()=>{if(C.sb){C.status='offline';render()}});
setInterval(()=>{if(C.owner&&online())sync()},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&C.owner&&online())sync()});

/* ---- grades: Excel → each student sees only her own row ---- */
async function loadGrades(){
  const {data,error}=await C.sb.from('grades').select('section_id,title,max,uid,updated_at').eq('owner',C.user.id).limit(20000);if(error)return;
  const g={};for(const r of data||[]){const k=r.section_id;(g[k]=g[k]||{});const t=(g[k][r.title]=g[k][r.title]||{title:r.title,max:r.max,n:0,at:r.updated_at});t.n++;if(r.updated_at>t.at)t.at=r.updated_at}
  C.grades=g;
}
const numOf=v=>{if(v===''||v==null)return null;const n=+normDigits(String(v)).replace(/[٫,]/g,'.');return Number.isFinite(n)?n:null};
async function parseGrades(file,c){
  C.gBusy=c.id;S.openCls=c.id;render();
  try{await loadXLSX();const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});const sheets=[];
    const roster=new Map((c.students||[]).map(s=>[normId(s.uid),s]));
    for(const sn of wb.SheetNames){
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:true,defval:''}).map(r=>r.map(v=>typeof v==='string'?normDigits(v):v));
      const W=Math.max(0,...rows.map(r=>r.length));let idCol=-1,best=0;
      for(let j=0;j<W;j++){const k=rows.filter(r=>/^\d{7,10}$/.test(String(r[j]??'').trim())).length;if(k>best){best=k;idCol=j}}
      if(idCol<0||best<1)continue;
      const first=rows.findIndex(r=>/^\d{7,10}$/.test(String(r[idCol]??'').trim()));
      const head=(rows[first-1]||[]).map(x=>String(x??'').trim()),data=rows.filter(r=>/^\d{7,10}$/.test(String(r[idCol]??'').trim()));
      let nameCol=-1,nb=0;for(let j=0;j<W;j++){const k=data.filter(r=>AR.test(String(r[j]??''))&&/\s/.test(String(r[j]??''))).length;if(k>nb){nb=k;nameCol=j}}
      const TOT=/المجموع|الإجمالي|الاجمالي|الدرجة الكلية|total/i,SKIP=/^(م|#|تسلسل|مسلسل|الرقم|رقم الطالب|الرقم الجامعي|اسم الطالب|اسم الطالبة|الاسم)$/;
      let totCol=-1;const items=[];
      for(let j=0;j<W;j++){if(j===idCol||j===nameCol)continue;const h=head[j]||'';if(!h||SKIP.test(h))continue;
        if(!data.some(r=>numOf(r[j])!=null))continue;if(TOT.test(h)&&totCol<0)totCol=j;else items.push([j,h])}
      const out=[];
      for(const r of data){const it={};let sum=0,any=false;for(const[j,h]of items){const v=numOf(r[j]);it[h]=v;if(v!=null){sum+=v;any=true}}
        const tot=totCol>=0?numOf(r[totCol]):(any?Math.round(sum*100)/100:null);if(tot==null&&!any)continue;
        out.push({uid:normId(r[idCol]),name:String(r[nameCol]??'').trim(),items:it,total:tot})}
      if(!out.length)continue;
      const maxGuess=(head.join(' ').match(/من\s*(\d{1,3})|\/\s*(\d{1,3})/)||[]).slice(1).find(Boolean);
      sheets.push({title:sn.trim(),max:maxGuess?+maxGuess:(/نصفي|ميد|mid/i.test(sn)?30:''),rows:out,cols:items.map(x=>x[1]),hasTot:totCol>=0,on:true,
        inRoster:out.filter(x=>roster.has(x.uid)).length})}
    if(!sheets.length)toast('لم أجد درجات في الملف. تأكدي أن فيه عمود الرقم الجامعي وأن خانات الدرجات معبّأة.',5000);
    else C.gImp={cid:c.id,sheets};
  }catch(e){toast(navigator.onLine===false?'قراءة Excel تحتاج اتصالًا أول مرة':'تعذّرت قراءة ملف الدرجات',4000)}
  C.gBusy=null;render();
}
async function publishGrades(){
  const G=C.gImp;if(!G)return;if(!online()){toast('نشر الدرجات يحتاج اتصالًا بالإنترنت');return}
  const me=C.user.id;let n=0;
  try{for(const sh of G.sheets.filter(x=>x.on)){const title=(sh.title||'درجات').trim().slice(0,60),max=numOf(sh.max);
      const rows=sh.rows.map(r=>({owner:me,section_id:G.cid,uid:r.uid,title,items:r.items,total:r.total,max,published:true}));
      for(let i=0;i<rows.length;i+=500){const {error}=await C.sb.from('grades').upsert(rows.slice(i,i+500),{onConflict:'section_id,title,uid'});if(error)throw error}
      const keep=rows.map(r=>r.uid).filter(Boolean);
      if(keep.length){const {error}=await C.sb.from('grades').delete().eq('owner',me).eq('section_id',G.cid).eq('title',title).not('uid','in','('+keep.join(',')+')');if(error)throw error}
      n++}
    C.gImp=null;await loadGrades();toast(`نُشرت ${n===1?'الدرجات':n+' تقييمات'} للطالبات ✓`);
  }catch(e){toast('تعذّر نشر الدرجات: '+((e&&e.message)||''),5000)}
  render();
}
window.gradesBlock=function(c){
  const list=Object.values(C.grades[c.id]||{});
  let h=`<div class="sec"><span class="lbl">الدرجات (تظهر لكل طالبة درجتها فقط)</span>`;
  if(!C.owner)return h+`<span class="hint">سجّلي الدخول من «الربط بالإنترنت» لنشر الدرجات.</span></div>`;
  if(list.length)h+=`<div class="slist">${list.map(t=>`<div class="srow" style="grid-template-columns:1fr auto auto"><span><b>${esc(t.title)}</b> <span class="hint num">· ${t.n} طالبة${t.max?' · من '+nf(t.max):''}</span></span><span></span>
    <button class="lnk red" data-act="gDel" data-c="${esc(c.id)}" data-t="${esc(t.title)}">${S.armed==='g:'+c.id+t.title?'تأكيد الحذف':'حذف'}</button></div>`).join('')}</div>`;
  const G=C.gImp&&C.gImp.cid===c.id?C.gImp:null;
  if(C.gBusy===c.id)h+='<div class="busy"><span class="spin"></span>أقرأ ملف الدرجات…</div>';
  else if(G){h+=G.sheets.map((sh,i)=>`<div class="card impcard ${sh.on?'':'off'}"><label class="chk"><input type="checkbox" data-gi="on" data-i="${i}"${sh.on?' checked':''}> <b>${esc(sh.title)}</b></label>
      <div class="inline"><div class="f"><label>اسم التقييم (يظهر للطالبات)</label><input value="${esc(sh.title)}" data-gi="title" data-i="${i}"></div>
      <div class="f" style="max-width:130px;min-width:100px"><label>الدرجة من</label><input type="number" min="0" inputmode="decimal" value="${esc(sh.max)}" data-gi="max" data-i="${i}" placeholder="مثلًا 20"></div></div>
      <div class="preview num">${sh.rows.length} طالبة لها درجة${sh.inRoster<sh.rows.length?` · <b style="color:var(--warn)">${sh.rows.length-sh.inRoster} غير موجودات في كشف الشعبة</b>`:' · كلهن في الكشف ✓'}<br>
      الأعمدة: ${esc(sh.cols.join('، '))}${sh.hasTot?' + المجموع':' (المجموع يُحسب تلقائيًا)'}<br>
      مثال: ${esc(sh.rows.slice(0,2).map(r=>(r.name.split(' ')[0]||r.uid)+' = '+(r.total??'—')).join('، '))}</div></div>`).join('')+
      `<div class="inline"><button class="btn pri" data-act="gPub">نشر للطالبات</button><button class="btn" data-act="gCancel">إلغاء</button></div>`}
  else h+=`<div class="inline"><span class="filebtn btn"><span>رفع ملف درجات (Excel)</span><input type="file" accept=".xlsx,.xls,.csv" data-chg="gfile" data-c="${esc(c.id)}" aria-label="ملف الدرجات"></span><span class="hint">كل صفحة في الملف = تقييم (مثل: اختبار نصفي)</span></div>`;
  return h+'</div>';
};

/* ---- messages: one thread per (section, student) ---- */
async function loadMsgs(){
  const {data,error}=await C.sb.from('messages').select('*').eq('teacher',C.user.id).order('created_at',{ascending:true}).limit(2000);
  if(error)return;C.msgs=data||[];overlayQ();lsSet('reg.msgs',C.msgs.slice(-500));
}
const tkey=m=>m.section_id+'|'+m.student_user;
function threads(){const by=new Map();for(const m of C.msgs){const k=tkey(m);if(!by.has(k))by.set(k,{k,section_id:m.section_id,student_user:m.student_user,uid:m.student_uid,name:m.student_name,list:[]});
  const t=by.get(k);t.list.push(m);if(!t.name&&m.student_name)t.name=m.student_name}
  return [...by.values()].map(t=>({...t,last:t.list[t.list.length-1],unread:t.list.filter(m=>!m.from_teacher&&!m.read_at).length})).sort((a,b)=>a.last.created_at<b.last.created_at?1:-1)}
const unreadMsgs=()=>C.msgs.filter(m=>!m.from_teacher&&!m.read_at).length;
async function markRead(t){
  const ids=t.list.filter(m=>!m.from_teacher&&!m.read_at).map(m=>m.id);if(!ids.length)return;
  const now=new Date().toISOString();ids.forEach(id=>{const m=C.msgs.find(x=>x.id===id);if(m)m.read_at=now});lsSet('reg.msgs',C.msgs.slice(-500));renderHead(computeStats());
  if(online())await C.sb.from('messages').update({read_at:now}).in('id',ids);
}
const fM=F({day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
function vMsgs(){
  const T=threads();
  if(C.thread){const t=T.find(x=>x.k===C.thread);if(!t){C.thread=null;return vMsgs()}const c=cById(t.section_id);
    return `<div class="sec-h"><button class="lnk" data-act="mBack">→ كل المحادثات</button><button class="lnk" data-act="exRefresh">تحديث</button></div>
    <div class="card" style="padding:12px 14px"><b>${esc(t.name||t.uid)}</b> <span class="hint num">· ${esc(t.uid)} · ${esc(c?c.short||c.name:'')}</span></div>
    <div class="chat">${t.list.map(m=>`<div class="bub ${m.from_teacher?'me':''}"><p>${esc(m.body)}</p><small class="num">${esc(fM.format(new Date(m.created_at)))}${m.from_teacher&&String(m.id).startsWith('tmp-')?' · بانتظار الإرسال':''}</small></div>`).join('')}</div>
    <div class="card form"><div class="f"><label for="mr">ردّك</label><textarea id="mr" maxlength="1000" style="min-height:80px" placeholder="اكتبي ردّك…"></textarea></div>
    <div><button class="btn pri" data-act="mSend">إرسال</button></div></div>`}
  const bc=`<button class="btn pri" style="width:100%" data-act="annNew">📢 رسالة لكل الطالبات (إعلان)</button>`;
  if(!T.length)return bc+`<div class="card empty"><b>لا رسائل بعد</b>تظهر هنا رسائل طالبات شعبك. تراسلك الطالبة من تبويب «رسائل» في صفحتها.</div>`;
  return bc+`<div class="alerts">${T.map(t=>{const c=cById(t.section_id);return `<button class="card al ${t.unread?'l1':''}" style="text-align:start;width:100%" data-act="mOpen" data-k="${esc(t.k)}"><span class="stripe" ${t.unread?'':'style="background:var(--line)"'}></span><div class="body">
    <div class="top1"><div><div class="name">${esc(t.name||t.uid)}</div><div class="cls num">${esc(c?c.short||c.name:'')} · ${esc(t.uid)}</div></div>${t.unread?`<span class="pill new num">${t.unread} جديدة</span>`:''}</div>
    <div class="hint" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.last.from_teacher?'أنتِ: ':''}${esc(t.last.body)}</div><small class="hint num">${esc(fM.format(new Date(t.last.created_at)))}</small></div></button>`}).join('')}</div>`;
}

/* ---- QR code of the student page: show in class or save as an image ---- */
async function showQR(){
  try{if(!window.QRCode)await loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js')}catch(e){toast('الباركود يحتاج اتصالًا بالإنترنت أول مرة');return}
  document.getElementById('qrbox')?.remove();
  const o=document.createElement('div');o.id='qrbox';o.className='role';o.style.zIndex=80;
  o.innerHTML=`<div class="role-in"><h1>صفحة الطالبات</h1><p>صوّري الباركود بكاميرا الجوال</p>
    <div id="qrc" style="background:#fff;padding:18px;border-radius:20px;box-shadow:0 10px 30px -18px rgba(0,0,0,.5)"></div>
    <p dir="ltr" style="font-size:.85rem">${esc(studentLink())}</p>
    <div class="inline" style="justify-content:center"><button class="btn pri" data-act="qrSave">تنزيل صورة</button><button class="btn" data-act="exLink">نسخ الرابط</button><button class="btn" data-act="qrClose">إغلاق</button></div></div>`;
  document.body.appendChild(o);
  new QRCode(document.getElementById('qrc'),{text:studentLink(),width:Math.min(300,innerWidth-90),height:Math.min(300,innerWidth-90),colorDark:'#17707a',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.H});
}

/* ---- header ---- */
const _renderHead=renderHead;
renderHead=function(stats){_renderHead(stats);
  const net=document.querySelector('#sum .net');
  if(net&&C.sb){const pend=C.pending.size+Object.keys(S.outbox).length+C.q.length;
    const t=C.status==='ok'?(pend?'جارٍ الرفع':'متزامن'):C.status==='syncing'?'جارٍ المزامنة':C.status==='offline'?(pend?`${pend} بانتظار النت`:'بدون اتصال'):C.status==='login'?'غير مسجّلة':C.status==='error'?'خطأ في الاتصال':'على الجهاز';
    net.className='net'+(C.status==='ok'&&!pend?'':' off');net.innerHTML='<i></i>'+t;
    if(C.user){const b=document.createElement('button');b.className='pill '+(S.armed==='out'?'deny':'muted');b.dataset.act='cOut';b.title=C.user.email||'';
      b.textContent=S.armed==='out'?'تأكيد الخروج':'⎋ خروج';net.after(b)}}
  const n=C.ex.filter(e=>e.status==='pending').length+unreadMsgs(),b=document.querySelector('.tabs button[data-tab="exc"]');
  if(b){b.querySelector('.dot')?.remove();if(n&&S.tab!=='exc'){const s=document.createElement('span');s.className='dot num';s.style.background='var(--accent)';s.textContent=n;b.appendChild(s)}}
};

/* ---- home badge ---- */
const _vHome=vHome;
vHome=function(stats){let h=_vHome(stats);const n=C.ex.filter(e=>e.status==='pending').length,m=unreadMsgs();
  const parts=[n?(n===1?'عذر جديد':n===2?'عذران جديدان':n+' أعذار جديدة'):'',m?(m===1?'رسالة جديدة':m===2?'رسالتان جديدتان':m+' رسائل جديدة'):''].filter(Boolean);
  if(parts.length)h=h.replace('<div class="greet">',`<div class="greet"><button class="exbadge" data-act="${m&&!n?'exGoMsg':'tab'}" data-tab="exc">${m&&!n?'💬':'📩'} عندك ${parts.join(' و')}</button>`);
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
  const first=e.student_name.split(' ')[0],kw={'مرضي':'سلامتك ما تشوفين شر، الله يشفيك ويعافيك.','وفاة':'أحسن الله عزاءك وغفر لميّتك.','ظرف عائلي':'الله ييسّر أمرك.','موعد رسمي':'الله يوفقك.'}[e.kind]||'';
  return e.status==='approved'?`أهلًا ${first}${kw?'\n'+kw:''}\nتم اعتماد عذرك عن محاضرة ${c?c.short||c.name:''} يوم ${when}، ولن يُحتسب عليك غيابًا.\nبالتوفيق`
    :`أهلًا ${first}${kw?'\n'+kw:''}\nنعتذر، لم يُعتمد عذرك عن محاضرة ${c?c.short||c.name:''} يوم ${when}.${e.reason?'\nالسبب: '+e.reason:''}\nإذا عندك ما يوضح وضعك، راسليني من صفحة شعبتي.`}
window.vExc=function(stats){
  if(!configured())return `<div class="card empty"><b>استقبال الأعذار يحتاج الربط بالإنترنت</b>بعد إضافة بيانات Supabase في ملف config.js، سجّلي دخولك من «الإعداد».<br><br><button class="btn pri" data-act="tab" data-tab="manage">الإعداد</button></div>`;
  if(!C.user||!C.owner)return `<div class="card empty"><b>سجّلي دخولك أولًا</b>من «الإعداد» ← الربط بالإنترنت، لتصلك أعذار الطالبات.<br><br><button class="btn pri" data-act="tab" data-tab="manage">تسجيل الدخول</button></div>`;
  const um=unreadMsgs(),pe=C.ex.filter(e=>e.status==='pending').length;
  const sw=`<div class="filters" style="margin-bottom:4px"><button data-act="exView" data-v="exc" aria-pressed="${C.exView!=='msg'}">📩 الأعذار${pe?` <span class="num">${pe}</span>`:''}</button><button data-act="exView" data-v="msg" aria-pressed="${C.exView==='msg'}">💬 الرسائل${um?` <span class="num">${um}</span>`:''}</button></div>`;
  if(C.exView==='msg')return `<section class="sec">${sw}${vMsgs()}</section>`;
  const cnt=k=>C.ex.filter(e=>e.status===k).length;const f=C.exFilter;
  const today=ymd(new Date()),act=C.ann.filter(a=>!a.until||a.until>=today);
  let h=`<section class="sec">${sw}</section><section class="sec"><div class="sec-h"><h2>📢 رسالة لكل الطالبات (إعلانات)</h2><button class="lnk" data-act="annToggle">${C.annOpen?'إغلاق':'+ إعلان جديد'}</button></div>
  ${C.annOpen?`<div class="card form"><div class="f"><label for="anb">نص الإعلان</label><textarea id="anb" maxlength="500" placeholder="مثال: محاضرة الأحد ستكون في قاعة SH-BF-04 بدل القاعة المعتادة"></textarea></div>
    <div class="setgrid"><div class="f"><label for="ans">لمن؟</label><select id="ans"><option value="">كل الشعب</option>${secs().map(c=>`<option value="${esc(c.id)}">${esc(c.short||c.name)}</option>`).join('')}</select></div>
    <div class="f"><label for="anu">يظهر حتى</label><input id="anu" type="date" value="${ymd(new Date(Date.now()+7*864e5))}"></div></div>
    <div><button class="btn pri" data-act="annPost">نشر الإعلان</button></div></div>`:''}
  ${act.length?`<div class="alerts">${act.map(a=>{const c=a.section_id&&cById(a.section_id);return `<div class="card annc"><p>📢 ${esc(a.body)}</p><div class="facts"><span>${c?esc(c.short||c.name):'كل الشعب'}</span>${a.until?`<span class="num">حتى ${esc(fD.format(pd(a.until)))}</span>`:''}<button class="lnk red" data-act="annDel" data-id="${esc(a.id)}">حذف</button></div></div>`}).join('')}</div>`:'<p class="hint">لا إعلانات حالية. المحاضرات المُلغاة تظهر للطالبات تلقائيًا.</p>'}
  </section><section class="sec"><div class="sec-h"><h2>أعذار الطالبات</h2><button class="lnk" data-act="exRefresh">${C.busy?'جارٍ التحديث…':'تحديث'}</button></div>
  ${!online()?`<div class="banner warn" style="margin:0">بدون اتصال. الأعذار محفوظة في قاعدة البيانات على الإنترنت فقط ولا تُخزَّن على جوالك${C.exLoaded?'، والمعروض هنا من آخر فتح للصفحة':''}. قراراتك تُرفع تلقائيًا عند الاتصال${C.q.length?` (<b class="num">${C.q.length}</b> بالانتظار)`:''}.</div>`:''}
  <div class="filters">${[['pending','بانتظارك'],['approved','معتمدة'],['rejected','مرفوضة']].map(([k,t])=>`<button data-act="exFilter" data-f="${k}" aria-pressed="${f===k}">${t} <span class="num">${cnt(k)}</span></button>`).join('')}</div>
`;
  const list=C.ex.filter(e=>e.status===f);
  if(!C.exLoaded)h+=`<div class="card empty"><b>${online()?'جارٍ جلب الأعذار…':'الأعذار تظهر عند الاتصال'}</b>تُقرأ الأعذار من قاعدة البيانات مباشرة ولا تُحفظ على جوالك.</div>`;
  else if(!list.length)h+=`<div class="card empty"><b>${f==='pending'?'لا أعذار بانتظارك':'لا شيء هنا بعد'}</b>${f==='pending'?'أي عذر ترسله طالبة يظهر هنا فور الاتصال.':''}</div>`;
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
          :`<div class="exacts"><button class="btn pri lg" data-act="exApprove" data-id="${esc(e.id)}">✓ اعتماد</button><button class="btn danger lg" data-act="exRejOpen" data-id="${esc(e.id)}">✗ رفض</button></div>`)
          :`<div class="inline"><button class="btn sm" data-act="exCopy" data-id="${esc(e.id)}">نسخ الرد للطالبة</button><button class="lnk mut" data-act="exUndo" data-id="${esc(e.id)}">تراجع</button></div>`}
      </div></article>`}
    h+='</div>'}
  return h+`<p class="rule">عند الاعتماد يتحوّل غياب الطالبة في تلك المحاضرة إلى «غائبة بعذر» وتتعدّل نسبتها. العذر المرسل بعد أكثر من <b class="num">${lateDays()}</b> أيام من المحاضرة يظهر بعلامة «متأخر».</p></section>`;
};
async function decide(id,status,reason){
  const e=C.ex.find(x=>x.id===id);if(!e)return;
  C.q=C.q.filter(a=>!(a.t==='dec'&&a.id===id));
  e.status=status;e.reason=reason||null;enqueue({t:'dec',id,status,reason:reason||null,at:new Date().toISOString()});
  const s=matchStudent(e),{c,m}=lectureOf(e);let note='';
  if(!s)note=' — الطالبة غير موجودة في كشف الشعبة، فلم يتغير السجل';
  else if(c){const d=allAtt().find(x=>x.classId===c.id&&x.date===e.lecture_date&&(!m||x.meetingId===m.id));
    if(d&&d.cancelled)note=' — المحاضرة مُلغاة أصلًا';
    else if(d){const cur=(d.marks||{})[s.id];let nv=null;
      if(status==='approved'&&cur!=='e')nv='e';
      if(status!=='approved'&&cur==='e')nv='a';
      if(nv){const body={...d,marks:{...d.marks,[s.id]:nv},updatedAt:new Date().toISOString()};delete body.id;queue(d.id,body);
        note=nv==='e'?' — وتحوّلت في السجل إلى «غائبة بعذر»':' — وأُعيدت في السجل إلى «غائبة»'}}
    else if(status==='approved')note=' — المحاضرة لم تُحضّر بعد، وستظهر «غائبة بعذر» تلقائيًا عند تحضيرها'}
  toast((status==='approved'?'اعتُمد العذر ✓':status==='rejected'?'رُفض العذر':'أُعيد العذر للانتظار')+note+(online()?'':' (يُرفع عند الاتصال)'),note?6000:2400);C.rejFor=null;render();
}
async function openFile(id){const e=C.ex.find(x=>x.id===id);if(!e||!e.file_path)return;
  if(!online()){toast('عرض المرفق يحتاج اتصالًا');return}
  toast('أفتح المرفق…',1500);
  const {data,error}=await C.sb.storage.from('excuse-files').download(e.file_path);
  if(error||!data){toast('تعذّر فتح المرفق: '+((error&&(error.message||error.error))||'غير موجود'),6000);return}
  const url=URL.createObjectURL(data),isPdf=/pdf/i.test(data.type)||/\.pdf$/i.test(e.file_path);
  document.getElementById('fileview')?.remove();
  const o=document.createElement('div');o.id='fileview';o.className='role';o.style.zIndex=80;
  o.innerHTML=`<div class="role-in" style="max-width:720px"><h1 style="font-size:1.2rem">مرفق عذر ${esc(e.student_name)}</h1>
    ${isPdf?`<iframe src="${url}#toolbar=0" style="width:100%;height:65vh;border:0;border-radius:14px;background:#fff"></iframe>`:`<img src="${url}" alt="المرفق" style="max-width:100%;max-height:65vh;border-radius:14px;box-shadow:0 10px 30px -18px rgba(0,0,0,.5)">`}
    <div class="inline" style="justify-content:center"><button class="btn pri" data-act="fvClose">إغلاق</button></div></div>`;
  document.body.appendChild(o);
}
function studentLink(){return location.href.replace(/[#?].*$/,'').replace(/[^/]*$/,'')+'excuse.html'}

/* ---- settings: connection ---- */
const _vManage=vManage;
vManage=function(){let h=_vManage();
  let box;
  if(!window.supabase)box=`<p class="rule">مكتبة الربط لم تُحمّل بعد. افتحي التطبيق مرة وأنتِ متصلة بالإنترنت.</p>`;
  else if(!CFG.url||!CFG.key)box=`<p class="rule">أضيفي رابط مشروع Supabase ومفتاح anon في ملف <b>config.js</b> على GitHub، ثم أعيدي فتح التطبيق.</p>`;
  else if(!C.user)box=`<p class="hint">${C.authMode==='up'?'أنشئي حسابك مرة واحدة. سيصلك بريد تأكيد، اضغطي الرابط فيه ثم ارجعي وسجّلي الدخول.':'سجّلي دخولك لتتزامن بياناتك وتصلك الأعذار.'}</p>
    <div class="setgrid"><div class="f"><label for="ce">البريد الإلكتروني</label><input id="ce" name="username" type="email" autocomplete="username" dir="ltr"></div><div class="f"><label for="cp">كلمة المرور</label><input id="cp" type="password" autocomplete="${C.authMode==='up'?'new-password':'current-password'}" dir="ltr"></div></div>
    <div class="inline"><button class="btn pri" data-act="cAuth">${C.authMode==='up'?'إنشاء الحساب':'تسجيل الدخول'}</button><button class="lnk" data-act="cMode">${C.authMode==='up'?'عندي حساب':'أول مرة؟ أنشئي حسابًا'}</button></div>`;
  else box=`<div class="state"><span>${C.owner?'✅ مرتبطة':C.status==='notowner'?'⚠️ هذا الحساب ليس حساب أستاذة':'…'} <span class="hint" dir="ltr">${esc(C.user.email||'')}</span></span><button class="lnk mut" data-act="cOut">تسجيل الخروج</button></div>
    <div class="facts num"><span>الحالة: <b>${{ok:'متزامن',syncing:'جارٍ المزامنة',offline:'بدون اتصال',error:'خطأ',notowner:'غير مصرّح'}[C.status]||'—'}</b></span><span>بانتظار الرفع: <b>${C.pending.size+C.q.length}</b></span></div>
    ${C.owner?`<div class="inline"><button class="btn" data-act="exQR">🔳 باركود صفحة الطالبات</button><button class="btn" data-act="exLink">🔗 نسخ الرابط</button><button class="btn" data-act="cSync">مزامنة الآن</button></div>
    <div class="setgrid"><div class="f"><label for="xd">العذر متأخر بعد (أيام)</label><input id="xd" type="number" min="1" max="60" value="${lateDays()}"></div></div><div><button class="btn sm" data-act="cDays">حفظ</button></div>`:''}`;
  if(C.err)box+=`<div class="banner err" style="margin:0">${esc(C.err)}</div>`;
  const sec=`<section class="sec"><h2>الربط بالإنترنت والأعذار</h2><div class="card form">${box}<p class="rule">التحضير والإعداد يعملان بدون إنترنت ويُحفظان على جوالك ثم يُرفعان تلقائيًا. أعذار الطالبات ومرفقاتها تبقى في قاعدة البيانات على الإنترنت فقط ولا تُخزَّن على جوالك.</p></div></section>`;
  /* connection section goes last, just above the backup section, so the timetable comes first */
  const i=h.indexOf('<section class="sec"><h2>النسخة الاحتياطية');
  return i>=0?h.slice(0,i)+sec+h.slice(i):h+sec};

/* ---- sign-in (teachers) ---- */
async function doAuth(email,pw){
  email=String(email).trim();if(!email||pw.length<6){C.err='اكتبي البريد وكلمة مرور من ٦ أحرف على الأقل';render();return}
  if(isStudentEmail(email)){C.err='هذا إيميل طالبة. صفحة الطالبات من «أنا طالبة».';render();return}
  if(!online()){C.err='تسجيل الدخول يحتاج اتصالًا بالإنترنت.';render();return}
  C.authBusy=true;C.err='';render();
  const r=C.authMode==='up'?await C.sb.auth.signUp({email,password:pw,options:{emailRedirectTo:location.href.replace(/[#?].*$/,'')}}):await C.sb.auth.signInWithPassword({email,password:pw});
  C.authBusy=false;
  if(r.error){const m=r.error.message||'';C.err=/confirm/i.test(m)?'أكّدي بريدك أولًا من الرسالة التي وصلتك، ثم سجّلي الدخول.':/Invalid login/i.test(m)?'البريد أو كلمة المرور غير صحيحة.':/registered|exists/i.test(m)?'هذا البريد مسجّل من قبل، سجّلي الدخول.':m;render();return}
  C.err='';if(C.authMode==='up'&&!(r.data&&r.data.session)){C.authMode='in';C.err='';toast('أرسلنا رابط تأكيد إلى بريدك. اضغطيه ثم ارجعي وسجّلي الدخول.',7000)}
  render();
}
/* every teacher signs in first, so her own data (and only hers) loads on any device */
function gate(){
  let el=document.getElementById('tgate');
  const show=configured()&&C.sb&&!C.user&&C.status!=='off';
  if(!show){if(el)el.hidden=true;return}
  if(!el){el=document.createElement('div');el.id='tgate';el.className='role';document.body.appendChild(el)}
  el.hidden=false;const up=C.authMode==='up';
  el.innerHTML=`<div class="role-in"><span class="role-mark"><i></i></span>
    <h1>${up?'إنشاء حساب أستاذة':'دخول الأستاذة'}</h1>
    <p>${up?'حساب واحد لكل أستاذة. شعبك وطالباتك وأعذارهن خاصة بك وحدك.':'ادخلي بحسابك لتظهر شعبك وبياناتك على هذا الجهاز.'}</p>
    <form class="card form" style="width:100%;text-align:start" onsubmit="return false" autocomplete="on">
      <div class="f"><label for="ge">البريد الإلكتروني</label><input id="ge" name="username" type="email" dir="ltr" autocomplete="username"></div>
      <div class="f"><label for="gp">كلمة المرور</label><input id="gp" name="password" type="password" dir="ltr" autocomplete="${up?'new-password':'current-password'}"></div>
      ${C.err?`<div class="banner err" style="margin:0">${esc(C.err)}</div>`:''}
      ${!online()?'<div class="banner warn" style="margin:0">لا يوجد اتصال. الدخول أول مرة يحتاج الإنترنت.</div>':''}
      <button type="submit" class="btn pri lg" data-act="gAuth"${C.authBusy?' disabled':''}>${C.authBusy?'لحظة…':up?'إنشاء الحساب':'دخول'}</button>
      <div class="state"><button type="button" class="lnk" data-act="cMode">${up?'عندي حساب — دخول':'أستاذة جديدة؟ أنشئي حسابًا'}</button>${up?'':'<button type="button" class="lnk mut" data-act="gReset">نسيت كلمة المرور</button>'}</div>
    </form>
    <button type="button" class="btn" data-act="gBack">→ رجوع للبداية</button></div>`;
}
const _render=render;render=function(){_render();gate()};

/* ---- actions ---- */
document.addEventListener('click',async ev=>{const t=ev.target.closest('[data-act]');if(!t)return;const a=t.dataset.act;
  switch(a){
  case 'exView':C.exView=t.dataset.v;C.thread=null;render();break;
  case 'gBack':{try{localStorage.removeItem('reg.role')}catch(_){}C.err='';const rb=document.getElementById('role');if(rb)rb.hidden=false;break}
  case 'exQR':showQR();break;
  case 'fvClose':{const o=document.getElementById('fileview');o&&o.remove();break}
  case 'qrClose':{const o=document.getElementById('qrbox');o&&o.remove();break}
  case 'qrSave':{const cv=document.querySelector('#qrbox canvas');if(!cv)break;cv.toBlob(b=>dl.save({filename:'باركود صفحة الطالبات - شعبتي.png',data:b}).then(()=>toast('نُزّلت صورة الباركود')),'image/png');break}
  case 'annNew':C.exView='exc';C.thread=null;C.annOpen=true;render();window.scrollTo(0,0);setTimeout(()=>{const a=document.getElementById('anb');a&&a.focus()},50);break;
  case 'exGoMsg':S.tab='exc';C.exView='msg';C.thread=null;render();window.scrollTo(0,0);break;
  case 'mOpen':{C.thread=t.dataset.k;render();window.scrollTo(0,0);const th=threads().find(x=>x.k===C.thread);if(th)markRead(th);break}
  case 'mBack':C.thread=null;render();break;
  case 'mSend':{const ta=document.getElementById('mr'),body=(ta&&ta.value||'').trim();if(!body){toast('اكتبي الرد أولًا');return}
    const th=threads().find(x=>x.k===C.thread);if(!th)return;
    const row={id:'tmp-'+Date.now().toString(36),created_at:new Date().toISOString(),section_id:th.section_id,student_user:th.student_user,student_uid:th.uid,student_name:th.name,teacher:C.user.id,from_teacher:true,body};
    enqueue({t:'msg',row});toast(online()?'أُرسل الرد ✓':'حُفظ الرد وسيُرسل عند الاتصال');render();break}
  case 'gPub':publishGrades();break;
  case 'gCancel':C.gImp=null;render();break;
  case 'gDel':{const k='g:'+t.dataset.c+t.dataset.t;S.openCls=t.dataset.c;if(S.armed!==k){S.armed=k;render();return}S.armed=null;
    if(!online()){toast('الحذف يحتاج اتصالًا');break}
    const {error}=await C.sb.from('grades').delete().eq('owner',C.user.id).eq('section_id',t.dataset.c).eq('title',t.dataset.t);
    if(error){toast('تعذّر الحذف');break}await loadGrades();toast('حُذفت الدرجات');render();break}
  case 'annToggle':C.annOpen=!C.annOpen;render();break;
  case 'annPost':{const body=document.getElementById('anb').value.trim();if(body.length<2){toast('اكتبي نص الإعلان');return}
    const row={body,section_id:document.getElementById('ans').value||null,until:document.getElementById('anu').value||null};
    row.id='tmp-'+Date.now().toString(36);row.created_at=new Date().toISOString();C.annOpen=false;enqueue({t:'ann',row});
    toast(online()?'نُشر الإعلان للطالبات 📢':'حُفظ الإعلان وسيُنشر عند الاتصال 📢');render();break}
  case 'annDel':{const id=t.dataset.id;C.ann=C.ann.filter(x=>x.id!==id);
    if(id.startsWith('tmp-')){C.q=C.q.filter(a=>!(a.t==='ann'&&a.row.id===id));saveQ();lsSet('reg.ann',C.ann)}else enqueue({t:'annDel',id});render();break}
  case 'exFilter':C.exFilter=t.dataset.f;C.rejFor=null;render();break;
  case 'exRefresh':sync();break;
  case 'exApprove':decide(t.dataset.id,'approved');break;
  case 'exRejOpen':C.rejFor=t.dataset.id;render();break;
  case 'exRejCancel':C.rejFor=null;render();break;
  case 'exReason':{const i=document.getElementById('rj-'+C.rejFor);if(i)i.value=t.dataset.r;break}
  case 'exReject':{const i=document.getElementById('rj-'+t.dataset.id);const r=i&&i.value.trim();if(!r){toast('اختاري سببًا أو اكتبيه');return}decide(t.dataset.id,'rejected',r);break}
  case 'exUndo':decide(t.dataset.id,'pending');break;
  case 'exFile':if(!online()){toast('عرض المرفق يحتاج اتصالًا');break}openFile(t.dataset.id);break;
  case 'exCopy':{const e=C.ex.find(x=>x.id===t.dataset.id);try{await navigator.clipboard.writeText(replyFor(e));toast('نُسخ الرد، الصقيه في واتساب')}catch(_){toast('تعذّر النسخ')}break}
  case 'exLink':{try{await navigator.clipboard.writeText(studentLink());toast('نُسخ رابط صفحة الطالبات، أرسليه لهن')}catch(_){toast(studentLink(),5000)}break}
  case 'cMode':C.authMode=C.authMode==='up'?'in':'up';render();break;
  case 'cAuth':case 'gAuth':{const g=a==='gAuth';await doAuth((document.getElementById(g?'ge':'ce')||{}).value||'',(document.getElementById(g?'gp':'cp')||{}).value||'');break}
  case 'gReset':{const email=((document.getElementById('ge')||{}).value||'').trim();if(!email){C.err='اكتبي بريدك أولًا';render();return}
    const r=await C.sb.auth.resetPasswordForEmail(email,{redirectTo:location.href.replace(/[#?].*$/,'')});C.err='';toast(r.error?'تعذّر الإرسال':'أرسلنا رابط تغيير كلمة المرور إلى بريدك',5000);break}
  case 'cOut':{if(C.pending.size||C.q.length||Object.keys(S.outbox).length){toast(online()?'لحظة، أرفع بياناتك أولًا ثم اضغطي خروج مرة ثانية':'لا يمكن الخروج الآن: بياناتك لم تُرفع بعد. اتصلي بالإنترنت أولًا.',4500);sync();break}
    if(S.armed!=='out'){S.armed='out';render();toast('اضغطي «تأكيد الخروج» — بياناتك محفوظة في حسابك وتعود عند الدخول',3500);return}S.armed=null;
    await C.sb.auth.signOut();C.owner=false;C.user=null;
    LDB.load({});lsSet('reg.attpub',{});C.lastPull='';lsSet('reg.cloud.lastPull','');lsSet('reg.cloud.uid','');C.pending.clear();savePending();
    C.ex=[];C.exLoaded=false;C.ann=[];lsSet('reg.ann',[]);C.q=[];saveQ();C.grades={};S.sheet=null;S.tab='home';C.status='login';
    try{localStorage.removeItem('reg.role')}catch(_){}
    render();window.scrollTo(0,0);const rb=document.getElementById('role');if(rb)rb.hidden=false;toast('تم تسجيل الخروج');break}
  case 'cSync':sync(true);break;
  case 'cDays':{const v=Math.max(1,parseInt(document.getElementById('xd').value,10)||7);write(()=>db.doc('config/settings').set({...S.settings,excuseDays:v}),'حُفظ');break}
  }
});

document.addEventListener('change',ev=>{const t=ev.target;
  if(t.dataset.chg==='gfile'){const c=cById(t.dataset.c);if(t.files&&t.files[0])parseGrades(t.files[0],c);return}
  const k=t.dataset.gi;if(k&&C.gImp){const sh=C.gImp.sheets[+t.dataset.i];if(k==='on'){sh.on=t.checked;render()}else sh[k]=t.value}});

/* ---- styles ---- */
const st=document.createElement('style');st.textContent=`
.exbadge{display:inline-flex;align-items:center;gap:6px;border:0;background:var(--ink);color:var(--surface);border-radius:999px;padding:5px 14px;font-weight:700;font-size:.84rem;margin-bottom:10px;cursor:pointer}
.exbody{background:var(--bg);border-radius:10px;padding:10px 12px}.exbody p{margin:4px 0 0;white-space:pre-wrap;line-height:1.7}
.exacts{display:grid;grid-template-columns:1fr 1fr;gap:8px}.exacts .btn{width:100%}
.reasons{display:flex;gap:6px;flex-wrap:wrap}
.annc{padding:12px 14px;display:flex;flex-direction:column;gap:6px}.annc p{margin:0;line-height:1.7}
.chat{display:flex;flex-direction:column;gap:8px;padding:4px 0}
.bub{max-width:85%;align-self:flex-start;background:var(--surface);border:1px solid var(--line);border-radius:16px 16px 16px 4px;padding:8px 12px}
.bub.me{align-self:flex-end;background:var(--accent-soft);border-color:transparent;border-radius:16px 16px 4px 16px}
.bub p{margin:0;white-space:pre-wrap;line-height:1.7}.bub small{color:var(--muted);font-size:.72rem}`;document.head.appendChild(st);

connect().then(()=>render());
})();
