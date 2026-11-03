/* نسخة العرض: كل التخزين المحلي معزول تحت بادئة demo: حتى لا يختلط بالتطبيق الحقيقي */
(function(){
  /* لو التخزين المحلي محجوب (متصفح داخل تطبيق أو تصفح خاص) نستخدم ذاكرة مؤقتة */
  let ok=true;try{const t='__demo_t';window.localStorage.setItem(t,'1');window.localStorage.removeItem(t)}catch(e){ok=false}
  if(!ok){const m=new Map(),mem={getItem:k=>m.has(String(k))?m.get(String(k)):null,setItem:(k,v)=>{m.set(String(k),String(v))},removeItem:k=>{m.delete(String(k))},clear:()=>m.clear(),key:i=>[...m.keys()][i]??null,get length(){return m.size}};
    try{Object.defineProperty(window,'localStorage',{configurable:true,get:()=>mem})}catch(e){}
    try{Object.defineProperty(window,'sessionStorage',{configurable:true,get:()=>mem})}catch(e){}}
  const P='demo:',S=Storage.prototype,g=S.getItem,s=S.setItem,r=S.removeItem,k=S.key;
  S.getItem=function(x){return g.call(this,P+x)};
  S.setItem=function(x,v){return s.call(this,P+x,v)};
  S.removeItem=function(x){return r.call(this,P+x)};
  S.clear=function(){const ks=[];for(let i=0;i<this.length;i++){const n=k.call(this,i);if(n&&n.startsWith(P))ks.push(n)}ks.forEach(n=>r.call(this,n))};
  window.REG_CONFIG={url:'https://demo.invalid',key:'demo',studentDomain:'stu.bu.edu.sa',studentDomains:['stu.bu.edu.sa'],teacherDomain:'bu.edu.sa',vapid:''};
  const pad=n=>String(n).padStart(2,'0');
  window.DEMO={
    ymd:d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()),
    day:n=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+n);return d},
    /* بداية فصل تجعل اليوم في الأسبوع العاشر تقريبًا */
    termStart(){const d=DEMO.day(-66);d.setDate(d.getDate()-d.getDay());return DEMO.ymd(d)},
    rnd(seed){let x=seed>>>0||1;return()=>{x^=x<<13;x>>>=0;x^=x>>17;x^=x<<5;x>>>=0;return x/4294967296}},
    iso:d=>d.toISOString(),
    /* كائن استعلام عام يقبل أي سلسلة دوال مثل Supabase */
    client(DB,user,fileBlob){
      const q=t=>{let res=null;const prox=new Proxy({},{get(_,m){
        if(m==='then')return(ok,bad)=>Promise.resolve(res||{data:DB[t]||[],error:null,count:(DB[t]||[]).length||1}).then(ok,bad);
        if(m==='insert'||m==='upsert')return rows=>{const arr=(Array.isArray(rows)?rows:[rows]).map(r=>({id:'d'+Math.random().toString(36).slice(2),created_at:new Date().toISOString(),...r}));
          if(m==='insert'&&t!=='docs'&&t!=='push_subs'){DB[t]=DB[t]||[];DB[t].push(...arr)}res={data:Array.isArray(rows)?arr:arr[0],error:null};return prox};
        if(m==='update'||m==='delete')return()=>{res={data:null,error:null};return prox};
        if(m==='single'||m==='maybeSingle')return()=>{const r0=res?res.data:(DB[t]||[])[0];res={data:Array.isArray(r0)?r0[0]:r0||null,error:null};return prox};
        return()=>prox}});return prox};
      const ses={data:{session:{user}}};
      return{from:q,
        auth:{getSession:async()=>ses,getUser:async()=>({data:{user}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}},
          signOut:async()=>({error:null}),signInWithOtp:async()=>({error:null}),verifyOtp:async()=>ses,signInWithPassword:async()=>ses},
        storage:{from:()=>({upload:async()=>({data:{},error:null}),download:async()=>({data:fileBlob,error:null}),remove:async()=>({error:null})})},
        functions:{invoke:async()=>({data:null,error:null})},channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){}}
    },
    banner(other,label){addEventListener('DOMContentLoaded',()=>{const b=document.createElement('a');b.href=other;b.className='demo-pill';
      b.innerHTML='نسخة عرض ببيانات تجريبية<span>'+label+'</span>';document.body.appendChild(b);
      const st=document.createElement('style');st.textContent='.demo-pill{position:fixed;z-index:9999;left:10px;bottom:calc(env(safe-area-inset-bottom,0px) + 84px);background:#1d2b36;color:#fff;font:600 12px/1.2 "IBM Plex Sans Arabic",system-ui,sans-serif;padding:8px 12px;border-radius:999px;text-decoration:none;box-shadow:0 6px 18px #0003;display:flex;gap:8px;align-items:center;opacity:.92}.demo-pill span{background:#f5b83d;color:#1d2b36;border-radius:999px;padding:3px 8px}';document.head.appendChild(st)})}
  };
})();
