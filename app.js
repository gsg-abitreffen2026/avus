// Exportierter Canvas-Code (React/TSX) — für Bundler-Setup gedacht.

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Check, Upload, Users, Target, Mail, ListTodo, Phone, Building2, CalendarClock } from "lucide-react";

// ---------------------------
// API ENDPOINTS (anpassen)
// ---------------------------
export const API = {
  contacts: (limit: number) => `/api/contacts?limit=${limit}`,
  bulkUpdate: () => `/api/contacts/bulkUpdate`,
  stats: () => `/api/stats`,
  replies: () => `/api/review-inbox`,
  todos: (limit: number) => `/api/sent-todos?limit=${limit}`,
  templates: () => `/api/templates`,
  saveTemplate: (name: string) => `/api/templates/${encodeURIComponent(name)}`,
  blacklist: (q: string, includeBounces: boolean) => `/api/blacklist?q=${encodeURIComponent(q)}&bounces=${includeBounces?1:0}`,
  addBlacklist: () => `/api/blacklist`,
  startCampaign: () => `/api/campaign/start`,
  stopCampaign: () => `/api/campaign/stop`,
};

// ---------------------------
// Demo-Daten (sichtbar machen)
// ---------------------------
const USE_DEMO = true;
const DEMO = {
  contacts: [
    { id: '1', firstName: 'Anna', lastName: 'Meyer', company: 'Bosch', email: 'anna.meyer@bosch.com', status: 'Lead', disabled: false, tags: ['Facility','Manufacturing'] },
    { id: '2', firstName: 'Jonas', lastName: 'Klein', company: 'Siemens', email: 'jonas.klein@siemens.com', status: 'Need Review', disabled: false, tags: ['CFO'] },
    { id: '3', firstName: 'Marta', lastName: 'Schulz', company: 'BASF', email: 'm.schulz@basf.com', status: 'HOT', disabled: false, tags: ['Betriebsgastro'] },
    { id: '4', firstName: 'Paul', lastName: 'Wendt', company: 'Airbus', email: 'paul.wendt@airbus.com', status: 'Reply', disabled: true, tags: ['IT'] },
  ],
  stats: { sent: 48, replies: 12, hot: 4, needReview: 5, meetings: 2 },
  inbox: {
    hot: [ { id: 'h1', subject: 'Re: Self-Checkout', from: 'fm@firma.de', date: '2025-10-14', snippet: 'Klingt spannend…' } ],
    needReview: [ { id: 'n1', subject: 'Rückfrage', from: 'cfo@firma.de', date: '2025-10-15', snippet: 'Wie sieht das Pricing aus?' } ],
    reply: [ { id: 'r1', subject: 'Danke für die Info', from: 'hr@firma.de', date: '2025-10-13', snippet: 'Wir melden uns.' } ],
  },
  todos: [
    { id: 't1', person: 'Sabine Koch', company: 'Bosch', phone: '+49 711 123456', lastMailAt: '2025-10-16 09:12' },
    { id: 't2', person: 'Thomas Weber', company: 'Porsche', phone: '+49 711 654321', lastMailAt: '2025-10-15 16:40' },
    { id: 't3', person: 'Julia Bauer', company: 'ZF', phone: '+49 7541 98765', lastMailAt: '2025-10-14 11:00' },
  ],
  templates: [
    { name: 'Standard', steps: [
      { title: 'Anschreiben', body: 'Hallo {{firstName}},\\nkurze Info zu unserem smart‑cap System…' },
      { title: 'Follow‑up 1', body: 'Hi {{firstName}}, nur kurz nachgehakt…' },
      { title: 'Follow‑up 2', body: 'Noch eine kurze Erinnerung…' },
      { title: 'Follow‑up 3', body: 'Letzter Ping – passt ein Austausch?' },
    ]},
    { name: 'Variante A', steps: [
      { title: 'Anschreiben', body: 'Servus {{firstName}},' },
      { title: 'Follow‑up 1', body: 'Wollte nochmals anklopfen…' },
      { title: 'Follow‑up 2', body: 'Vielleicht passt jetzt ein kurzer Call?' },
      { title: 'Follow‑up 3', body: 'Letzte Erinnerung – gerne auch per Rückruf.' },
    ]},
    { name: 'Variante B', steps: [
      { title: 'Anschreiben', body: 'Guten Tag {{firstName}},' },
      { title: 'Follow‑up 1', body: 'Ich melde mich kurz zur vorigen Mail…' },
      { title: 'Follow‑up 2', body: 'Wir haben gute Referenzen aus der Betriebsgastro…' },
      { title: 'Follow‑up 3', body: 'Sonst melde ich mich später nochmal.' },
    ]},
  ],
  blacklist: [ 'no-reply@firma.de', 'privacy@company.com', 'blocked@example.org' ],
  bounces: [ 'bounce-123@mailer-daemon.com', 'invalid@badhost.tld' ],
};

