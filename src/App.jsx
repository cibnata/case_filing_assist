import { useState, useCallback, useRef, useEffect } from "react";

/* ── Fonts & Constants ── */
const MONO = `"Source Code Pro","JetBrains Mono","SF Mono",Consolas,monospace`;
const SANS = `"Noto Sans TC","PingFang TC","Microsoft JhengHei",-apple-system,sans-serif`;

const FIELD_LABELS = {
  person_name: { label: "人名", icon: "🧑", color: "#2563EB" },
  account: { label: "帳號", icon: "👤", color: "#0EA5E9" },
  nickname: { label: "暱稱", icon: "🏷️", color: "#6366F1" },
  id_number: { label: "身分ID", icon: "🪪", color: "#1D4ED8" },
  wallet_address: { label: "錢包地址", icon: "🔗", color: "#A78BFA" },
  tx_hash: { label: "交易雜湊", icon: "🔖", color: "#60A5FA" },
  bank_account: { label: "銀行帳號", icon: "🏦", color: "#34D399" },
  url: { label: "網址", icon: "🌐", color: "#F472B6" },
  license_plate: { label: "車號", icon: "🚗", color: "#0284C7" },
  location: { label: "地點", icon: "📍", color: "#0369A1" },
  phone_number: { label: "電話", icon: "📞", color: "#FBBF24" },
  datetime: { label: "日期時間", icon: "🕐", color: "#38BDF8" },
  amount: { label: "金額", icon: "💰", color: "#FB923C" },
  line_id: { label: "LINE ID", icon: "💬", color: "#22C55E" },
  email: { label: "電子郵件", icon: "📧", color: "#818CF8" },
  other: { label: "其他", icon: "📋", color: "#94A3B8" },
};

const CHAIN_INFO = {
  ETH: { color: "#627EEA", regex: /0x[a-fA-F0-9]{40}/g },
  BTC: { color: "#F7931A", regex: /(?:bc1[a-zA-HJ-NP-Z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})/g },
  TRON: { color: "#FF0013", regex: /T[a-zA-HJ-NP-Z1-9]{33}/g },
};

const VALIDATION_LABELS = {
  valid: { label: "通過", color: "#22C55E", bg: "#22C55E18" },
  invalid: { label: "失敗", color: "#EF4444", bg: "#EF444418" },
  warning: { label: "警告", color: "#F59E0B", bg: "#F59E0B18" },
  unchecked: { label: "未驗證", color: "#64748B", bg: "#64748B18" },
};

const STATUS_MAP = {
  draft: { label: "草稿", color: "#64748B" },
  processing: { label: "處理中", color: "#3B82F6" },
  pending_review: { label: "待校對", color: "#F59E0B" },
  confirmed: { label: "已確認", color: "#22C55E" },
  exported: { label: "已匯出", color: "#8B5CF6" },
};

/* ── Helpers ── */
const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toLocaleString("zh-TW", { hour12: false });

const detectChain = (addr) => {
  if (/^0x[a-fA-F0-9]{40}$/.test(addr)) return "ETH";
  if (/^T[a-zA-HJ-NP-Z1-9]{33}$/.test(addr)) return "TRON";
  if (/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(addr)) return "BTC";
  return null;
};

const validateField = (type, value, attrs = {}) => {
  if (type === "wallet_address") {
    const chain = attrs.chain || detectChain(value);
    if (!chain) return { status: "invalid", detail: "無法辨識鏈別" };
    if (chain === "ETH" && /^0x[a-fA-F0-9]{40}$/.test(value)) return { status: "valid", detail: `${chain} 地址格式正確 (42字元)` };
    if (chain === "TRON" && /^T[a-zA-HJ-NP-Z1-9]{33}$/.test(value)) return { status: "valid", detail: `${chain} 地址格式正確 (34字元)` };
    if (chain === "BTC" && /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(value)) return { status: "valid", detail: `${chain} 地址格式正確` };
    return { status: "invalid", detail: `${chain} 地址格式不正確` };
  }
  if (type === "tx_hash") {
    if (/^0x[a-fA-F0-9]{64}$/.test(value)) return { status: "valid", detail: "ETH TxHash 格式正確 (66字元)" };
    if (/^[a-fA-F0-9]{64}$/.test(value)) return { status: "valid", detail: "BTC TxHash 格式正確 (64字元)" };
    return { status: "warning", detail: "TxHash 格式待確認" };
  }
  if (type === "url") {
    try {
      const u = new URL(value);
      const suspicious = /xn--|bit\.ly|tinyurl|t\.co|0-9{4,}/.test(u.hostname);
      if (suspicious) return { status: "warning", detail: "疑似短網址或 Punycode，請確認是否為釣魚網址" };
      return { status: "valid", detail: `URL 格式正確 (${u.protocol}//${u.hostname})` };
    } catch { return { status: "invalid", detail: "URL 格式不正確" }; }
  }
  if (type === "bank_account") {
    if (/^\d{10,16}$/.test(value.replace(/[-\s]/g, ""))) return { status: "valid", detail: `帳號 ${value.replace(/[-\s]/g, "").length} 碼` };
    return { status: "warning", detail: "帳號格式待確認" };
  }
  if (type === "datetime") {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return { status: "valid", detail: `解析為 ${d.toLocaleString("zh-TW")}` };
    return { status: "warning", detail: "日期時間格式待確認" };
  }
  return { status: "unchecked", detail: "" };
};

