/* بيانات تجريبية للأستاذة: ثلاث شعب، طالبات بأسماء وهمية، وتحضير الأسابيع الماضية */
(function(){
  const D=DEMO,today=D.ymd(new Date()),TS=D.termStart();
  const FN=['رهف','جود','ريما','لمى','شهد','نوف','أروى','هيا','دانة','غلا','لجين','وعد','رزان','أثير','سديم','جنى','مها','ليان','ريم','تالا','يارا','بشاير','عهود','ديم','ميار','نجد','حلا','لين','سارا','أمل','رغد','شوق','منار','وجد','ملاك','جوري'];
  const LN=['الغامدي','الزهراني','الشهري','العمري','الحربي','القحطاني','المالكي','الدوسري','العتيبي','السبيعي','الشمري','الأحمدي','البلوي','الحارثي','الثبيتي','الجهني'];
  const R=D.rnd(1448);
  const mk=(n,base)=>Array.from({length:n},(_,i)=>({id:'s'+base+'_'+i,name:FN[(i*7+base*5)%FN.length]+' '+FN[(i*11+base*3+4)%FN.length].replace(/ة$/,'ة')+' '+LN[(i*5+base)%LN.length],uid:String(446000000+base*1000+i*37+11)}));
  /* أسماء أوسط مذكّرة بدل المكرّر */
  const MID=['محمد','عبدالله','سعد','فهد','أحمد','علي','خالد','سعيد','عايض','ناصر','صالح','عبدالرحمن','حسن','ماجد','سلطان','منصور'];
  const fix=list=>list.map((s,i)=>({...s,name:s.name.split(' ')[0]+' '+MID[(i*3+s.uid.length+i)%MID.length]+' '+s.name.split(' ').slice(-1)[0]}));
  const classes={
    c1:{term:'t1',order:1,name:'شعبة F32 — MIS-1508 الابتكار والتقنيات الناشئة',short:'F32 الابتكار',students:fix(mk(14,1)),
        meetings:[{id:'m1',day:0,start:'11:00',end:'12:40',room:'SH-BF-18',hours:2},{id:'m2',day:2,start:'13:00',end:'13:50',room:'SH-BF-18',hours:1}]},
    c2:{term:'t1',order:2,name:'شعبة F33 — MIS-1508 الابتكار والتقنيات الناشئة',short:'F33 الابتكار',students:fix(mk(12,2)),
        meetings:[{id:'m3',day:1,start:'08:00',end:'09:40',room:'SH-BS-10',hours:2},{id:'m4',day:3,start:'10:00',end:'10:50',room:'SH-BS-10',hours:1}]},
    c3:{term:'t1',order:3,name:'شعبة F35 — MIS-1406 نظم المعلومات الإدارية',short:'F35 نظم',students:fix(mk(11,3)),
        meetings:[{id:'m5',day:4,start:'09:00',end:'10:40',room:'SH-AF-07',hours:2},{id:'m6',day:1,start:'12:00',end:'12:50',room:'SH-AF-07',hours:1},{id:'m7',day:3,start:'14:00',end:'15:40',room:'SH-AF-07',hours:2}]}};
  /* طالبات بغياب أعلى لإظهار الإنذارات */
  const risk={s1_3:.28,s1_8:.18,s2_5:.24,s3_2:.12,s2_9:.09};
  const attendance={};const st=new Date(TS+'T12:00:00'),end=new Date();end.setHours(0,0,0,0);
  for(const [cid,c] of Object.entries(classes))for(let d=new Date(st);d<end;d.setDate(d.getDate()+1)){const dow=d.getDay(),ds=D.ymd(d);
    for(const m of c.meetings){if(m.day!==dow)continue;const id=cid+'_'+ds+'_'+m.id;
      if(cid==='c3'&&m.id==='m5'&&Math.abs((d-st)/864e5-42)<4){attendance[id]={classId:cid,date:ds,meetingId:m.id,start:m.start,hours:m.hours,cancelled:true,reason:'إجازة رسمية',marks:{},updatedAt:d.toISOString()};continue}
      const marks={};for(const s of c.students){const p=risk[s.id]||.03,x=R();marks[s.id]=x<p?'a':x<p+.035?'l':x<p+.045?'e':'p'}
      attendance[id]={classId:cid,date:ds,meetingId:m.id,start:m.start,hours:m.hours,marks,updatedAt:d.toISOString()}}}
  const seed={config:{settings:{terms:[{id:'t1',name:'الفصل الأول ١٤٤٨هـ',start:TS,weeks:15}],currentTerm:'t1',profile:{title:'أستاذة',name:'نعيمه'},minAttend:75,warn1:10,warn2:20}},classes,attendance};
  try{if(localStorage.getItem('demo.day')!==today||!localStorage.getItem('reg.db.v1')){
    Object.keys(localStorage).filter(k=>k.startsWith('demo:')).forEach(k=>Storage.prototype.removeItem.call(localStorage,k.slice(5)));
    localStorage.setItem('reg.db.v1',JSON.stringify(seed));localStorage.setItem('reg.cloud.uid','demo-t');localStorage.setItem('reg.cloud.lastPull','2000-01-01');localStorage.setItem('demo.day',today)}}catch(e){}
  /* الأعذار والرسائل والإعلانات كما تصل من الطالبات */
  const S=c=>classes[c].students,ago=h=>D.iso(new Date(Date.now()-h*36e5));
  const lastOf=(cid,mid)=>Object.values(attendance).filter(a=>a.classId===cid&&a.meetingId===mid&&!a.cancelled).map(a=>a.date).sort().pop();
  const ex=(id,cid,s,mid,kind,body,status,h,file)=>({id,teacher:'demo-t',student_name:S(cid)[s].name,student_uid:S(cid)[s].uid,section_id:cid,lecture_date:lastOf(cid,mid),meeting_id:mid,kind,body,file_path:file||null,status,reason:null,created_at:ago(h),decided_at:status==='pending'?null:ago(h-2)});
  const DB={docs:[],
    excuses:[ex('e1','c1',3,'m1','مرضي','كنت مريضة بالحمى، ومرفق التقرير الطبي من المستوصف.','pending',3,'demo/report.svg'),
             ex('e2','c2',5,'m3','ظرف عائلي','عندنا ظرف عائلي واضطررت للسفر مع أهلي.','pending',20),
             ex('e3','c3',2,'m6','موعد مستشفى','موعد مراجعة في مستشفى الملك فهد، مرفق ورقة الموعد.','pending',26,'demo/report.svg'),
             ex('e4','c1',8,'m2','مرضي','وعكة صحية','approved',70)],
    messages:[{id:'x1',section_id:'c1',student_user:'u1',student_uid:S('c1')[0].uid,student_name:S('c1')[0].name,from_teacher:false,body:'السلام عليكم أستاذة، هل الاختبار القصير يشمل الفصل الثالث؟',created_at:ago(30),read_at:ago(29)},
              {id:'x2',section_id:'c1',student_user:'u1',student_uid:S('c1')[0].uid,student_name:S('c1')[0].name,from_teacher:true,body:'وعليكم السلام، لا، الفصلين الأول والثاني فقط. بالتوفيق',created_at:ago(28),read_at:ago(27)},
              {id:'x3',section_id:'c2',student_user:'u2',student_uid:S('c2')[3].uid,student_name:S('c2')[3].name,from_teacher:false,body:'أستاذة، متى آخر موعد لتسليم المشروع؟',created_at:ago(2),read_at:null}],
    announcements:[{id:'a1',owner:'demo-t',section_id:null,body:'تذكير: الاختبار القصير الأول الأربعاء القادم، راجعن الفصلين الأول والثاني',created_at:ago(22),until:D.ymd(D.day(5))}],
    grades:S('c1').map((s,i)=>({id:'g'+i,owner:'demo-t',section_id:'c1',uid:s.uid,title:'اختبار نصفي',items:{'س١':6+(i*7)%9,'س٢':8+(i*5)%7},total:Math.min(30,14+(i*7)%9+(i*5)%7),max:30,published:true,updated_at:ago(50)})),
    roster:[],sections_public:[],attendance_public:[]};
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800"><rect width="600" height="800" fill="#fff"/><rect x="0" y="0" width="600" height="110" fill="#17707a"/><text x="300" y="68" font-family="sans-serif" font-size="34" fill="#fff" text-anchor="middle">تقرير طبي (نموذج تجريبي)</text><g font-family="sans-serif" font-size="24" fill="#334" text-anchor="end"><text x="550" y="200">الاسم: طالبة تجريبية</text><text x="550" y="260">التشخيص: حمى وإرهاق</text><text x="550" y="320">يُنصح بالراحة يومًا واحدًا</text></g><rect x="60" y="600" width="200" height="110" rx="55" fill="none" stroke="#17707a" stroke-width="5"/><text x="160" y="665" font-family="sans-serif" font-size="22" fill="#17707a" text-anchor="middle">ختم تجريبي</text></svg>';
  window.supabase={createClient:()=>D.client(DB,{id:'demo-t',email:'demo.teacher@bu.edu.sa'},new Blob([svg],{type:'image/svg+xml'}))};
  D.banner('excuse.html','جرّبي صفحة الطالبة');
})();