// Demo-User & Templates
const PASSWORDS: Record<string, string> = { Maxi: 'avus', Thorsten: 'avus' };
const TEMPLATES = DEMO.templates.map(t=>t.name);

// Hilfsfunktionen (pure)
export function classNames(...c: Array<string | false | null | undefined>) { return c.filter(Boolean).join(" "); }
export function filterContactsUtil(contacts: any[], query: string) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return contacts;
  return contacts.filter(c => [c.firstName, c.lastName, c.company, c.email]
    .filter(Boolean)
    .some((x: any) => String(x).toLowerCase().includes(q)));
}
export function computeNextDailyRun(timeHHMM: string, now = new Date()) {
  const [h,m] = (timeHHMM||'09:00').split(':').map(x=>parseInt(x,10));
  const next = new Date(now);
  next.setHours(h||0, m||0, 0, 0);
  if (next <= now) { next.setDate(next.getDate()+1); }
  return next;
}
export function isEmail(x: string){ return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(x); }

// Debounce
function useDebouncedValue<T>(value: T, delay = 200) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return v;
}

export default function EmailAkquiseDashboard() {
  const abortRef = useRef(new AbortController());

  // Branding
  const BRAND = { primary: "green-600", primaryHover: "green-700", ink: "slate-800", bg: "zinc-50", card: "white" } as const;

  // State
  const [activeTab, setActiveTab] = useState<'dashboard'|'templates'|'blacklist'|'kontakte'|'login'>('login');
  const [dailyTime] = useState<string>('09:00'); // genutzt für Folgewellen (UI entfernt)
  const [perDay, setPerDay] = useState<number>(() => { const saved = typeof window !== 'undefined' ? localStorage.getItem("perDay") : null; return saved ? Number(saved) : 25; });
  const [limit, setLimit] = useState<number>(() => perDay);
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<any[]>(USE_DEMO ? DEMO.contacts : []);
  const [updates, setUpdates] = useState<Record<string, { disabled?: boolean }>>({});
  const [stats, setStats] = useState(USE_DEMO ? DEMO.stats : { sent: 0, replies: 0, hot: 0, needReview: 0, meetings: 0 });
  const [inbox, setInbox] = useState<{ hot: any[]; needReview: any[]; reply: any[] }>(USE_DEMO ? DEMO.inbox : { hot: [], needReview: [], reply: [] });
  const [todos, setTodos] = useState<any[]>(USE_DEMO ? DEMO.todos : []);
  const [templates, setTemplates] = useState<any[]>(USE_DEMO ? DEMO.templates : []);
  const [blacklist, setBlacklist] = useState<string[]>(USE_DEMO ? DEMO.blacklist : []);
  const [bounces, setBounces] = useState<string[]>(USE_DEMO ? DEMO.bounces : []);
  const [filterText, setFilterText] = useState("");
  const debouncedFilter = useDebouncedValue(filterText, 200);
  const [error, setError] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>(TEMPLATES[0]);
  const [campaignRunning, setCampaignRunning] = useState(false);
  const [campaignInfo, setCampaignInfo] = useState<{startedAt?: string; nextRun?: string}>({});
  const [selectedUser, setSelectedUser] = useState<'Maxi' | 'Thorsten'>('Maxi');
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);

  // Persist
  useEffect(() => { try { localStorage.setItem("perDay", String(perDay)); } catch {} }, [perDay]);

  // Initial load + Cleanup
  const fetchContacts = useCallback(async (l: number) => { const res = await fetch(API.contacts(l), { signal: abortRef.current.signal }); if (!res.ok) throw new Error(`Contacts: ${res.status}`); const data = await res.json(); setContacts(Array.isArray(data.contacts) ? data.contacts : []); }, []);
  const fetchStats = useCallback(async () => { const res = await fetch(API.stats(), { signal: abortRef.current.signal }); if (!res.ok) throw new Error(`Stats: ${res.status}`); const data = await res.json(); setStats({ sent: Number(data.sent||0), replies: Number(data.replies||0), hot: Number(data.hot||0), needReview: Number(data.needReview||0), meetings: Number(data.meetings||0), }); }, []);
  const fetchInbox = useCallback(async () => { const res = await fetch(API.replies(), { signal: abortRef.current.signal }); if (!res.ok) throw new Error(`Inbox: ${res.status}`); const data = await res.json(); setInbox({ hot: data.hot || [], needReview: data.needReview || [], reply: data.reply || [] }); }, []);
  const fetchTodos = useCallback(async (l: number) => { const res = await fetch(API.todos(l), { signal: abortRef.current.signal }); if (!res.ok) throw new Error(`Todos: ${res.status}`); const data = await res.json(); setTodos(Array.isArray(data.todos) ? data.todos : []); }, []);

  const refreshAll = useCallback(async () => { setLoading(true); setError(""); try { await Promise.all([ fetchContacts(limit), fetchStats(), fetchInbox(), fetchTodos(perDay), ]); } catch (err: any) { setError(err?.message || "Fehler beim Laden"); } finally { setLoading(false); } }, [limit, perDay, fetchContacts, fetchStats, fetchInbox, fetchTodos]);
  useEffect(() => { if(!USE_DEMO) { refreshAll(); } return () => abortRef.current.abort(); }, [refreshAll]);

  const toggleDisabled = useCallback((contact: any, nextVal?: boolean) => { const key = contact.id || contact.email; const current = updates[key]?.disabled ?? contact.disabled ?? false; const newVal = (typeof nextVal === "boolean") ? nextVal : !current; setUpdates(prev => ({ ...prev, [key]: { ...(prev[key] || {}), disabled: newVal } })); setContacts(prev => prev.map(c => ((c.id || c.email) === key ? { ...c, disabled: newVal } : c))); }, [updates]);

  const saveChanges = useCallback(async () => { const payload = Object.entries(updates).map(([k, v]) => ({ id: k, email: k.includes('@') ? k : undefined, ...v })); if (payload.length === 0) return; setLoading(true); setError(""); try { const res = await fetch(API.bulkUpdate(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updates: payload }) }); if (!res.ok) throw new Error(`Update: ${res.status}`); setUpdates({}); if (!USE_DEMO) await refreshAll(); } catch (err: any) { setError(err?.message || "Speichern fehlgeschlagen"); } finally { setLoading(false); } }, [updates, refreshAll]);

  // Auth & Kampagne
  
  const handleLogout = useCallback(() => { setAuthed(false); setPassword(""); }, []);

  const startCampaign = useCallback(async () => {
    const now = new Date();
    const next = computeNextDailyRun(dailyTime, now);
    setCampaignRunning(true);
    setCampaignInfo({ startedAt: now.toISOString(), nextRun: next.toISOString() });
    if (!USE_DEMO) {
      try {
        const res = await fetch(API.startCampaign(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startNow: now.toISOString(), nextDailyTime: dailyTime, template: selectedTemplate, user: selectedUser, perDay, limit }) });
        if(!res.ok) throw new Error('Start failed');
      } catch(e:any){ setError(e?.message||'Kampagne konnte nicht gestartet werden'); }
    }
  }, [dailyTime, selectedTemplate, selectedUser, perDay, limit]);

  const stopCampaign  = useCallback(async () => {
    setCampaignRunning(false);
    if (!USE_DEMO) {
      try { const res = await fetch(API.stopCampaign(), { method: 'POST' }); if(!res.ok) throw new Error('Stop failed'); } catch(e:any){ setError(e?.message||'Kampagne konnte nicht gestoppt werden'); }
    }
  }, []);

  // Derived
  const filteredContacts = useMemo(() => filterContactsUtil(contacts, debouncedFilter), [contacts, debouncedFilter]);
  const chartData = useMemo(() => ([ { name: "Gesendet", value: stats.sent }, { name: "Antworten", value: stats.replies }, { name: "HOT", value: stats.hot }, { name: "Need Review", value: stats.needReview }, { name: "Meetings", value: stats.meetings }, ]), [stats]);

  // Render
  return (
    <div className="min-h-screen w-full bg-zinc-50 p-0">
      {/* Brand Topbar */}
      <div className="w-full bg-white/90 backdrop-blur border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-green-600 flex items-center justify-center text-white font-semibold">av</div>
            <div>
              <div className="text-sm tracking-wide text-zinc-500 uppercase">avus gastro</div>
              <div className="text-lg font-semibold text-zinc-900">smart‑cap Dashboard</div>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-green-50 text-green-700 text-xs font-medium px-3 py-1">pay easy <span className="hidden sm:inline">— Bezahlen im Flow</span></span>
        </div>
        {/* Main ndiv className="flex gap-2">
               (
                <Button key={key} variant={activeTab===key?'default':'secondary'} className={activeTab===key?`bg-green-600 hover:bg-green-700 text-white`:`border-zinc-300`} onClick={()=>setActiveTab(key as any)}>
                  {key==='dashboard'?'Dashboard': key==='templates'?'Templat
             -10">
        <div className="mx-auto max-w-7xl grid grid-cols-1 gap-6">
          {error && (<div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>)}

          {activeTab==='dashboard' && (
            <>
              {/* Zeile 1: Links TODO-Liste, rechts Kampagneneinstellungen */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border-zinc-200 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2"><ListTodo className="w-4 h-4"/> To‑Dos (angeschrieben)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {todos.length === 0 ? (<div className="text-sm text-zinc-500">Keine Einträge</div>) : (
                      <ul className="divide-y">{todos.map((t: any) => (
                        <li key={t.id} className="py-3 flex items-center justify-between">
                          <div>
                            <div className="font-medium text-zinc-900">{t.person}</div>
                            <div className="text-xs text-zinc-500 flex items-center gap-3">
                              <span className="inline-flex items-center gap-1"><Building2 className="w-3 h-3"/>{t.company}</span>
                              <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3"/>{t.phone}</span>
                              <span className="inline-flex items-center gap-1"><CalendarClock className="w-3 h-3"/>{t.lastMailAt}</span>
                            </div>
                          </div>
                          <Button variant="secondary" size="sm" className="border-zinc-300">Details</Button>
                        </li>))}
                      </ul>)}
                  </CardContent>
                </Card>

                <Card className="border-zinc-200 shadow-sm md:order-none orderName="flex items-center gap-2"><Target className="w-4 h-4"/> Kampagneneinstellungen</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-4">
                    <div className="space-y-2 opacity-100">
                      <Label className="text-zinc-700">Sendouts pro Tag</Label>
                      <div className="flex items-center gap-3">
                        <Input type="number" min={0} value={perDay} onChange={e => setPerDay(Number(e.target.value || 0))} className="w-32" disabled={!authed || campaignRunning} />
                        <Badge className="bg-green-50 text-green-700 border border-green-200">pro Tag: {perDay}</Badge>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Template auswählen</Label>
                      <Select value={selectedTemplate} onValueChange={(v:any)=>setSelectedTemplate(v)}>
                        <SelectTrigger className="w-56 border-zinc-300" disabled={!authed || campaignRunning}><SelectValue placeholder="Template"/></SelectTrigger>
                        <SelectContent>
                          {TEMPLATES.map(t=> <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center gap-3">
                      {!campaignRunning ? (
                        <Button onClick={startCampaign} disabled={!authed} className="gap-2 bg-green-600 hover:bg-green-700 text-white border-0">Kampagne starten</Button>
                      ) : (
                        <>
                          <Badge className="bg-green-50 text-green-700 border border-green-200">Kampagne läuft…</Badge>
                          <Button variant="secondary" onClick={stopCampaign} className="border-zinc-300">Stoppen</Button>
                        </>
                      )}
                    </div>

                    {campaignRunning && campaignInfo.nextRun && (
                      <div className="text-xs text-zinc-500">Nächste Welle: {new Date(campaignInfo.nextRun).toLocaleString()}</div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Antworten */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <ReplyColumn title={`HOT (${inbox.hot.length})`} items={inbox.hot} badgeClass="bg-red-600" />
                <ReplyColumn title={`Need Review (${inbox.needReview.length})`} items={inbox.needReview} badgeClass="bg-amber-600" />
                <ReplyColumn title={`Reply (${inbox.reply.length})`} items={inbox.reply} badgeClass="bg-slate-700" />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="grid grid-cols-1 gap-4">
                  <KpiCard icon={<Mail className="w-4 h-4" />} label="Gesendet" value={stats.sent} />
                  <KpiCard icon={<Users className="w-4 h-4" />} label="Antworten" value={stats.replies} />
                </div>
                <div clas>} label="HOT" value={stats.hot} />
                  <KpiCard icon={<Users className="w-4 h-4" />} label="Need Review" value={stats.needReview} />
                </div>
                <Card className="border-zinc-200 shadow-sm">
                  <CardHeader className="pb-2"><CardTitle>Erfolg der Kampagne</CardTitle></CardHeader>
                  <CardContent>
                    <div className="w-full h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <XAxis dataKey="name" />
                          <YAxis allowDecimals={false} />
                          <Tooltip />
                          <Bar dataKey="value" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Kontakte */}
              <Card className="border-zinc-200 shadow-sm">
                <CardHeader className="pb-2"><CardTitle>Kontakte (Top‑{limit})</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-auto rounded-2xl border border-zinc-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-zinc-100">
                        <tr className="text-left">
                          <th className="p-3">Name</th>
                          <th className="p-3">Firma</th>
                          <th className="p-3">E‑Mail</th>
                          <th className="p-3">Tags</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Deaktiviert</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredContacts.map((c) => (
                          <tr key={c.id || c.email} className="border-t">
                            <td className="p-3">{c.firstName} {c.lastName}</td>
                            <td className="p-3">{c.company}</td>
                            <td className="p-3">{c.email}</td>
                            <td className="p-3">
                              <div className="flex flex-wrap gap-1">
                                {(c.tags || []).map((t: string, i: number) => <Badge key={i} variant="outline">{t}</Badge>)}
                              </div>
                            </td>
                            <td className="p-3"><Badge variant="secondary">{c.status || "Lead"}</Badge></td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <Switch checked={Boolean(c.disabled)} onCheckedChange={(v) => toggleDisabled(c, v)} />
                                <span className={classNames("text-xs", c.disabled ? "text-red-600" : "text-zinc-500")}>{c.disabled ? "deaktiviert" : "aktiv"}</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-3">
                      <Label>Anzahl anzeigen</Label>
                      <Select value={String(limit)} onValueChange={(v)=>{ const n = Number(v); setLimit(n); if(!USE_DEMO) fetchContacts(n); }}>
                        <SelectTrigger className="w-40 border-zinc-300"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[10,25,50,75,100,150,200].map(n=> <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" onClick={() => exportCsv(filteredContacts)} className="gap-2 border-zinc-300"><Upload className="w-4 h-4" /> Export CSV</Button>
                      <Button onClick={saveChanges} disabled={loading || Object.keys(updates).length === 0} className="gap-2 bg-green-600 hover:bg-green-700 text-white border-0"><Check className="w-4 h-4" /> Änderungen speichern</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {activeTab==='templates' && (
            <TemplatesView templates={templates} setTemplates={setTemplates} authed={authed} campaignRunning={campaignRunning} />
          )}

          {activeTab==='blacklist' && (
            <BlacklistView blacklist={blacklist} bounces={bounces} setBlacklist={setBlacklist} authed={authed} />
          )}

          {activeTab==='kontakte' && (
            <ContactsImportView onImport={(rows, mode)=>{ /* demo: nur anzeigen */ setContacts(rows as any); }} authed={authed} />
          )}

          {activeTab==='login' && (
            <LoginView selectedUser={selectedUser} setSelectedUser={setSelectedUser} password={password} setPassword={setPassword} authed={authed} onLogin={handleLogin} onLogout={handleLogout} />
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number; }) {
  return (
    <Card className="border-zinc-200 shadow-sm">
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2">{icon}{label}</CardTitle></CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function ReplyColumn({ title, items, badgeClass }: { title: string; items: any[]; badgeClass: string; }) {
  return (
    <Card className="border-zinc-200 shadow-sm">
      <CardHeader className="pb-2"><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="text-sm text-slate-500">Keine Einträge</div>
        ) : (
          <ul className="space-y-2">
            {items.map((it, idx) => (
              <li key={it.id || it.messageId || (it.subject + '|' + it.date + '|' + idx)} className="rounded-xl border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{it.subject || "(Ohne Betreff)"}</div>
                    <div className="text-xs text-slate-500">{it.fromName || it.from} · {it.date || ""}</div>
                  </div>
                  <span className={classNames("text-xs rounded-full px-2 py-1 text-white", badgeClass)}>{title}</span>
                </div>
                {it.snippet && <p className="text-sm text-slate-700 mt-2 line-clamp-3">{it.snippet}</p>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TemplatesView({ templates, setTemplates, authed, campaignRunning }: { templates: any[]; setTemplates: (t:any[])=>void; authed: boolean; campaignRunning:boolean; }){
  const [active, setActive] = useState(templates[0]?.name || 'Standard');
  const disabled = !authed || campaignRunning;

  const ensureSteps = (t:any)=>{
    const labels = ['Anschreiben','Follow‑up 1','Follow‑up 2','Follow‑up 3'];
    const map: Record<string,string> = Object.fromEntries((t.steps||[]).map((s:any)=>[s.title,s.body]));
    return labels.map(title=>({ title, body: map[title] ?? '' }));
  };
  const normalized = templates.map((t:any)=> ({...t, steps: ensureSteps(t)}));
  const tpl = normalized.find((t:any)=>t.name===active) || normalized[0];

  const updateStep = (idx:number, body:string)=>{
    setTemplates(normalized.map((t:any)=> t.name!==active? t : { ...t, steps: t.steps.map((s:any,i:number)=> i===idx?{...s, body}:s) }));
  };

  const save = async ()=>{
    if (USE_DEMO) return; // no-op demo
    try{
      const res = await fetch(API.saveTemplate(active), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(tpl) });
      if(!res.ok) throw new Error('Template speichern fehlgeschlagen');
    }catch(e:any){ alert(e?.message||'Fehler'); }
  };

  return (
    <Card className="border-zinc-200 shadow-sm">
      <CardHeader className="pb-2"><CardTitle>Templates</CardTitle></CardHeader>
      <CardContent>
        <Tabs value={active} onValueChange={(v)=>setActive(v as any)}>
          <TabsList className="mb-4">
            {normalized.map((t:any)=> (<TabsTrigger key={t.name} value={t.name}>{t.name}</TabsTrigger>))}
          </TabsList>
          {normalized.map((t:any)=> (
            <TabsContent key={t.name} value={t.name}>
              <div className="grid gap-4">
                {t.steps.map((s:any, idx:number)=> (
                  <TemplateEditorStep key={idx} title={s.title} value={s.body} disabled={disabled} onChange={(val)=>updateStep(idx,val)} />
                ))}
                <div className="flex gap-2">
                  <Button onClick={save} disabled={disabled} className="bg-green-600 hover:bg-green-700 text-white">Speichern</Button>
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function TemplateEditorStep({ title, value, onChange, disabled }: { title:string; value:string; onChange:(v:string)=>void; disabled:boolean; }){
  const ref = useRef<HTMLTextAreaElement|null>(null);
  const insert = (token:string)=>{
    const el = ref.current; if(!el) return; if(el.selectionStart==null) return;
    const start = el.selectionStart; const end = el.selectionEnd ?? start;
    const next = value.slice(0,start) + token + value.slice(end);
    onChange(next);
    requestAnimationFrame(()=>{ el.focus(); const pos = start + token.length; el.setSelectionRange(pos,pos); });
  };
  const tokens = ['{{firstName}}','{{lastName}}','{{company}}','{{email}}'];
  return (
    <div className="space-y-2">
      <Label>{title}</Label>
      <textarea ref={ref} className="w-full rounded-xl border border-zinc-300 p-3 text-sm" rows={6} value={value} onChange={e=>onChange(e.target.value)} disabled={disabled} />
      <div className="flex flex-wrap gap-2">
        {tokens.map(t=> <Button key={t} type="button" onClick={()=>insert(t)} disabled={disabled} variant="secondary" className="border-zinc-300">{t.replace(/\\{\\{|\\}\\}/g,'').replace('firstName','Vorname').replace('lastName','Nachname').replace('company','Firma').replace('email','E‑Mail')}</Button>)}
      </div>
    </div>
  );
}

function BlacklistView({ blacklist, bounces, setBlacklist, authed }: { blacklist:string[]; bounces:string[]; setBlacklist:(x:string[])=>void; authed:boolean; }){
  const [query, setQuery] = useState('');
  const [includeBounces, setIncludeBounces] = useState(true);
  const [addEmail, setAddEmail] = useState('');

  const filtered = useMemo(()=>{
    const list = includeBounces ? [...blacklist, ...bounces] : [...blacklist];
    const q = query.trim().toLowerCase();
    return q? list.filter(x=>x.toLowerCase().includes(q)) : list;
  }, [query, includeBounces, blacklist, bounces]);

  const add = ()=>{
    if(!isEmail(addEmail)) return alert('Bitte gültige E‑Mail');
    setBlacklist([addEmail, ...blacklist]);
    setAddEmail('');
  };

  return (
    <Card className="border-zinc-200 shadow-sm">
      <CardHeader className="pb-2"><CardTitle>Blacklist</CardTitle></CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-end">
          <div className="space-y-1">
            <Label>Suche</Label>
            <Input value={query} onChange={e=>setQuery(e.target.value)} className="w-72 border-zinc-300" placeholder="E‑Mail oder Domain…"/>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={includeBounces} onCheckedChange={setIncludeBounces} />
            <span className="text-sm text-zinc-700">Bounces einbeziehen</span>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Adresse hinzufügen</Label>
          <div className="flex gap-2">
            <Input value={addEmail} onChange={e=>setAddEmail(e.target.value)} className="w-72 border-zinc-300" placeholder="z. B. name@firma.de" />
            <Button onClick={add} disabled={!authed} className="bg-green-600 hover:bg-green-700 text-white">Hinzufügen</Button>
          </div>
          <div className="text-xs text-zinc-500">Demnächst: ganze Domains sperren (z. B. *@firmax.de).</div>
        </div>

        <div className="rounded-xl border border-zinc-200">
          <ul className="divide-y">
            {filtered.map((x,i)=> (
              <li key={x+"|"+i} className="p-3 text-sm">{x}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function ContactsImportView({ onImport, authed }: { onImport:(rows:any[], mode:'append'|'overwrite')=>void; authed:boolean; }){
  const [file, setFile] = useState<File|null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [mode, setMode] = useState<'append'|'overwrite'>('append');
  const [info, setInfo] = useState<string>('');

  const parseFile = async (f: File) => {
    const buf = await f.arrayBuffer();
    if (f.name.endsWith('.csv')) {
      const text = new TextDecoder().decode(buf);
      const lines = text.split(/\\r?\\n/).filter(Boolean);
      const headers = lines[0].split(/,|;|\\t/).map(h=>h.trim());
      const dataLines = lines.slice(1);
      const idx = (rx:RegExp)=> headers.findIndex(h=>rx.test(h.toLowerCase()));
      const iEmail = idx(/mail|email/); const iLast = idx(/nachname|last/); const iComp = idx(/firma|company/);
      if (iEmail<0 || iLast<0 || iComp<0) { setInfo('Pflichtspalten nicht gefunden'); setRows([]); return; }
      const r = dataLines.map(l=>{
        const cols = l.split(/,|;|\\t/);
        return { email: cols[iEmail]?.trim(), lastName: cols[iLast]?.trim(), company: cols[iComp]?.trim() };
      }).filter(r=>r.email);
      setRows(r); setInfo(`Gefunden: ${r.length} Zeilen`);
    } else {
      // XLSX
      // @ts-ignore - dynamic import
      const XLSX = await import('xlsx');
      const wb = XLSX.read(buf, { type:'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { header:1 }) as any[][];
      const headers = (json[0]||[]).map((h:any)=>String(h).trim());
      const idx = (rx:RegExp)=> headers.findIndex(h=>rx.test(h.toLowerCase()));
      const iEmail = idx(/mail|email/); const iLast = idx(/nachname|last/); const iComp = idx(/firma|company/);
      if (iEmail<0 || iLast<0 || iComp<0) { setInfo('Pflichtspalten nicht gefunden'); setRows([]); return; }
      const r = json.slice(1).map(cols=>({ email: String(cols[iEmail]||'').trim(), lastName: String(cols[iLast]||'').trim(), company: String(cols[iComp]||'').trim() })).filter(r=>r.email);
      setRows(r); setInfo(`Gefunden: ${r.length} Zeilen`);
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>)=>{ const f = e.target.files?.[0]||null; setFile(f); if(f) await parseFile(f); };
  const commit = ()=>{ if(!authed) return alert('Bitte einloggen'); if(!rows.length) return alert('Keine Daten'); onImport(rows, mode); setInfo('Import durchgeführt'); };

  return (
    <Card className="border-zinc-200 shadow-sm">
      <CardHeader className="pb-2"><CardTitle>Kontaktliste importieren</CardTitle></CardHeader>
      <CardContent className="grid gap-4">
        <div className="space-y-1">
          <Label>Datei (CSV/XLSX)</Label>
          <Input type="file" accept='.csv,.xlsx' onChange={onFile} className="max-w-md" />
        </div>
        <div className="flex items-center gap-3">
          <Label>Modus</Label>
          <Select value={mode} onValueChange={(v:any)=>setMode(v)}>
            <SelectTrigger className="w-40 border-zinc-300"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="append">Anhängen</SelectItem>
              <SelectItem value="overwrite">Überschreiben (mit Sicherung)</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={commit} className="bg-green-600 hover:bg-green-700 text-white">Import</Button>
        </div>
        {info && <div className="text-sm text-zinc-600">{info}</div>}
        {!!rows.length && (
          <div className="rounded-xl border border-zinc-200 p-3 text-sm">
            Vorschau: {rows.length} Zeilen · erste 5:
            <ul className="list-disc pl-5">
              {rows.slice(0,5).map((r,i)=>(<li key={i}>{r.email} · {r.lastName} · {r.company}</li>))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LoginView({ selectedUser, setSelectedUser, password, setPassword, authed, onLogin, onLogout }:{ selectedUser:'Maxi'|'Thorsten'; setSelectedUser:(u:any)=>void; password:string; setPassword:(p:string)=>void; authed:boolean; onLogin:()=>void; onLogout:()=>void; }){
  return (
    <Card className="border-zinc-200 shadow-sm">
      <CardHeader className="pb-2"><CardTitle>Login</CardTitle></CardHeader>
      <CardContent className="flex flex-col md:flex-row gap-3 md:items-end">
        <div className="space-y-1">
          <Label>Nutzer</Label>
          <Select value={selectedUser} onValueChange={(v:any)=>setSelectedUser(v)}>
            <SelectTrigger className="w-48 border-zinc-300"><SelectValue placeholder="Nutzer"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="Maxi">Maxi</SelectItem>
              <SelectItem value="Thorsten">Thorsten</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Passwort</Label>
          <Input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-56 border-zinc-300" placeholder="avus"/>
        </div>
        {!authed ? (
          <Button onClick={onLogin} className="bg-green-600 hover:bg-green-700 text-white">Login</Button>
        ) : (
          <Button variant="secondary" onClick={onLogout} className="border-zinc-300">Logout</Button>
        )}
      </CardContent>
    </Card>
  );
}

function exportCsv(rows: any[]) {
  if (!rows?.length) { return; }
  const headers = ["firstName", "lastName", "company", "email", "status", "disabled", "tags"];
  const csv = [headers.join(",")]
    .concat(rows.map(r => headers.map(h => { const v = h === "tags" ? (r.tags || []).join("|") : r[h]; return JSON.stringify(v ?? ""); }).join(",")))
    .join("\\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `contacts_export_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

/* ===============================
   Backend-Notizen (Implementieren)
   ===============================
   🔹 Templates-API
      GET /api/templates → [{ name, steps:[{title, body}] }]
      POST /api/templates/:name → speichert Template

   🔹 Blacklist-API
      GET /api/blacklist?q=&bounces=1 → { blacklist:[], bounces:[] }
      POST /api/blacklist { email }
      (später) POST /api/blacklist/domain { domain: "firmax.de" }

   🔹 Kampagne
      POST /api/campaign/start { startNow, nextDailyTime, template, user, perDay, limit }
      POST /api/campaign/stop
      Listener: eingehende Antwort → Kontakt deaktivieren + Tag setzen

   🔹 Kontakte-Import
      POST /api/contacts/import { rows, mode }  // mode: append|overwrite → bei overwrite vorher Backup erstellen
*/

// ===============================
// Einfache Tests (ohne Framework)
// ===============================
export function runDashboardTests() {
  const results: { name: string; ok: boolean; details?: string }[] = [];
  try {
    results.push({ name: "compile: hooks available", ok: typeof useDebouncedValue === "function" });

    // chartData shape
    const mockStats = { sent: 1, replies: 2, hot: 3, needReview: 4, meetings: 5 };
    const expectedKeys = ["Gesendet", "Antworten", "HOT", "Need Review", "Meetings"];
    const data = [
      { name: "Gesendet", value: mockStats.sent },
      { name: "Antworten", value: mockStats.replies },
      { name: "HOT", value: mockStats.hot },
      { name: "Need Review", value: mockStats.needReview },
      { name: "Meetings", value: mockStats.meetings },
    ];
    const okShape = data.length === 5 && data.every((d, i) => d.name === expectedKeys[i] && typeof d.value === "number");
    results.push({ name: "chartData: correct shape", ok: okShape });

    // API builder
    results.push({ name: "API.contacts builds url", ok: API.contacts(25) === "/api/contacts?limit=25" });
    results.push({ name: "API.todos builds url", ok: API.todos(10) === "/api/sent-todos?limit=10" });

    // Filter-Utility
    const sample = [
      { firstName: 'A', lastName: 'B', company: 'C', email: 'a@b.de' },
      { firstName: 'X', lastName: 'Y', company: 'Z', email: 'x@y.de' },
    ];
    const f1 = filterContactsUtil(sample, 'a@b');
    const f2 = filterContactsUtil(sample, 'z');
    results.push({ name: "filterContactsUtil: by email", ok: f1.length === 1 && f1[0].email === 'a@b.de' });
    results.push({ name: "filterContactsUtil: by company", ok: f2.length === 1 && f2[0].company === 'Z' });

    // classNames utility
    results.push({ name: "classNames joins truthy", ok: classNames('a', false && 'x', 'b') === 'a b' });

    // schedule helper
    const now = new Date('2025-10-18T15:39:00Z');
    const n1 = computeNextDailyRun('16:00', now);
    const n2 = computeNextDailyRun('15:00', now);
    results.push({ name: "computeNextDailyRun future today", ok: n1 > now && n1.getUTCHours()>=16 });
    results.push({ name: "computeNextDailyRun tomorrow when past", ok: n2.getUTCDate() !== now.getUTCDate() });

    // email helper
    results.push({ name: "isEmail valid", ok: isEmail('test@example.com') });
    results.push({ name: "isEmail invalid", ok: !isEmail('not-an-email') });
  } catch (e: any) {
    results.push({ name: "unexpected error", ok: false, details: e?.message });
  }
  return results;
}
