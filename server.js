// server.js
// -------------------------------------------------------------------
// avus Email-Akquise Dashboard – lokales Excel-Backend (Node + ExcelJS)
// -------------------------------------------------------------------

import fs from "fs";
import path from "path";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import ExcelJS from "exceljs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

// ---------- env laden (.env oder env.local neben server.js) ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const envPath = fs.existsSync(path.join(__dirname, ".env"))
  ? path.join(__dirname, ".env")
  : (fs.existsSync(path.join(__dirname, "env.local")) ? path.join(__dirname, "env.local") : null);

if (envPath) dotenv.config({ path: envPath });
else dotenv.config();

// ---------- Konfiguration ----------
const PORT         = Number(process.env.PORT || 8080);
const PUBLIC_DIR   = path.join(__dirname, "public");

const CORS_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",").map(s => s.trim()).filter(Boolean);

// Workbooks (Dateipfade)
const LOCAL_XLSX   = process.env.LOCAL_XLSX  || "./local.xlsx";
const GLOBAL_XLSX  = process.env.GLOBAL_XLSX || "./global.xlsx";
const BACKUP_DIR   = process.env.BACKUP_DIR  || "";

// Lokale Tabs
const SHEET_LEADS       = process.env.SHEET_LEADS       || "campaign_leads";
const SHEET_UPLOAD      = process.env.SHEET_UPLOAD      || "upload";
const SHEET_TRANSFORMED = process.env.SHEET_TRANSFORMED || "transformed";
const SHEET_TEMPLATES   = process.env.SHEET_TEMPLATES   || "templates";
const SHEET_BLACKLIST   = process.env.SHEET_BLACKLIST   || "blacklist";
const SHEET_BOUNCE      = process.env.SHEET_BOUNCE      || "bounce";
const SHEET_SETTINGS    = process.env.SHEET_SETTINGS    || "settings";
const SHEET_SIGNATURES  = process.env.SHEET_SIGNATURES  || "signatures";
const SHEET_OLD         = process.env.SHEET_OLD         || "old_campaigns";

// Globale Tabs
const GSHEET_TEMPLATES  = process.env.GSHEET_TEMPLATES  || "templates_global";
const GSHEET_SIGNATURES = process.env.GSHEET_SIGNATURES || "signatures_global"; // <- korrigiert
const GSHEET_BLACKLIST  = process.env.GSHEET_BLACKLIST  || "blacklist";
const GSHEET_BOUNCE     = process.env.GSHEET_BOUNCE     || "bounce";
const GSHEET_ERROR_LIST = process.env.GSHEET_ERROR_LIST || "error_list";

// ===================================================================
// Excel-Helpers (sauber 1-basiert, robust gegen leere Dateien)
// ===================================================================
async function ensureFileExists(fp) {
  if (!fs.existsSync(fp)) {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Sheet1");
    await wb.xlsx.writeFile(fp);
  }
}

async function openWorkbook(fp) {
  await ensureFileExists(fp);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(fp);
  return wb;
}
async function openLocalWB()  { return openWorkbook(LOCAL_XLSX); }
async function openGlobalWB() { return openWorkbook(GLOBAL_XLSX); }

function backupIfEnabled(fp) {
  if (!BACKUP_DIR) return Promise.resolve();
  try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); } catch {}
  const ts   = new Date().toISOString().replace(/[:.]/g,"-");
  const base = path.basename(fp, path.extname(fp));
  const dst  = path.join(BACKUP_DIR, `${base}-${ts}.xlsx`);
  const wb   = new ExcelJS.Workbook();
  return wb.xlsx.readFile(fp).then(() => wb.xlsx.writeFile(dst)).catch(()=>{});
}

function getSheetIfExists(wb, name) {
  return wb.getWorksheet(name) || null;
}
function getOrCreateSheet(wb, name) {
  return wb.getWorksheet(name) || wb.addWorksheet(name);
}