const callAPI = async (messages, useSearch = false) => {
  const body = { model: "claude-sonnet-4-20250514", max_tokens: 1000, messages };
  if (useSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  return data.content.map(b => b.text || "").filter(Boolean).join("\n");
};

/* ── Styles ── */
const C = {
  bg: "#EAF4FF", bg1: "#F8FBFF", bg2: "#FFFFFF", bg3: "#DBEAFE",
  border: "#BFDBFE", borderLight: "#93C5FD",
  text: "#1E3A8A", textLight: "#1D4ED8", textDim: "#64748B", textBright: "#0F172A",
  accent: "#2563EB", accentDark: "#1D4ED8",
  success: "#22C55E", warning: "#F59E0B", danger: "#EF4444",
};

const inferFieldsByRegex = (text) => {
  const rules = [
    { type: "wallet_address", regex: /0x[a-fA-F0-9]{40}|T[a-zA-HJ-NP-Z1-9]{33}|(?:bc1[a-zA-HJ-NP-Z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})/g },
    { type: "bank_account", regex: /\b\d{10,16}\b/g },
    { type: "url", regex: /https?:\/\/[^\s]+/g },
    { type: "id_number", regex: /\b[A-Z][12]\d{8}\b/g },
    { type: "license_plate", regex: /\b[A-Z]{2,3}[- ]?\d{3,4}\b/g },
    { type: "location", regex: /(台北|新北|桃園|台中|台南|高雄)[^\s，。]{0,12}/g },
  ];
  const results = [];
  rules.forEach(({ type, regex }) => {
    const matches = text.match(regex) || [];
    matches.forEach((value) => results.push({ type, value, confidence: 0.72, context: "regex fallback", attributes: {} }));
  });
  return results;
};

/* ── Main Component ── */
export default function CaseFilingSystem() {
  const [view, setView] = useState("list"); // list | workspace
  const [cases, setCases] = useState([
    { id: "demo1", case_number: "NPA-2026-001234", case_type: "fraud", status: "pending_review", title: "加密貨幣投資詐欺案", reporter_name: "王○○", unit: "中正一分局忠孝東路派出所", created_at: "2026/03/04 14:30", evidence: [], fields: [], auditLog: [] },
  ]);
  const [activeCase, setActiveCase] = useState(null);
  const [activeTab, setActiveTab] = useState("evidence");
  const [showNewCase, setShowNewCase] = useState(false);

  const openCase = (c) => { setActiveCase(c); setView("workspace"); setActiveTab("evidence"); };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: SANS, fontSize: 13 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700;900&family=Source+Code+Pro:wght@400;500;600&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-track{background:${C.bg1}}
        ::-webkit-scrollbar-thumb{background:${C.bg3};border-radius:3px}
        button{cursor:pointer;font-family:${SANS}} button:hover{filter:brightness(1.15)}
        input,textarea,select{font-family:${SANS}}
      `}</style>

      {/* Top Bar */}
      <header style={{
        background: `linear-gradient(135deg, #0C1526 0%, #152038 100%)`,
        borderBottom: `1px solid ${C.border}`, padding: "0 24px",
        height: 56, display: "flex", alignItems: "center", gap: 14,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, fontWeight: 900, color: "#fff",
        }}>⛓</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.textBright, letterSpacing: 1 }}>
            受理報案輔助系統
          </div>
          <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 0.5 }}>
            Case Filing Assistance System — MVP v1.0
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {view === "workspace" && (
          <button onClick={() => { setView("list"); setActiveCase(null); }} style={{
            background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6,
            padding: "6px 14px", color: C.textLight, fontSize: 12, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 6,
          }}>← 案件列表</button>
        )}
        <div style={{
          background: C.bg2, borderRadius: 6, padding: "6px 12px",
          fontSize: 11, color: C.textLight, border: `1px solid ${C.border}`,
        }}>
          👮 王大明 ・ 值班員警 ・ 中正一分局
        </div>
      </header>

      {view === "list" ? (
        <CaseList cases={cases} setCases={setCases} openCase={openCase} showNewCase={showNewCase} setShowNewCase={setShowNewCase} />
      ) : (
        <CaseWorkspace
          caseData={activeCase}
          setCaseData={(updater) => {
            setActiveCase(prev => {
              const next = typeof updater === "function" ? updater(prev) : updater;
              setCases(cs => cs.map(c => c.id === next.id ? next : c));
              return next;
            });
          }}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
      )}
    </div>
  );
}

/* ── Case List View ── */
function CaseList({ cases, setCases, openCase, showNewCase, setShowNewCase }) {
  const [newCase, setNewCase] = useState({ case_number: "", title: "", case_type: "fraud", reporter_name: "", unit: "中正一分局忠孝東路派出所" });

  const createCase = () => {
    if (!newCase.case_number || !newCase.title) return;
    const c = {
      ...newCase, id: uid(), status: "draft", created_at: now(),
      evidence: [], fields: [],
      uploadToken: uid(),
      auditLog: [{ action: "case_create", user: "王大明", time: now(), detail: "建立案件" }],
    };
    setCases(prev => [c, ...prev]);
    setShowNewCase(false);
    setNewCase({ case_number: "", title: "", case_type: "fraud", reporter_name: "", unit: "中正一分局忠孝東路派出所" });
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.textBright }}>📋 案件列表</h2>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowNewCase(!showNewCase)} style={{
          background: `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
          border: "none", borderRadius: 8, padding: "10px 20px",
          color: "#fff", fontWeight: 600, fontSize: 13,
        }}>+ 建立新案件</button>
      </div>

      {showNewCase && (
        <div style={{
          background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: 20, marginBottom: 20, animation: "fadeIn .3s ease",
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.textBright, marginBottom: 16 }}>建立新案件</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { label: "報案序號", key: "case_number", placeholder: "NPA-2026-XXXXXX" },
              { label: "案件標題", key: "title", placeholder: "案件摘要..." },
              { label: "報案人", key: "reporter_name", placeholder: "報案人姓名" },
              { label: "受理單位", key: "unit", placeholder: "派出所名稱" },
            ].map(f => (
              <div key={f.key}>
                <div style={{ fontSize: 11, color: C.textLight, fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{f.label}</div>
                <input value={newCase[f.key]} onChange={e => setNewCase(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={{ width: "100%", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 12px", color: C.textBright, fontSize: 13, outline: "none" }}
                />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
            <button onClick={() => setShowNewCase(false)} style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 16px", color: C.textLight, fontSize: 12 }}>取消</button>
            <button onClick={createCase} style={{ background: C.accent, border: "none", borderRadius: 6, padding: "8px 20px", color: "#fff", fontSize: 12, fontWeight: 600 }}>建立</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {cases.map(c => (
          <div key={c.id} onClick={() => openCase(c)} style={{
            background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 10,
            padding: "16px 20px", cursor: "pointer", transition: "all .15s",
            display: "flex", alignItems: "center", gap: 16,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.accent, fontWeight: 600 }}>{c.case_number}</span>
                <StatusBadge status={c.status} />
                <TypeBadge type={c.case_type} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.textBright }}>{c.title}</div>
              {c.uploadToken && (
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
                  <img alt="qr" src={`https://api.qrserver.com/v1/create-qr-code/?size=72x72&data=${encodeURIComponent(`case://${c.case_number}/${c.uploadToken}`)}`} style={{ width: 56, height: 56, border: `1px solid ${C.border}`, borderRadius: 6 }} />
                  <div style={{ fontSize: 11, color: C.textDim }}>掃描上傳案件資料
                    <div style={{ fontFamily: MONO, color: C.textLight }}>case://{c.case_number}/{c.uploadToken}</div>
                  </div>
                </div>
              )}
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>
                {c.unit} ・ 報案人：{c.reporter_name || "—"} ・ {c.created_at}
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: 11, color: C.textDim }}>
              <div>📎 {c.evidence?.length || 0} 件證據</div>
              <div>📌 {c.fields?.length || 0} 個欄位</div>
            </div>
            <div style={{ color: C.textDim, fontSize: 18 }}>›</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Case Workspace ── */
