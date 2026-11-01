const C='reg-v39';
const CORE=['./','./index.html','./excuse.html','./config.js','./cloud.js','./manifest.webmanifest','./manifest-student.webmanifest','./icon-180.png','./icon-192.png','./icon-512.png'];
const EXTRA=['https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js','https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js','https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js','https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js','https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js','https://fonts.googleapis.com/css2?family=Almarai:wght@400;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Reem+Kufi:wght@500;600;700&family=Amiri:wght@400;700&display=swap'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(async c=>{await c.addAll(CORE);for(const u of EXTRA){try{await c.add(new Request(u,{mode:'no-cors'}))}catch(_){}}}).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.hostname.endsWith('supabase.co')||u.hostname.endsWith('supabase.in'))return;
  const fresh=u.origin===location.origin&&/(\.html|\.js|\/)$/.test(u.pathname);
  e.respondWith(caches.match(e.request,{ignoreSearch:e.request.mode==='navigate'}).then(hit=>{
    const net=fetch(e.request).then(res=>{if(res&&(res.ok||res.type==='opaque')){const cp=res.clone();caches.open(C).then(c=>c.put(e.request,cp))}return res}).catch(()=>hit||caches.match('./index.html'));
    return fresh?net.then(r=>r||hit).catch(()=>hit):(hit||net)}))});

/* phone notifications: lecture reminders, announcements, absence warnings */
self.addEventListener('push',e=>{let d={};try{d=e.data?e.data.json():{}}catch(_){d={title:'شعبتي',body:e.data&&e.data.text()}}
  const opts={body:d.body||'',icon:'icon-192.png',badge:'icon-192.png',tag:d.tag||'shaabah',renotify:true,dir:'rtl',lang:'ar',
    vibrate:d.kind==='lec'?[300,120,300,120,600]:d.kind==='warn'?[600,200,600]:[200,100,200,100,400],
    requireInteraction:!!d.requireInteraction,data:{url:d.url||'./excuse.html'}};
  e.waitUntil(Promise.all([self.registration.showNotification(d.title||'شعبتي',opts),
    self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>cs.forEach(c=>c.postMessage({chime:true,kind:d.kind})))]))});
self.addEventListener('notificationclick',e=>{e.notification.close();const url=new URL((e.notification.data&&e.notification.data.url)||'./excuse.html',self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{for(const c of cs)if(c.url.includes('excuse.html'))return c.focus();return self.clients.openWindow(url)}))});