// Header als Array (1-basiert) – leere Spalten werden ignoriert
function readHeader(ws) {
  if (!ws || ws.rowCount < 1) return [];
  const first = ws.getRow(1);
  const headers = [];
  for (let c = 1; c <= first.cellCount; c++) {
    const key = String(first.getCell(c).value ?? "").trim();
    if (key) headers.push(key);
  }
  return headers;
}

function readRows(ws) {
  const out = [];
  if (!ws || ws.rowCount < 1) return out;
  const headers = readHeader(ws);
  if (!headers.length) return out;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      const val = row.getCell(c + 1).value;
      obj[headers[c]] = val == null ? "" : val;
    }
    // nur nicht-leer
    if (Object.values(obj).some(v => String(v).trim() !== "")) out.push(obj);
  }
  return out;
}

function writeSheetReplace(ws, objects) {
  const colsSet = new Set();
  (objects || []).forEach(o => Object.keys(o).forEach(k => colsSet.add(k)));
  const headers = Array.from(colsSet);
  ws.spliceRows(1, ws.rowCount);
  ws.addRow(headers.length ? headers : ["_"]);
  (objects || []).forEach(o => {
    ws.addRow(headers.map(h => (h in o ? o[h] : "")));
  });
}

function appendRows(ws, objects) {
  const existingHeaders = readHeader(ws);
  if (!existingHeaders.length) {
    const head = Array.from(new Set(objects.flatMap(o => Object.keys(o))));
    ws.addRow(head.length ? head : ["_"]);
  }
  const headers = readHeader(ws);
  (objects || []).forEach(o => ws.addRow(headers.map(h => o[h] ?? "")));
}

function clearDataKeepHeader(ws) {
  if (!ws || ws.rowCount < 2) return;
  ws.spliceRows(2, ws.rowCount - 1);
}

const toTF   = v => (String(v).toUpperCase() === "TRUE" || v === true || String(v).toUpperCase()==="WAHR") ? "TRUE" : "FALSE";
const asTF   = v => String(v).toUpperCase() === "TRUE" || String(v).toUpperCase() === "WAHR";
const uuidV4 = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, ch => {
  const r = (Math.random() * 16) | 0;
  const v = ch === "x" ? r : (r & 0x3) | 0x8;
  return v.toString(16);
});

// Templates gruppieren → [{name, steps[], total_steps}]
function groupTemplates(rows) {
  const by = {};
  (rows || []).forEach(r => {
    const seq = String(r.sequence_id || r.sequenceId || "Standard");
    (by[seq] ||= { steps: [], total_steps: null });
    by[seq].steps.push({
      step: Number(r.step || 0),
      subject: r.subject || "",
      body_html: r.body_html || "",
      delay_days: Number(r.delay_days || 0)
    });
    if ((String(r.step) === "1" || r.step === 1) && r.total_steps != null && by[seq].total_steps == null) {
      const ts = Number(r.total_steps); if (ts > 0) by[seq].total_steps = ts;
    }
  });
  return Object.entries(by).map(([name, g]) => ({
    name,
    steps: g.steps.sort((a,b)=>a.step-b.step),
    total_steps: g.total_steps ?? g.steps.length
  }));
}

// Settings (row 2) lesen/schreiben – NICHT zerstörerisch
async function readSettingsRow2Local(createIfMissing=false) {
  const wb = await openLocalWB();
  const ws = getOrCreateSheet(wb, SHEET_SETTINGS);
  if (createIfMissing && ws.rowCount === 0) { ws.addRow(["Signatur"]); ws.addRow([""]); }
  if (createIfMissing && ws.rowCount === 1) ws.addRow([""]);
  const headers = readHeader(ws);
  const row2 = {};
  if (ws.rowCount >= 2 && headers.length) {
    const r = ws.getRow(2);
    headers.forEach((h,i)=> row2[h] = r.getCell(i+1).value ?? "");
  }
  return { wb, ws, headers, row2 };
}
function writeSettingsRow2(ws, headers, row2) {
  const set = new Set(headers);
  Object.keys(row2).forEach(k => set.add(k));
  const nextHeaders = Array.from(set);
  ws.spliceRows(1, ws.rowCount);
  ws.addRow(nextHeaders);
  ws.addRow(nextHeaders.map(h => row2[h] ?? ""));
}