function CaseWorkspace({ caseData, setCaseData, activeTab, setActiveTab }) {
  const tabs = [
    { key: "evidence", label: "📤 證據管理", count: caseData.evidence?.length },
    { key: "extract", label: "🔍 情資擷取", count: caseData.fields?.length },
    { key: "confirm", label: "✅ 校對確認", count: caseData.fields?.filter(f => !f.confirmed).length },
    { key: "export", label: "📄 匯出送交" },
    { key: "audit", label: "📝 稽核日誌", count: caseData.auditLog?.length },
    { key: "interview", label: "🗣️ 筆錄問答" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 56px)" }}>
      {/* Case Header */}
      <div style={{ background: C.bg1, borderBottom: `1px solid ${C.border}`, padding: "12px 24px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 13, color: C.accent, fontWeight: 600 }}>{caseData.case_number}</span>
        <StatusBadge status={caseData.status} />
        <span style={{ fontSize: 15, fontWeight: 700, color: C.textBright }}>{caseData.title}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: C.textDim }}>{caseData.unit} ・ {caseData.created_at}</span>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: C.bg1, borderBottom: `1px solid ${C.border}`, padding: "0 24px", overflowX: "auto" }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            padding: "12px 18px", background: "transparent", border: "none",
            borderBottom: activeTab === t.key ? `2px solid ${C.accent}` : "2px solid transparent",
            color: activeTab === t.key ? C.textBright : C.textDim,
            fontWeight: 600, fontSize: 12, whiteSpace: "nowrap",
            display: "flex", alignItems: "center", gap: 6, transition: "all .15s",
          }}>
            {t.label}
            {t.count > 0 && <span style={{ background: activeTab === t.key ? C.accent : C.bg3, color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
        {activeTab === "evidence" && <EvidenceTab caseData={caseData} setCaseData={setCaseData} setActiveTab={setActiveTab} />}
        {activeTab === "extract" && <ExtractTab caseData={caseData} setCaseData={setCaseData} />}
        {activeTab === "confirm" && <ConfirmTab caseData={caseData} setCaseData={setCaseData} />}
        {activeTab === "export" && <ExportTab caseData={caseData} setCaseData={setCaseData} />}
        {activeTab === "audit" && <AuditTab caseData={caseData} />}
        {activeTab === "interview" && <InterviewTab caseData={caseData} />}
      </div>
    </div>
  );
}



/* ── Evidence Tab 完整修正版 ── */


function EvidenceTab({ caseData, setCaseData, setActiveTab }) {
  const [dragActive, setDragActive] = useState(false);
  const [processing, setProcessing] = useState(null);
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const fileRef = useRef(null);

  const C = {
    accent: "#3b82f6",
    border: "#e5e7eb",
    bg1: "#ffffff",
    bg2: "#f9fafb",
    bg3: "#f3f4f6",
    textBright: "#111827",
    textLight: "#374151",
    textDim: "#6b7280",
  };
  const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

  const addLog = (action, detail) => {
    setCaseData(p => ({
      ...p,
      auditLog: [...(p.auditLog || []), { 
        action, 
        user: "tingwei", 
        time: new Date().toLocaleTimeString(), 
        detail 
      }]
    }));
  };

  const handleFiles = useCallback((files) => {
    const newEvidence = Array.from(files)
      .filter(f => f.type.startsWith("image/") || f.type === "application/pdf")
      .map((f, i) => ({
        id: Math.random().toString(36).substr(2, 9),
        filename: f.name,
        type: f.type === "application/pdf" ? "pdf_document" : "screenshot",
        status: "uploaded",
        file: f,
        preview: null,
        uploadedAt: new Date().toISOString(),
        number: `E-${String((caseData.evidence?.length || 0) + i + 1).padStart(3, "0")}`,
      }));

    newEvidence.forEach(ev => {
      if (ev.file.type.startsWith("image/")) {
        const r = new FileReader();
        r.onload = (e) => setCaseData(p => ({
          ...p,
          evidence: p.evidence.map(x => x.id === ev.id ? { ...x, preview: e.target.result } : x),
        }));
        r.readAsDataURL(ev.file);
      }
    });

    setCaseData(p => ({
      ...p,
      evidence: [...(p.evidence || []), ...newEvidence],
      status: p.status === "draft" ? "processing" : p.status,
    }));
    newEvidence.forEach(e => addLog("evidence_upload", `上傳證據 ${e.number}: ${e.filename}`));
  }, [caseData]);

  const runOCR = async (ev) => {
    if (!ev.file) return;
    setProcessing(ev.id);
    addLog("ocr_start", `開始深度辨識 ${ev.number}`);

    try {
      // --- Step 1: Surya OCR ---
      const formData = new FormData();
      formData.append("file", ev.file);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000);
	  
      console.log("發送請求至 Surya Server (localhost:8000)...");
      const ocrResponse = await fetch("http://localhost:8000/ocr", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!ocrResponse.ok) throw new Error(`OCR Server 異常: ${ocrResponse.status}`);
      const ocrResult = await ocrResponse.json();

      // --- Step 2: 自動存成 TXT ---
      const blob = new Blob([ocrResult.ocr_text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `OCR_Raw_${ev.number}.txt`;
      link.click();
      URL.revokeObjectURL(url);

      // --- Step 3: LLM 分析 ---
      const llmPrompt = `你是台灣警方的數位鑑識與洗錢防制專家。
以下是一段從證據截圖中經由 OCR 提取的原始文字。請分析內容並轉化為結構化 JSON。

### 原始 OCR 文字內容：
"""
${ocrResult.ocr_text}
"""

### 任務目標：
1. 從文字中識別所有涉及金融、身分、通訊的關鍵欄位。
1-1. 請特別擷取：人名、帳號、暱稱、ID、連結網址、銀行帳戶、加密貨幣錢包位址、車號、地點。
2. 針對「加密貨幣地址」，必須確保與原始文字逐字對應。
3. 輸出格式必須為「純 JSON」，不要包含 Markdown 標記或開場白。

### 輸出 JSON 結構規範：
{
  "fields": [
    {
      "type": "person_name|account|nickname|id_number|wallet_address|tx_hash|bank_account|url|phone_number|datetime|amount|line_id|email|license_plate|location|other",
      "value": "擷取的值",
      "confidence": 0.95,
      "context": "脈絡說明",
      "attributes": {}
    }
  ],
  "summary": "繁體中文摘要"
}

### 注意事項：
- 加密貨幣地址務必完整，每個字元都要正確
- ETH: 0x + 40 hex = 42 chars | TRON: T + 33 chars | BTC: 1/3/bc1 開頭
- 金額要包含幣種（TWD/USDT/ETH/BTC...）
- 時間要保留原始格式
- confidence 範圍 0~1，反映辨識把握度
- JSON 物件必須完整且格式正確。`;
      //const llmResponse = await fetch("http://localhost:8001/v1/chat/completions"
	  //server 192.168.10.163:8001
	  console.log("發送請求至 LLM Server (localhost:8001)...");
      const llmResponse = await fetch("http://192.168.10.163:8001/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: llmPrompt }],
          stream: false
        }),
      });

      if (!llmResponse.ok) throw new Error("LLM Server 回應失敗");
      const llmData = await llmResponse.json();
	
      const llmRaw = llmData.choices[0].message.content;
      console.log("LLM 回應:",llmRaw);
      // --- Step 4: 解析與更新 ---
      let parsed;
      try {
        const cleanJson = llmRaw.replace(/```json\s*/g, "").replace(/```/g, "").trim();
        parsed = JSON.parse(cleanJson);
      } catch {
        const m = llmRaw.match(/\{[\s\S]*\}/);
        parsed = m ? JSON.parse(m[0]) : { fields: [] };
      }
      console.log("parsed:",parsed);
      const extractedFields = (parsed.fields || []).length ? (parsed.fields || []) : inferFieldsByRegex(ocrResult.ocr_text);
      const newFields = extractedFields.map(f => ({
        id: Math.random().toString(36).substr(2, 9),
        evidenceId: ev.id,
        evidenceNumber: ev.number,
        type: f.type || "other",
        value: f.value,
        confidence: f.confidence || 0.8,
        context: f.context || "",
        attributes: f.attributes || {},
        sourcePage: (ocrResult.pages || []).find(pg => (pg.text || "").includes(f.value))?.page || 1,
        method: "surya+llm",
      }));

      setCaseData(p => ({
        ...p,
        evidence: p.evidence.map(x => x.id === ev.id ? {
          ...x, status: "extracted", ocrText: ocrResult.ocr_text, ocrPages: ocrResult.pages || [], summary: parsed.summary,
        } : x),
        fields: [...(p.fields || []), ...newFields],
      }));
      addLog("ocr_complete", `${ev.number} 辨識完成`);

    } catch (err) {
      console.error(err);
      addLog("ocr_fail", `${ev.number} 失敗: ${err.message}`);
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div style={{ display: "flex", gap: 20, height: "100%", padding: 20 }}>
      {/* 左側清單 */}
      <div style={{ width: 360, display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            border: `2px dashed ${dragActive ? C.accent : C.border}`, borderRadius: 12,
            padding: 28, textAlign: "center", cursor: "pointer", background: dragActive ? `${C.accent}08` : C.bg1,
          }}
          onDragOver={e => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={e => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={e => handleFiles(e.target.files)} />
          <div style={{ fontSize: 24 }}>📤</div>
          <div style={{ color: C.textLight, fontSize: 13, fontWeight: 600 }}>點擊或拖放上傳</div>
        </div>

        <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {(caseData.evidence || []).map(ev => (
            <div key={ev.id} onClick={() => setSelectedEvidence(ev)} style={{
              background: selectedEvidence?.id === ev.id ? `${C.accent}12` : C.bg1,
              border: `1px solid ${selectedEvidence?.id === ev.id ? C.accent : C.border}`,
              borderRadius: 8, padding: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 12
            }}>
              <div style={{ width: 40, height: 40, background: C.bg3, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {ev.preview ? <img src={ev.preview} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "📄"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{ev.number}</div>
                <div style={{ fontSize: 11, color: C.textDim, overflow: "hidden", textOverflow: "ellipsis" }}>{ev.filename}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 右側詳情 */}
      <div style={{ flex: 1, background: C.bg1, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "auto", padding: 24 }}>
        {selectedEvidence ? (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <h3 style={{ margin: 0 }}>{selectedEvidence.filename}</h3>
              {selectedEvidence.status !== "extracted" && (
                <button 
                  onClick={() => runOCR(selectedEvidence)} 
                  disabled={processing === selectedEvidence.id}
                  style={{ background: C.accent, color: "white", border: "none", padding: "8px 16px", borderRadius: 6, cursor: "pointer" }}
                >
                  {processing === selectedEvidence.id ? "辨識中..." : "🔍 開始 OCR 辨識"}
                </button>
              )}
            </div>

            {selectedEvidence.preview ? (
              <img src={selectedEvidence.preview} style={{ maxWidth: "100%", borderRadius: 8, border: `1px solid ${C.border}` }} />
            ) : (
              <div style={{ padding: 60, background: C.bg2, textAlign: "center", borderRadius: 8 }}>
                <div style={{ fontSize: 40 }}>📕</div>
                <div style={{ marginTop: 10, color: C.textDim }}>PDF 檔案已就緒</div>
              </div>
            )}

            {selectedEvidence.ocrText && (
              <div style={{ marginTop: 24, borderTop: `1px solid ${C.border}`, paddingTop: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.textBright }}>OCR 提取文字</div>
                  <button 
                    onClick={() => {
                      const blob = new Blob([selectedEvidence.ocrText], { type: "text/plain" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${selectedEvidence.number}_raw.txt`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    style={{ fontSize: 11, background: "none", border: `1px solid ${C.border}`, padding: "4px 8px", borderRadius: 4, cursor: "pointer" }}
                  >
                    💾 下載文字檔
                  </button>
                </div>
                <pre style={{ background: C.bg2, padding: 16, borderRadius: 8, fontSize: 12, whiteSpace: "pre-wrap", fontFamily: MONO }}>
                  {selectedEvidence.ocrText}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: "center", color: C.textDim, marginTop: 100 }}>請選擇左側證據以進行 AI 辨識</div>
        )}
      </div>
    </div>
  );
}




/* ── Extract Tab ── */
function ExtractTab({ caseData, setCaseData }) {
  const fields = caseData.fields || [];
  const grouped = {};
  fields.forEach(f => { (grouped[f.type] = grouped[f.type] || []).push(f); });

  const [manualType, setManualType] = useState("wallet_address");
  const [manualValue, setManualValue] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedField, setSelectedField] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [graphImage, setGraphImage] = useState(null);
  const [ledgerCoin, setLedgerCoin] = useState("USDT");
  const [ledgerRange, setLedgerRange] = useState("30d");

  const addManualField = (type, value) => {
    const chain = type === "wallet_address" ? detectChain(value) : null;
    const v = validateField(type, value, { chain });
    const f = {
      id: uid(), evidenceId: null, evidenceNumber: "手動",
      type, value, confidence: 1.0, context: "手動輸入",
      attributes: { chain }, validation: v, confirmed: false, method: "manual", sourcePage: 1,
    };
    setCaseData(p => ({
      ...p, fields: [...(p.fields || []), f],
      auditLog: [...(p.auditLog || []), { action: "field_manual", user: "王大明", time: now(), detail: `手動新增 ${FIELD_LABELS[type]?.label}: ${value}` }],
    }));
  };

  useEffect(() => {
    if (!fields.length) return;
    fetch("http://localhost:8000/network-graph", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ case_number: caseData.case_number, fields: fields.map(f => ({ type: f.type, value: f.value })) })
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => setGraphImage(data?.image_base64 ? `data:image/png;base64,${data.image_base64}` : null))
      .catch(() => setGraphImage(null));
  }, [fields.length]);

  const categories = Object.entries(grouped);
  const showing = selectedType === "all" ? fields : (grouped[selectedType] || []);
  const selectedEvidence = caseData.evidence?.find(e => e.id === selectedField?.evidenceId);
  const sourcePageText = selectedEvidence?.ocrPages?.find(p => p.page === selectedField?.sourcePage)?.text;

  const walletLedger = selectedField?.type === "wallet_address" ? {
    chain: detectChain(selectedField.value) || selectedField.attributes?.chain || "Unknown",
    created_event: "首次鏈上轉入",
    last_transaction: "2026-03-05 14:20",
    transfer_in_count: 12,
    transfer_in_amount: `128.45 ${ledgerCoin}`,
    transfer_out_count: 9,
    transfer_out_amount: `95.10 ${ledgerCoin}`,
  } : null;

  const saveFieldValue = () => {
    if (!selectedField) return;
    setCaseData(p => ({ ...p, fields: p.fields.map(f => f.id === selectedField.id ? { ...f, value: editValue } : f) }));
    setSelectedField(prev => ({ ...prev, value: editValue }));
  };

  const downloadLedger = () => {
    if (!walletLedger || !selectedField) return;
    const content = [
      `Wallet: ${selectedField.value}`,
      `Coin: ${ledgerCoin}`,
      `Time Range: ${ledgerRange}`,
      ...Object.entries(walletLedger).map(([k,v]) => `${k}: ${v}`),
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedField.value.slice(0,10)}_${ledgerCoin}_${ledgerRange}_ledger.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 980, animation: "fadeIn .3s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: C.textBright }}>🔍 情資擷取結果</h3>
        <span style={{ fontSize: 12, color: C.textDim }}>共 {fields.length} 個欄位</span>
      </div>

      <div style={{ background: C.bg1, borderRadius: 10, padding: 16, border: `1px solid ${C.border}`, marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 11, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>欄位類型</div>
          <select value={manualType} onChange={e => setManualType(e.target.value)} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 12px", color: C.textBright, fontSize: 12, outline: "none" }}>
            {Object.entries(FIELD_LABELS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: C.textLight, fontWeight: 600, marginBottom: 4 }}>值</div>
          <input value={manualValue} onChange={e => setManualValue(e.target.value)} placeholder="手動輸入欄位值..."
            onKeyDown={e => { if (e.key === "Enter" && manualValue.trim()) { addManualField(manualType, manualValue.trim()); setManualValue(""); } }}
            style={{ width: "100%", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 12px", color: C.textBright, fontSize: 12, fontFamily: MONO, outline: "none" }} />
        </div>
        <button onClick={() => { if (manualValue.trim()) { addManualField(manualType, manualValue.trim()); setManualValue(""); } }}
          style={{ background: C.accent, border: "none", borderRadius: 6, padding: "8px 16px", color: "#fff", fontWeight: 600, fontSize: 12 }}>+ 加入</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(120px,1fr))", gap: 10, marginBottom: 16 }}>
        <button onClick={() => setSelectedType("all")} style={{ border: `1px solid ${C.border}`, background: selectedType === "all" ? C.bg3 : C.bg1, borderRadius: 8, padding: 10 }}>全部 ({fields.length})</button>
        {categories.map(([type, items]) => (
          <button key={type} onClick={() => setSelectedType(type)} style={{ border: `1px solid ${C.border}`, background: selectedType === type ? `${FIELD_LABELS[type]?.color}22` : C.bg1, borderRadius: 8, padding: 10 }}>
            {FIELD_LABELS[type]?.icon} {FIELD_LABELS[type]?.label || type} ({items.length})
          </button>
        ))}
      </div>

      {graphImage && (
        <div style={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: C.textLight }}>NetworkX 關係圖</div>
          <img src={graphImage} alt="network-graph" style={{ width: "100%", maxHeight: 360, objectFit: "contain" }} />
        </div>
      )}

      {showing.map(f => <div key={f.id} onClick={() => { setSelectedField(f); setEditValue(f.value); }}><FieldCard field={f} /></div>)}

      {fields.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: C.textDim }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 14 }}>尚未擷取任何情資</div>
        </div>
      )}

      {selectedField && (
        <div style={{ position: "fixed", inset: 0, background: "#00000066", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 50 }} onClick={() => setSelectedField(null)}>
          <div style={{ width: "min(900px, 95vw)", maxHeight: "90vh", overflow: "auto", background: C.bg2, borderRadius: 12, padding: 18 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
              <h4 style={{ margin: 0, color: C.textBright }}>情資詳情：{FIELD_LABELS[selectedField.type]?.label || selectedField.type}</h4>
              <div style={{ flex: 1 }} />
              <button onClick={() => setSelectedField(null)}>關閉</button>
            </div>
            <input value={editValue} onChange={e => setEditValue(e.target.value)} style={{ width: "100%", padding: 8, marginBottom: 8 }} />
            <button onClick={saveFieldValue} style={{ marginBottom: 12 }}>儲存修正</button>
            <div style={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>來源頁面：第 {selectedField.sourcePage || 1} 頁（證據 {selectedField.evidenceNumber}）</div>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{sourcePageText || selectedEvidence?.ocrText || "無頁面內容"}</pre>
            </div>

            {walletLedger && (
              <div style={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>鏈上帳本基本資料</div>
                {Object.entries(walletLedger).map(([k, v]) => <div key={k}>{k}: {v}</div>)}
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <select value={ledgerCoin} onChange={e => setLedgerCoin(e.target.value)}><option>USDT</option><option>ETH</option><option>BTC</option></select>
                  <select value={ledgerRange} onChange={e => setLedgerRange(e.target.value)}><option value="7d">7天</option><option value="30d">30天</option><option value="90d">90天</option></select>
                  <button onClick={downloadLedger}>下載帳本附件</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Confirm Tab ── */
function ConfirmTab({ caseData, setCaseData }) {
  const fields = caseData.fields || [];
  const pending = fields.filter(f => !f.confirmed);
  const confirmed = fields.filter(f => f.confirmed);

  const confirmField = (fieldId, value) => {
    setCaseData(p => ({
      ...p,
      fields: p.fields.map(f => f.id === fieldId ? { ...f, confirmed: true, confirmedValue: value || f.value, confirmedAt: now(), confirmedBy: "王大明" } : f),
      auditLog: [...(p.auditLog || []), { action: "field_confirm", user: "王大明", time: now(), detail: `確認欄位 ${fieldId.slice(0, 6)}` }],
    }));
  };

  const rejectField = (fieldId) => {
    setCaseData(p => ({
      ...p,
      fields: p.fields.map(f => f.id === fieldId ? { ...f, confirmed: false, rejected: true } : f),
      auditLog: [...(p.auditLog || []), { action: "field_reject", user: "王大明", time: now(), detail: `駁回欄位 ${fieldId.slice(0, 6)}` }],
    }));
  };

  const confirmAll = () => {
    const validPending = pending.filter(f => f.validation?.status !== "invalid" && !f.rejected);
    validPending.forEach(f => confirmField(f.id));
  };

  return (
    <div style={{ maxWidth: 900, animation: "fadeIn .3s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: C.textBright }}>✅ 人工校對確認</h3>
        <div style={{ flex: 1 }} />
        {pending.length > 0 && (
          <button onClick={confirmAll} style={{
            background: C.success, border: "none", borderRadius: 6, padding: "8px 18px",
            color: "#fff", fontWeight: 600, fontSize: 12,
          }}>✓ 全部確認（排除驗證失敗）</button>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <StatCard label="待確認" value={pending.filter(f => !f.rejected).length} color={C.warning} />
        <StatCard label="已確認" value={confirmed.length} color={C.success} />
        <StatCard label="已駁回" value={fields.filter(f => f.rejected).length} color={C.danger} />
        <StatCard label="驗證失敗" value={fields.filter(f => f.validation?.status === "invalid").length} color={C.danger} />
      </div>

      {pending.filter(f => !f.rejected).length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.warning, marginBottom: 10 }}>⏳ 待確認</div>
          {pending.filter(f => !f.rejected).map(f => (
            <ConfirmFieldCard key={f.id} field={f} onConfirm={confirmField} onReject={rejectField} />
          ))}
        </div>
      )}

      {confirmed.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.success, marginBottom: 10 }}>✓ 已確認</div>
          {confirmed.map(f => <FieldCard key={f.id} field={f} compact showConfirm />)}
        </div>
      )}
    </div>
  );
}

/* ── Export Tab ── */
function ExportTab({ caseData, setCaseData }) {
  const confirmed = (caseData.fields || []).filter(f => f.confirmed);

  const generateSummary = () => {
    const lines = [
      `受理報案摘要`,
      `═══════════════════════════`,
      `案件編號：${caseData.case_number}`,
      `案件類型：${caseData.case_type === "fraud" ? "詐欺" : caseData.case_type}`,
      `報案人：${caseData.reporter_name || "—"}`,
      `受理單位：${caseData.unit}`,
      `受理時間：${caseData.created_at}`,
      ``,
      `▎ 情資清單 (已確認 ${confirmed.length} 項)`,
      `───────────────────────────`,
    ];
    const grouped = {};
    confirmed.forEach(f => { (grouped[f.type] = grouped[f.type] || []).push(f); });
    Object.entries(grouped).forEach(([type, items]) => {
      const info = FIELD_LABELS[type] || { label: type, icon: "📋" };
      lines.push(`\n${info.icon} ${info.label}：`);
      items.forEach((f, i) => {
        lines.push(`  ${i + 1}. ${f.confirmedValue || f.value}`);
        if (f.context) lines.push(`     脈絡：${f.context}`);
        if (f.validation?.detail) lines.push(`     驗證：${f.validation.detail}`);
      });
    });
    lines.push(`\n═══════════════════════════`);
    lines.push(`證據附件：${caseData.evidence?.length || 0} 件`);
    lines.push(`匯出時間：${now()}`);
    lines.push(`匯出人：王大明`);
    return lines.join("\n");
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generateSummary());
    setCaseData(p => ({
      ...p, status: "exported",
      auditLog: [...(p.auditLog || []), { action: "export_generate", user: "王大明", time: now(), detail: "匯出受理摘要（剪貼簿）" }],
    }));
  };

  const downloadCSV = () => {
    const BOM = "\uFEFF";
    const headers = ["欄位類型", "值", "信心分數", "驗證狀態", "來源證據", "脈絡", "確認人", "確認時間"];
    const rows = confirmed.map(f => [
      FIELD_LABELS[f.type]?.label || f.type, f.confirmedValue || f.value,
      f.confidence, f.validation?.status || "", f.evidenceNumber || "",
      f.context || "", f.confirmedBy || "", f.confirmedAt || "",
    ]);
    const csv = BOM + [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `${caseData.case_number}_情資清單.csv`; a.click();
    URL.revokeObjectURL(url);
    setCaseData(p => ({
      ...p, auditLog: [...(p.auditLog || []), { action: "export_generate", user: "王大明", time: now(), detail: "下載情資清單 CSV" }],
    }));
  };

  return (
    <div style={{ maxWidth: 900, animation: "fadeIn .3s ease" }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: C.textBright, marginBottom: 20 }}>📄 匯出與送交</h3>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 24 }}>
        <ExportOptionCard icon="📋" title="一鍵複製摘要" desc="複製格式化的受理摘要到剪貼簿，可直接貼入筆錄系統" onClick={copyToClipboard} color={C.accent} />
        <ExportOptionCard icon="📊" title="下載情資 CSV" desc="匯出已確認的所有欄位為 CSV，含驗證狀態與來源追溯" onClick={downloadCSV} color={C.success} />
        <ExportOptionCard icon="📦" title="完整打包送交" desc="打包原始證據 + OCR + 擷取結果 + 校對紀錄（開發中）" onClick={() => {}} color={C.textDim} disabled />
      </div>

      <div style={{ background: C.bg1, borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 700, color: C.textLight }}>受理摘要預覽</div>
        <pre style={{ padding: 16, fontFamily: MONO, fontSize: 12, color: C.text, lineHeight: 1.8, whiteSpace: "pre-wrap", margin: 0, maxHeight: 400, overflow: "auto" }}>
          {generateSummary()}
        </pre>
      </div>
    </div>
  );
}

/* ── Audit Tab ── */
function AuditTab({ caseData }) {
  const logs = [...(caseData.auditLog || [])].reverse();
  const actionIcons = {
    case_create: "📋", evidence_upload: "📤", ocr_start: "🔄", ocr_complete: "✅",
    ocr_fail: "❌", field_confirm: "✓", field_reject: "✗", field_manual: "✍️",
    export_generate: "📄", supervisor_review: "👁",
  };

  return (
    <div style={{ maxWidth: 900, animation: "fadeIn .3s ease" }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: C.textBright, marginBottom: 20 }}>📝 稽核日誌</h3>
      <div style={{ background: C.bg1, borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        {logs.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: C.textDim }}>暫無紀錄</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} style={{
              padding: "12px 16px", borderBottom: `1px solid ${C.border}08`,
              display: "flex", alignItems: "center", gap: 12, fontSize: 12,
            }}>
              <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>{actionIcons[log.action] || "📌"}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, minWidth: 150 }}>{log.time}</span>
              <span style={{ color: C.accent, fontWeight: 600, minWidth: 80 }}>{log.user}</span>
              <span style={{ color: C.text, flex: 1 }}>{log.detail}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}


function InterviewTab({ caseData }) {
  const confirmed = (caseData.fields || []).filter(f => f.confirmed);
  const qas = confirmed.slice(0, 20).map((f, i) => ({
    q: `請說明「${FIELD_LABELS[f.type]?.label || f.type}」${f.confirmedValue || f.value} 的來源與關聯？`,
    a: `來源證據 ${f.evidenceNumber || "手動"}，建議追問時間、交易對象與資金流向。`
  }));

  const downloadWord = () => {
    const content = [
      `筆錄問答草稿 - ${caseData.case_number}`,
      ...qas.map((x, i) => `Q${i+1}: ${x.q}\nA${i+1}: ${x.a}\n`)
    ].join("\n");
    const blob = new Blob([content], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${caseData.case_number}_筆錄問答.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: C.textBright }}>🗣️ 筆錄問答</h3>
        <div style={{ flex: 1 }} />
        <button onClick={downloadWord} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px" }}>下載 Word</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {qas.map((qa, idx) => (
          <div key={idx} style={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
            <div style={{ fontWeight: 700, color: C.textBright }}>Q{idx + 1}. {qa.q}</div>
            <div style={{ color: C.textLight, marginTop: 6 }}>A{idx + 1}. {qa.a}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Shared Components ── */
function FieldCard({ field, compact, showConfirm }) {
  const info = FIELD_LABELS[field.type] || FIELD_LABELS.other;
  const val = VALIDATION_LABELS[field.validation?.status] || VALIDATION_LABELS.unchecked;
  return (
    <div style={{
      background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 8,
      padding: compact ? "8px 12px" : "12px 16px", marginBottom: 6,
      borderLeft: `3px solid ${info.color}`, animation: "fadeIn .2s ease",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ background: `${info.color}18`, color: info.color, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
          {info.icon} {info.label}
        </span>
        {field.attributes?.chain && (
          <span style={{ background: `${CHAIN_INFO[field.attributes.chain]?.color || C.textDim}22`, color: CHAIN_INFO[field.attributes.chain]?.color || C.textDim, padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
            {field.attributes.chain}
          </span>
        )}
        <span style={{ background: val.bg, color: val.color, padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
          {val.label}
        </span>
        <span style={{ fontSize: 10, color: C.textDim }}>信心 {Math.round((field.confidence || 0) * 100)}%</span>
        {field.evidenceNumber && <span style={{ fontSize: 10, color: C.textDim }}>來源: {field.evidenceNumber}</span>}
        {showConfirm && field.confirmed && <span style={{ fontSize: 10, color: C.success }}>✓ {field.confirmedBy} {field.confirmedAt}</span>}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textBright, marginTop: 6, wordBreak: "break-all", lineHeight: 1.6 }}>
        {field.confirmedValue || field.value}
      </div>
      {field.validation?.detail && !compact && (
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>
          驗證：{field.validation.detail}
        </div>
      )}
      {field.context && !compact && (
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>脈絡：{field.context}</div>
      )}
    </div>
  );
}

function ConfirmFieldCard({ field, onConfirm, onReject }) {
  const [editValue, setEditValue] = useState(field.value);
  const [editing, setEditing] = useState(false);
  const info = FIELD_LABELS[field.type] || FIELD_LABELS.other;
  const val = VALIDATION_LABELS[field.validation?.status] || VALIDATION_LABELS.unchecked;

  return (
    <div style={{
      background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: 16, marginBottom: 8, borderLeft: `3px solid ${info.color}`,
      animation: "fadeIn .2s ease",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ background: `${info.color}18`, color: info.color, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{info.icon} {info.label}</span>
        {field.attributes?.chain && <span style={{ background: `${CHAIN_INFO[field.attributes.chain]?.color || "#666"}22`, color: CHAIN_INFO[field.attributes.chain]?.color, padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{field.attributes.chain}</span>}
        <span style={{ background: val.bg, color: val.color, padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>{val.label}</span>
        <ConfidenceBar value={field.confidence} />
        {field.evidenceNumber && <span style={{ fontSize: 10, color: C.textDim }}>📎 {field.evidenceNumber}</span>}
      </div>

      {editing ? (
        <input value={editValue} onChange={e => setEditValue(e.target.value)} autoFocus
          style={{ width: "100%", background: C.bg2, border: `1px solid ${C.accent}`, borderRadius: 6, padding: "8px 12px", color: C.textBright, fontFamily: MONO, fontSize: 12, outline: "none", marginBottom: 8 }} />
      ) : (
        <div style={{ fontFamily: MONO, fontSize: 13, color: C.textBright, wordBreak: "break-all", lineHeight: 1.6, marginBottom: 8, padding: "6px 10px", background: C.bg2, borderRadius: 6 }}>
          {field.value}
        </div>
      )}

      {field.validation?.detail && <div style={{ fontSize: 11, color: val.color, marginBottom: 6 }}>⚙ {field.validation.detail}</div>}
      {field.context && <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8 }}>💬 {field.context}</div>}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => { onConfirm(field.id, editing ? editValue : undefined); }} style={{
          background: C.success, border: "none", borderRadius: 6, padding: "6px 16px",
          color: "#fff", fontWeight: 600, fontSize: 12,
        }}>✓ 確認</button>
        <button onClick={() => setEditing(!editing)} style={{
          background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6,
          padding: "6px 12px", color: C.textLight, fontSize: 12,
        }}>{editing ? "取消編輯" : "✏ 修改"}</button>
        <button onClick={() => onReject(field.id)} style={{
          background: "transparent", border: `1px solid ${C.danger}44`, borderRadius: 6,
          padding: "6px 12px", color: C.danger, fontSize: 12,
        }}>✗ 駁回</button>
        <button onClick={() => navigator.clipboard.writeText(field.value)} style={{
          background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6,
          padding: "6px 12px", color: C.textLight, fontSize: 12, marginLeft: "auto",
        }}>📋 複製</button>
      </div>
    </div>
  );
}

function ConfidenceBar({ value }) {
  const pct = Math.round((value || 0) * 100);
  const color = pct >= 90 ? C.success : pct >= 70 ? C.warning : C.danger;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 50, height: 4, background: C.bg3, borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2, transition: "width .3s" }} />
      </div>
      <span style={{ fontSize: 10, color, fontWeight: 600 }}>{pct}%</span>
    </div>
  );
}

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || { label: status, color: C.textDim };
  return <span style={{ background: `${s.color}18`, color: s.color, padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{s.label}</span>;
}

function TypeBadge({ type }) {
  const labels = { fraud: "詐欺", money_laundering: "洗錢", theft: "竊盜", cybercrime: "網路犯罪", other: "其他" };
  return <span style={{ background: `${C.textDim}18`, color: C.textDim, padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>{labels[type] || type}</span>;
}

function EvidenceStatusBadge({ status }) {
  const map = {
    uploaded: { label: "待辨識", color: C.textDim },
    preprocessing: { label: "預處理", color: C.accent },
    ocr_processing: { label: "辨識中", color: C.accent },
    extracted: { label: "已擷取", color: C.success },
    confirmed: { label: "已確認", color: C.success },
    failed: { label: "失敗", color: C.danger },
  };
  const s = map[status] || { label: status, color: C.textDim };
  return <span style={{ background: `${s.color}18`, color: s.color, padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>{s.label}</span>;
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 16px", flex: 1 }}>
      <div style={{ fontSize: 11, color: C.textDim, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color, fontFamily: MONO }}>{value}</div>
    </div>
  );
}

function ExportOptionCard({ icon, title, desc, onClick, color, disabled }) {
  return (
    <div onClick={disabled ? undefined : onClick} style={{
      background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: 20, cursor: disabled ? "default" : "pointer", transition: "all .15s",
      opacity: disabled ? 0.4 : 1,
    }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: disabled ? C.textDim : color, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}

function Spinner() {
  return <span style={{ display: "inline-block", width: 14, height: 14, border: `2px solid ${C.accent}33`, borderTop: `2px solid ${C.accent}`, borderRadius: "50%", animation: "spin .8s linear infinite" }} />;
}
