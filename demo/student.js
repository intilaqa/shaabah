/* بيانات تجريبية للطالبة */
(function(){
  const D=DEMO,now=new Date(),iso=D.iso,TS=D.termStart(),day=D.day,ymd=D.ymd,ago=h=>iso(new Date(Date.now()-h*36e5));
  const DB={
    roster:[{section_id:'c1',name:'رهف محمد الغامدي'},{section_id:'c2',name:'رهف محمد الغامدي'}],
    sections_public:[
      {id:'c1',owner:'t1',teacher:'أستاذة نعيمه',hours_note:'من الأحد إلى الخميس، ٨ ص – ٢ م',name:'شعبة F32 — MIS-1508 الابتكار والتقنيات الناشئة',short:'F32 الابتكار',term_start:TS,weeks:15,
       meetings:[{id:'m1',day:0,start:'11:00',end:'12:40',room:'SH-BF-18',hours:2},{id:'m2',day:2,start:'13:00',end:'13:50',room:'SH-BF-18',hours:1},{id:'m8',day:4,start:'11:00',end:'11:50',room:'SH-BF-18',hours:1}],cancelled:[]},
      {id:'c2',owner:'t2',teacher:'دكتورة سارة',hours_note:'',name:'شعبة F32 — MIS-1406 نظم المعلومات الإدارية',short:'F32 نظم',term_start:TS,weeks:15,
       meetings:[{id:'m3',day:1,start:'10:00',end:'11:40',room:'SH-BS-10',hours:2},{id:'m4',day:3,start:'08:00',end:'09:40',room:'SH-BS-10',hours:2}],cancelled:[{date:ymd(day(7)),meeting_id:'m4',reason:'اجتماع القسم'}]}],
    announcements:[{id:'a1',owner:'t1',section_id:null,body:'تذكير: الاختبار القصير الأول الأربعاء القادم، راجعن الفصلين الأول والثاني',created_at:ago(22),until:ymd(day(5))}],
    grades:[{section_id:'c1',title:'اختبار نصفي',items:{'س١':12,'س٢':14},total:26,max:30,updated_at:ago(50)},{section_id:'c2',title:'واجب ١',items:{'الدرجة':9},total:9,max:10,updated_at:ago(120)}],
    messages:[{id:'x1',section_id:'c1',from_teacher:false,body:'السلام عليكم أستاذة، هل الاختبار القصير يشمل الفصل الثالث؟',created_at:ago(30),read_at:ago(29)},
              {id:'x2',section_id:'c1',from_teacher:true,body:'وعليكم السلام، لا، الفصلين الأول والثاني فقط. بالتوفيق',created_at:ago(3),read_at:null}],
    attendance_public:[{section_id:'c1',att_pct:86.67,abs_h:6,planned:45,max_abs:11.25,left_h:5.25,level:1,cut:false,min_attend:75,items:[{d:ymd(day(-30)),m:'a',h:2},{d:ymd(day(-21)),m:'a',h:2},{d:ymd(day(-6)),m:'e',h:2}],updated_at:iso(now)},
                       {section_id:'c2',att_pct:100,abs_h:0,planned:60,max_abs:15,left_h:15,level:0,cut:false,min_attend:75,items:[],updated_at:iso(now)}],
    excuses:[{id:'e1',section_id:'c1',lecture_date:ymd(day(-6)),kind:'مرضي',status:'approved',created_at:ago(140)},{id:'e2',section_id:'c2',lecture_date:ymd(day(-2)),kind:'ظرف عائلي',status:'pending',created_at:ago(40)}]};
  window.supabase={createClient:()=>D.client(DB,{id:'u1',email:'446000123@stu.bu.edu.sa'},null)};
  D.banner('index.html?role=t','جرّبي صفحة الأستاذة');
})();