// ===================================================================
// Express-App
// ===================================================================
const app = express();

if (CORS_ORIGINS.length) {
  app.use(cors({
    origin: (origin, cb) => (!origin || CORS_ORIGINS.includes(origin)) ? cb(null,true) : cb(new Error("CORS blocked")),
    credentials: false
  }));
} else {
  app.use(cors());
}
app.use(bodyParser.json({ limit: "5mb" }));
app.use(bodyParser.text({ type: "text/plain" }));
app.use(express.static(PUBLIC_DIR));

app.get("/api/health", (_req,res)=>res.json({ ok:true, ts:new Date().toISOString() }));

// --------------------------- GET (READ) ---------------------------

// Kontakte (limit & includeInactive)
app.get("/api/contacts", async (req,res)=>{
  try{
    const limit = Math.max(1, Number(req.query.limit || 50));
    const includeInactive = String(req.query.includeInactive || "1") === "1";
    const wb = await openLocalWB();
    const ws = getSheetIfExists(wb, SHEET_LEADS);
    const all = readRows(ws);
    const out = all.filter(r => includeInactive ? true : asTF(r.active)).slice(0, limit);
    res.json({ contacts: out });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});

// KPIs
app.get("/api/stats", async (_req,res)=>{
  try{
    const wb = await openLocalWB();
    const ws = getSheetIfExists(wb, SHEET_LEADS);
    const rows = readRows(ws);
    let sent=0, replies=0, hot=0, needReview=0;
    rows.forEach(r=>{
      if (r.last_sent_at || Number(r.step_sent||0)>0) sent++;
      const v = String(r.response||"").trim().toLowerCase();
      if (v==="reply") replies++;
      else if (v==="hot") hot++;
      else if (v==="need review" || v==="need_review") needReview++;
    });
    res.json({ sent, replies, hot, needReview, meetings:0 });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});

// Templates (local/global)
app.get("/api/templates", async (_req,res)=>{
  try{
    const wb = await openLocalWB();
    const ws = getSheetIfExists(wb, SHEET_TEMPLATES);
    res.json( groupTemplates(readRows(ws)) );
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});
app.get("/api/global/templates", async (_req,res)=>{
  try{
    const wb = await openGlobalWB();
    const ws = getSheetIfExists(wb, GSHEET_TEMPLATES);
    res.json( groupTemplates(readRows(ws)) );
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});
app.get("/api/templates/active", async (_req,res)=>{
  try{
    const { row2 } = await readSettingsRow2Local(true);
    res.json({ local: row2["active_template_local"]||"", global: row2["active_template_global"]||"" });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});

// Blacklist (local/global)
app.get("/api/blacklist", async (req,res)=>{
  try{
    const q = String(req.query.q||"").toLowerCase();
    const incB = String(req.query.bounces||"0")==="1";
    const wb = await openLocalWB();
    const bl = readRows(getSheetIfExists(wb, SHEET_BLACKLIST)).map(r=>r.email).filter(Boolean);
    const bo = incB ? readRows(getSheetIfExists(wb, SHEET_BOUNCE)).map(r=>r.email).filter(Boolean) : [];
    const f = x => q ? String(x).toLowerCase().includes(q) : true;
    res.json({ blacklist: bl.filter(f), bounces: bo.filter(f) });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});
app.get("/api/global/blacklist", async (req,res)=>{
  try{
    const q = String(req.query.q||"").toLowerCase();
    const incB = String(req.query.bounces||"0")==="1";
    const wb = await openGlobalWB();
    const bl = readRows(getSheetIfExists(wb, GSHEET_BLACKLIST)).map(r=>r.email).filter(Boolean);
    const bo = incB ? readRows(getSheetIfExists(wb, GSHEET_BOUNCE)).map(r=>r.email).filter(Boolean) : [];
    const f = x => q ? String(x).toLowerCase().includes(q) : true;
    res.json({ blacklist: bl.filter(f), bounces: bo.filter(f) });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});

// Signaturen (local/global)
app.get("/api/signatures", async (_req,res)=>{
  try{
    const wb = await openLocalWB();
    const ws = getSheetIfExists(wb, SHEET_SIGNATURES);
    const rows = (readRows(ws) || []);
    // dedupe by name (case-insensitive)
    const seen = new Set(); const list=[];
    rows.forEach(r=>{
      const name = String(r.name||"").trim(); if (!name) return;
      const key = name.toLowerCase(); if (seen.has(key)) return;
      seen.add(key); list.push({ name, html: r.html||"" });
    });
    const { row2 } = await readSettingsRow2Local(true);
    const active = { scope: row2["active_signature_scope"]||"local", name: row2["active_signature_name"]||"standard" };
    res.json({ list, active });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});
app.get("/api/signatures/standard", async (_req,res)=>{
  try{ const { row2 } = await readSettingsRow2Local(true); res.json({ html: row2["Signatur"]||"" }); }
  catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});
app.get("/api/signatures/active", async (_req,res)=>{
  try{ const { row2 } = await readSettingsRow2Local(true);
       res.json({ scope: row2["active_signature_scope"]||"local", name: row2["active_signature_name"]||"standard" }); }
  catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});
app.get("/api/global/signatures", async (_req,res)=>{
  try{
    const wb = await openGlobalWB();
    const ws = getSheetIfExists(wb, GSHEET_SIGNATURES);
    const rows = (readRows(ws)||[]);
    const seen = new Set(); const list=[];
    rows.forEach(r=>{
      const name = String(r.name||"").trim(); if (!name) return;
      const key = name.toLowerCase(); if (seen.has(key)) return;
      seen.add(key); list.push({ name, html: r.html||"" });
    });
    res.json({ list });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});

// Error-List (global)
app.get("/api/global/error_list", async (_req,res)=>{
  try{
    const wb = await openGlobalWB();
    const ws = getOrCreateSheet(wb, GSHEET_ERROR_LIST);
    let rows = readRows(ws);
    let mutated = false;

    rows = rows.map(r=>{
      const out = { ...r };
      if (!out.id) { out.id = uuidV4(); mutated = true; }
      const vis = String(out.visible ?? "TRUE").toUpperCase();
      if (vis!=="TRUE" && vis!=="FALSE") { out.visible="TRUE"; mutated=true; }
      return out;
    });

    if (mutated) { writeSheetReplace(ws, rows); await wb.xlsx.writeFile(GLOBAL_XLSX); }

    res.json({ rows: rows.filter(r => String(r.visible).toUpperCase() !== "FALSE") });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});

// --------------------------- POST (WRITE) ---------------------------

// Toggle "active" (TRUE/FALSE als String; akzeptiert auch WAHR/FALSCH)
app.post("/api/contacts/active", async (req,res)=>{
  try{
    const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
    if (!updates.length) return res.json({ error: "no updates" });

    const wb = await openLocalWB();
    const ws = getOrCreateSheet(wb, SHEET_LEADS);
    if (ws.rowCount === 0) ws.addRow(["email","id","active"]);

    const headers = readHeader(ws);
    const idxEmail  = headers.indexOf("email");
    const idxId     = headers.indexOf("id");
    let   idxActive = headers.indexOf("active");

    if (idxActive < 0) { headers.push("active"); writeSettingsRow2(ws, headers, {}); } // reuse writer to reset header
    // Header neu einlesen (Positionen!)
    const H = readHeader(ws);
    const pos = {
      email:  H.indexOf("email")+1,
      id:     H.indexOf("id")+1,
      active: H.indexOf("active")+1
    };

    // Index map (key -> rowIndex)
    const map = {};
    for (let r=2; r<=ws.rowCount; r++) {
      const email = String(ws.getRow(r).getCell(pos.email||1).value||"").toLowerCase();
      const id    = String(ws.getRow(r).getCell(pos.id||1).value||"").toLowerCase();
      if (email) map[email] = r;
      if (id)    map[id]    = r;
    }

    let changed = 0;
    updates.forEach(u=>{
      const key = String(u.email || u.id || "").toLowerCase();
      const row = map[key];
      if (!row) return;
      const wanted = toTF(u.active);
      const cur    = String(ws.getRow(row).getCell(pos.active).value||"");
      if (cur !== wanted) { ws.getRow(row).getCell(pos.active).value = wanted; changed++; }
    });

    await backupIfEnabled(LOCAL_XLSX);
    await wb.xlsx.writeFile(LOCAL_XLSX);
    res.json({ ok:true, updated: changed });
  }catch(e){
    console.log("[contacts:active]", e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ToDo
app.post("/api/contacts/todo", async (req,res)=>{
  try{
    const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
    if (!updates.length) return res.status(400).json({ error: "no updates" });

    const wb = await openLocalWB();
    const ws = getOrCreateSheet(wb, SHEET_LEADS);
    const rows = readRows(ws);

    const idx = new Map();
    rows.forEach((r,i)=>{ if(r.email) idx.set(String(r.email).toLowerCase(), i); if(r.id) idx.set(String(r.id).toLowerCase(), i); });

    updates.forEach(u=>{
      const key = String(u.email || u.id || "").toLowerCase();
      const i = idx.get(key); if (i==null) return;
      rows[i].todo = toTF(u.todo);
    });

    writeSheetReplace(ws, rows);
    await backupIfEnabled(LOCAL_XLSX);
    await wb.xlsx.writeFile(LOCAL_XLSX);
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});

// Remove contact
app.post("/api/contacts/remove", async (req,res)=>{
  try{
    const id = String(req.body?.id||""); const email = String(req.body?.email||"");
    if (!id && !email) return res.status(400).json({ error: "id or email required" });

    const wb = await openLocalWB();
    const ws = getOrCreateSheet(wb, SHEET_LEADS);
    const keep = readRows(ws).filter(r=>{
      const m1 = email && String(r.email||"").toLowerCase()===email.toLowerCase();
      const m2 = id    && String(r.id||"").toLowerCase()===id.toLowerCase();
      return !(m1||m2);
    });
    writeSheetReplace(ws, keep);
    await backupIfEnabled(LOCAL_XLSX);
    await wb.xlsx.writeFile(LOCAL_XLSX);
    res.json({ ok:true });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});

// Templates LOCAL save / delete / active
app.post("/api/templates/:sequenceId", async (req,res)=>{
  try{
    const sequenceId = req.params.sequenceId;
    const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];
    const total_steps = Number(req.body?.total_steps || steps.length);

    const wb = await openLocalWB();
    const ws = getOrCreateSheet(wb, SHEET_TEMPLATES);
    const rows = readRows(ws);

    const keep = rows.filter(r => (r.sequence_id || r.sequenceId) !== sequenceId);
    const toAdd = steps.map((s,i)=>{
      const row = {
        sequence_id: sequenceId,
        step: s.step || (i+1),
        subject: s.subject || "",
        body_html: s.body_html || "",
        delay_days: Number(s.delay_days || 0)
      };
      if (String(row.step)==="1") row.total_steps = total_steps;
      return row;
    });

    writeSheetReplace(ws, keep.concat(toAdd));
    await backupIfEnabled(LOCAL_XLSX);
    await wb.xlsx.writeFile(LOCAL_XLSX);
    res.json({ ok:true, sequence_id: sequenceId, total_steps });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});
app.post("/api/templates/delete/:sequenceId", async (req,res)=>{
  try{
    const wb = await openLocalWB();
    const ws = getOrCreateSheet(wb, SHEET_TEMPLATES);
    const rows = readRows(ws).filter(r => (r.sequence_id || r.sequenceId) !== req.params.sequenceId);
    writeSheetReplace(ws, rows);
    await backupIfEnabled(LOCAL_XLSX);
    await wb.xlsx.writeFile(LOCAL_XLSX);
    res.json({ ok:true, deleted: req.params.sequenceId });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});
app.post("/api/templates/active", async (req,res)=>{
  try{
    const name  = String(req.body?.name || "");
    const scope = String(req.body?.scope||"local");
    const { wb, ws, headers, row2 } = await readSettingsRow2Local(true);
    if (scope==="global") row2["active_template_global"] = name;
    else row2["active_template_local"] = name;
    writeSettingsRow2(ws, headers, row2);
    await backupIfEnabled(LOCAL_XLSX);
    await wb.xlsx.writeFile(LOCAL_XLSX);
    res.json({ ok:true, name, scope });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});

// Templates GLOBAL save / delete / active
app.post("/api/global/templates/:sequenceId", async (req,res)=>{
  try{
    const sequenceId = req.params.sequenceId;
    const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];
    const total_steps = Number(req.body?.total_steps || steps.length);

    const wb = await openGlobalWB();
    const ws = getOrCreateSheet(wb, GSHEET_TEMPLATES);
    const rows = readRows(ws);

    const keep = rows.filter(r => (r.sequence_id || r.sequenceId) !== sequenceId);
    const toAdd = steps.map((s,i)=>{
      const row = {
        sequence_id: sequenceId,
        step: s.step || (i+1),
        subject: s.subject || "",
        body_html: s.body_html || "",
        delay_days: Number(s.delay_days || 0)
      };
      if (String(row.step)==="1") row.total_steps = total_steps;
      return row;
    });

    writeSheetReplace(ws, keep.concat(toAdd));
    await backupIfEnabled(GLOBAL_XLSX);
    await wb.xlsx.writeFile(GLOBAL_XLSX);
    res.json({ ok:true, sequence_id: sequenceId, total_steps });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});
app.post("/api/global/templates/delete/:sequenceId", async (req,res)=>{
  try{
    const wb = await openGlobalWB();
    const ws = getOrCreateSheet(wb, GSHEET_TEMPLATES);
    const rows = readRows(ws).filter(r => (r.sequence_id || r.sequenceId) !== req.params.sequenceId);
    writeSheetReplace(ws, rows);
    await backupIfEnabled(GLOBAL_XLSX);
    await wb.xlsx.writeFile(GLOBAL_XLSX);
    res.json({ ok:true, deleted: req.params.sequenceId });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});
app.post("/api/global/templates/active", async (req,res)=>{
  try{
    const name = String(req.body?.name || "");
    const { wb, ws, headers, row2 } = await readSettingsRow2Local(true);
    row2["active_template_global"] = name;
    writeSettingsRow2(ws, headers, row2);
    await backupIfEnabled(LOCAL_XLSX);
    await wb.xlsx.writeFile(LOCAL_XLSX);
    res.json({ ok:true, name });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});

// Signaturen LOCAL save / active / delete
app.post("/api/signatures/save", async (req,res)=>{
  try{
    const name = String(req.body?.name||"").trim();
    const html = String(req.body?.html||"");
    if (!name) return res.status(400).json({ error: "name required" });

    const wb = await openLocalWB();
    const ws = getOrCreateSheet(wb, SHEET_SIGNATURES);
    const rows = readRows(ws);

    let found=false;
    rows.forEach(r => {
      if (String(r.name||"").toLowerCase() === name.toLowerCase()) { r.html = html; found=true; }
    });
    if (!found) rows.push({ name, html });

    writeSheetReplace(ws, rows);
    await backupIfEnabled(LOCAL_XLSX);
    await wb.xlsx.writeFile(LOCAL_XLSX);
    res.json({ ok:true, name });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});
app.post("/api/signatures/active", async (req,res)=>{
  try{
    const scope = String(req.body?.scope||"local");
    const name  = String(req.body?.name ||"standard");
    const { wb, ws, headers, row2 } = await readSettingsRow2Local(true);
    row2["active_signature_scope"] = scope;
    row2["active_signature_name"]  = name;
    writeSettingsRow2(ws, headers, row2);
    await backupIfEnabled(LOCAL_XLSX);
    await wb.xlsx.writeFile(LOCAL_XLSX);
    res.json({ ok:true, scope, name });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});
app.post("/api/signatures/delete/:name", async (req,res)=>{
  try{
    const name = req.params.name;
    if (!name) return res.status(400).json({ error: "name missing" });
    if (String(name).toLowerCase()==="standard") return res.status(400).json({ error: "cannot delete standard" });

    const wb = await openLocalWB();
    const ws = getOrCreateSheet(wb, SHEET_SIGNATURES);
    const rows = readRows(ws).filter(r => String(r.name||"").toLowerCase() !== name.toLowerCase());
    writeSheetReplace(ws, rows);
    await backupIfEnabled(LOCAL_XLSX);
    await wb.xlsx.writeFile(LOCAL_XLSX);
    res.json({ ok:true, deleted:name });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});

// Signaturen GLOBAL save / active / delete
app.post("/api/global/signatures/save", async (req,res)=>{
  try{
    const name = String(req.body?.name||"").trim();
    const html = String(req.body?.html||"");
    if (!name) return res.status(400).json({ error: "name required" });

    const wb = await openGlobalWB();
    const ws = getOrCreateSheet(wb, GSHEET_SIGNATURES);
    const rows = readRows(ws);

    let found=false;
    rows.forEach(r=>{ if (String(r.name||"").toLowerCase()===name.toLowerCase()) { r.html=html; found=true; }});
    if (!found) rows.push({ name, html });

    writeSheetReplace(ws, rows);
    await backupIfEnabled(GLOBAL_XLSX);
    await wb.xlsx.writeFile(GLOBAL_XLSX);
    res.json({ ok:true, name });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});
app.post("/api/global/signatures/active", async (req,res)=>{
  try{
    const name = String(req.body?.name||"");
    const { wb, ws, headers, row2 } = await readSettingsRow2Local(true);
    row2["active_signature_scope"] = "global";
    row2["active_signature_name"]  = name;
    writeSettingsRow2(ws, headers, row2);
    await backupIfEnabled(LOCAL_XLSX);
    await wb.xlsx.writeFile(LOCAL_XLSX);
    res.json({ ok:true, scope:"global", name });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});
app.post("/api/global/signatures/delete/:name", async (req,res)=>{
  try{
    const wb = await openGlobalWB();
    const ws = getOrCreateSheet(wb, GSHEET_SIGNATURES);
    const rows = readRows(ws).filter(r => String(r.name||"").toLowerCase() !== req.params.name.toLowerCase());
    writeSheetReplace(ws, rows);
    await backupIfEnabled(GLOBAL_XLSX);
    await wb.xlsx.writeFile(GLOBAL_XLSX);
    res.json({ ok:true, deleted:req.params.name });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});

// Upload / Campaign
app.post("/api/upload", async (req,res)=>{
  try{
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: "no rows" });
    const wb = await openLocalWB(); const ws = getOrCreateSheet(wb, SHEET_UPLOAD);
    appendRows(ws, rows);
    await backupIfEnabled(LOCAL_XLSX);
    await wb.xlsx.writeFile(LOCAL_XLSX);
    res.json({ ok:true, inserted: rows.length });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});
app.post("/api/campaign/prepare", async (_req,res)=>{
  try{
    const wb = await openLocalWB();
    const shLeads = getOrCreateSheet(wb, SHEET_LEADS);
    const shOld   = getOrCreateSheet(wb, SHEET_OLD);
    const shTrans = getOrCreateSheet(wb, SHEET_TRANSFORMED);
    const leadsRows = readRows(shLeads);
    if (leadsRows.length) appendRows(shOld, leadsRows);
    clearDataKeepHeader(shLeads);
    const transRows = readRows(shTrans);
    if (transRows.length) appendRows(shLeads, transRows);
    await backupIfEnabled(LOCAL_XLSX);
    await wb.xlsx.writeFile(LOCAL_XLSX);
    res.json({ ok:true, moved:leadsRows.length, loaded:transRows.length });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});
app.post("/api/campaign/start", async (_req,res)=>{
  try{
    const wb = await openLocalWB();
    const ws = getOrCreateSheet(wb, SHEET_LEADS);
    const rows = readRows(ws).map(r => ({ ...r, status:"go" }));
    writeSheetReplace(ws, rows);
    await backupIfEnabled(LOCAL_XLSX);
    await wb.xlsx.writeFile(LOCAL_XLSX);
    res.json({ ok:true, updated: rows.length });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});
app.post("/api/campaign/stop", (_req,res)=>res.json({ ok:true }));

// GLOBAL error list add/delete/visible
app.post("/api/global/error_list/add", async (req,res)=>{
  try{
    const inRows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!inRows.length) return res.status(400).json({ error: "no rows" });
    const wb = await openGlobalWB();
    const ws = getOrCreateSheet(wb, GSHEET_ERROR_LIST);
    const now = readRows(ws);
    const add = inRows.map(r=>({ ...r, id: r.id || uuidV4(), visible: toTF(r.visible ?? "TRUE") }));
    writeSheetReplace(ws, now.concat(add));
    await backupIfEnabled(GLOBAL_XLSX);
    await wb.xlsx.writeFile(GLOBAL_XLSX);
    res.json({ ok:true, inserted: add.length });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});
app.post("/api/global/error_list/delete", async (req,res)=>{
  try{
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ error: "no ids" });
    const wb = await openGlobalWB();
    const ws = getOrCreateSheet(wb, GSHEET_ERROR_LIST);
    const keep = readRows(ws).filter(r => !ids.includes(String(r.id||"")));
    writeSheetReplace(ws, keep);
    await backupIfEnabled(GLOBAL_XLSX);
    await wb.xlsx.writeFile(GLOBAL_XLSX);
    res.json({ ok:true, deleted: ids.length });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});
app.post("/api/global/error_list/visible", async (req,res)=>{
  try{
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const vis = String(req.body?.visible||"TRUE").toUpperCase()==="FALSE" ? "FALSE" : "TRUE";
    if (!ids.length) return res.status(400).json({ error: "no ids" });
    const wb = await openGlobalWB();
    const ws = getOrCreateSheet(wb, GSHEET_ERROR_LIST);
    const rows = readRows(ws);
    const set = new Set(ids.map(String));
    rows.forEach(r => { if (set.has(String(r.id))) r.visible = vis; });
    writeSheetReplace(ws, rows);
    await backupIfEnabled(GLOBAL_XLSX);
    await wb.xlsx.writeFile(GLOBAL_XLSX);
    res.json({ ok:true, updated: ids.length, visible: vis });
  }catch(e){ res.status(500).json({ error: String(e.message || e) }); }
});

// SPA-Fallback
app.get("*", (req,res,next)=>{
  const accept = req.headers.accept || "";
  if (accept.includes("text/html")) {
    const indexPath = path.join(PUBLIC_DIR, "index.html");
    if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  }
  next();
});

app.listen(PORT, ()=>console.log(`[server] listening on http://localhost:${PORT}`));

