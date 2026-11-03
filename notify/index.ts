/* Copyright (c) 2026 Naimah Alrasheedi (نعيمه الرشيدي). All rights reserved.
   شعبتي — الحضور والأعذار
   Author: Naimah Alrasheedi */
// شعبتي — إرسال إشعارات الجوال للطالبات
// ١) إعلان جديد  ٢) قبل المحاضرة بـ 15 دقيقة (يُستدعى كل 5 دقائق)
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

// مفتاح الخادم: النوع القديم أو الجديد من مفاتيح Supabase
function serverKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try { const all = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); return all.default || Object.values(all)[0] as string; } catch { return ""; }
}
const sb = createClient(Deno.env.get("SUPABASE_URL")!, serverKey());
const LEAD = 15; // دقائق قبل المحاضرة
let cfg: Record<string, string> | null = null;

async function conf() {
  if (cfg) return cfg;
  const { data } = await sb.from("app_secrets").select("k,v");
  cfg = Object.fromEntries((data || []).map((r: any) => [r.k, r.v]));
  webpush.setVapidDetails(cfg.vapid_subject || "mailto:admin@example.com", cfg.vapid_public, cfg.vapid_private);
  return cfg;
}

async function rosterUids(filter: { section_id?: string; owner?: string }) {
  let q = sb.from("roster").select("uid");
  if (filter.section_id) q = q.eq("section_id", filter.section_id);
  if (filter.owner) q = q.eq("owner", filter.owner);
  const { data } = await q.limit(5000);
  return [...new Set((data || []).map((r: any) => r.uid))];
}

async function sendTo(uids: string[], payload: Record<string, unknown>) {
  if (!uids.length) return 0;
  let sent = 0;
  for (let i = 0; i < uids.length; i += 200) {
    const { data } = await sb.from("push_subs").select("endpoint,sub").in("uid", uids.slice(i, i + 200));
    await Promise.all((data || []).map(async (s: any) => {
      try {
        await webpush.sendNotification(s.sub, JSON.stringify(payload), { TTL: 3600, urgency: "high" });
        sent++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from("push_subs").delete().eq("endpoint", s.endpoint);
      }
    }));
  }
  return sent;
}

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
const toMin = (t: string) => { const [h, m] = (t || "0:0").split(":").map(Number); return h * 60 + (m || 0); };

Deno.serve(async (req) => {
  const c = await conf();
  if (req.headers.get("x-notify-secret") !== c.notify_secret) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));

  // ١) إعلان جديد
  if (body.type === "announcement") {
    const a = body.record || {};
    const uids = await rosterUids(a.section_id ? { section_id: a.section_id } : { owner: a.owner });
    const { data: s } = await sb.from("sections_public").select("teacher,short,name").eq(a.section_id ? "id" : "owner", a.section_id || a.owner).limit(1);
    const who = (s && s[0]?.teacher) || "أستاذتك";
    const sent = await sendTo(uids, { kind: "ann", title: `📢 إعلان من ${who}`, body: a.body, tag: `ann-${a.id}`, url: "./excuse.html" });
    return json({ sent });
  }

  // ٣) إنذار أو حرمان أو انقطاع
  if (body.type === "warn") {
    const r = body.record || {};
    const { data: s } = await sb.from("sections_public").select("short,name,teacher").eq("id", r.section_id).limit(1);
    const sec = s && s[0] ? (s[0].short || s[0].name) : "";
    const title = r.level >= 3 ? "⛔ تنبيه حرمان" : r.level === 2 ? "⚠️ إنذار ثانٍ بالغياب" : r.level === 1 ? "⚠️ إنذار أول بالغياب" : "⚠️ تنبيه انقطاع";
    const left = Math.max(0, Number(r.left_h) || 0);
    const text = r.level >= 3
      ? `${sec}: تجاوز غيابك الحد المسموح. نسبة حضورك ${r.att_pct}%. راجعي أستاذتك.`
      : `${sec}: نسبة حضورك ${r.att_pct}%. متبقٍ لك ${left} ساعة فقط قبل الحرمان.`;
    const sent = await sendTo([r.uid], { kind: "warn", title, body: text, tag: `warn-${r.section_id}`, url: "./excuse.html", requireInteraction: true });
    return json({ sent });
  }

  // ٢) تذكير المحاضرات (توقيت الرياض UTC+3)
  if (body.type === "tick") {
    const now = new Date(Date.now() + 3 * 3600e3);
    const dow = now.getUTCDay(), nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    const date = now.toISOString().slice(0, 10);
    const { data: secs } = await sb.from("sections_public").select("id,short,name,teacher,meetings,cancelled,term_start,weeks");
    let sent = 0;
    for (const sec of secs || []) {
      if (sec.term_start) {
        const start = new Date(sec.term_start + "T00:00:00Z"), end = new Date(start.getTime() + (sec.weeks || 15) * 7 * 864e5);
        const today = new Date(date + "T00:00:00Z");
        if (today < start || today > end) continue;
      }
      for (const m of sec.meetings || []) {
        if (m.day !== dow) continue;
        const diff = toMin(m.start) - nowMin;
        if (diff <= 0 || diff > LEAD) continue;
        if ((sec.cancelled || []).some((x: any) => x.date === date && x.meeting_id === m.id)) continue;
        const key = `lec:${sec.id}:${date}:${m.id}`;
        const { error } = await sb.from("push_log").insert({ key });
        if (error) continue; // أُرسل من قبل
        const uids = await rosterUids({ section_id: sec.id });
        sent += await sendTo(uids, {
          kind: "lec", title: `⏰ محاضرتك بعد ${diff} دقيقة`,
          body: `${sec.short || sec.name}${m.room ? " · قاعة " + m.room : ""}${sec.teacher ? " · " + sec.teacher : ""}`,
          tag: key, url: "./excuse.html", requireInteraction: true,
        });
      }
    }
    await sb.from("push_log").delete().lt("at", new Date(Date.now() - 7 * 864e5).toISOString());
    return json({ sent });
  }
  return json({ ok: true });
});
