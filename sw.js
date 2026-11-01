const C='reg-v14';
const CORE=['./','./index.html','./excuse.html','./config.js','./cloud.js','./manifest.webmanifest','./icon-180.png','./icon-192.png','./icon-512.png'];
const EXTRA=['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js','https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js','https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js','https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js','https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Reem+Kufi:wght@500;600;700&family=Amiri:wght@400;700&display=swap'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(async c=>{await c.addAll(CORE);for(const u of EXTRA){try{await c.add(new Request(u,{mode:'no-cors'}))}catch(_){}}}).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.hostname.endsWith('supabase.co')||u.hostname.endsWith('supabase.in'))return;
  const fresh=u.origin===location.origin&&/(\.html|\.js|\/)$/.test(u.pathname);
  e.respondWith(caches.match(e.request,{ignoreSearch:e.request.mode==='navigate'}).then(hit=>{
    const net=fetch(e.request).then(res=>{if(res&&(res.ok||res.type==='opaque')){const cp=res.clone();caches.open(C).then(c=>c.put(e.request,cp))}return res}).catch(()=>hit||caches.match('./index.html'));
    return fresh?net.then(r=>r||hit).catch(()=>hit):(hit||net)}))});
