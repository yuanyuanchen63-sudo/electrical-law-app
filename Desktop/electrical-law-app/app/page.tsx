"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const QUICK_QUESTIONS = [
  "單相 220V 迴路的導線截面積最小需幾 mm²？",
  "緊急出口指示燈的安裝高度規定？",
  "變壓器室的防火區劃要求？",
  "屋內配線的接地規定為何？",
  "分路保護器的額定電流如何選定？",
  "特低壓電路的電壓範圍規定？",
];

type Message = { role: "user" | "assistant"; content: string };
type Doc = { name: string; text: string; date: string; size: string };

async function extractPdfText(file: File, maxChars = 15000): Promise<string> {
  const script = await new Promise<void>((res, rej) => {
    if ((window as any).pdfjsLib) return res();
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => res();
    s.onerror = () => rej(new Error("PDF.js 載入失敗"));
    document.head.appendChild(s);
  });
  void script;
  (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const buffer = await file.arrayBuffer();
  const pdf = await (window as any).pdfjsLib.getDocument({ data: buffer }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages && text.length < maxChars; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item: any) => item.str).join(" ") + "\n";
  }
  return text.slice(0, maxChars);
}

function formatMessage(text: string) {
  return text.split("\n").map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*|【[^】]+】|「依上傳文件」)/g);
    return (
      <p key={i} style={{ margin: line === "" ? "0 0 8px" : "0 0 2px" }}>
        {parts.map((part, j) => {
          if (part.startsWith("**") && part.endsWith("**"))
            return <strong key={j} style={{ color: "#F5C518" }}>{part.slice(2, -2)}</strong>;
          if (part.startsWith("【") && part.endsWith("】"))
            return (
              <span key={j} style={{
                background: "#1a2f4a", color: "#7DD3FC", padding: "1px 6px",
                borderRadius: "3px", fontFamily: "monospace", fontSize: "0.85em",
                border: "1px solid #2a4a6a",
              }}>{part}</span>
            );
          if (part === "「依上傳文件」")
            return (
              <span key={j} style={{
                background: "#1a3a1a", color: "#4ade80", padding: "1px 6px",
                borderRadius: "3px", fontSize: "0.8em", border: "1px solid #2a5a2a",
              }}>{part}</span>
            );
          return part;
        })}
      </p>
    );
  });
}

export default function Page() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false); // 預設收起（手機友好）
  const [tab, setTab] = useState<"docs" | "quick" | "vdrop">("docs");

  // 電壓降計算狀態
  const [vPhase, setVPhase] = useState<"1p2w" | "1p3w" | "3p4w" | "3p3w">("1p3w");
  const [vVolt, setVVolt] = useState(220);
  const [vCurrent, setVCurrent] = useState(9.45);
  const [vLength, setVLength] = useState(30);
  const [vPF, setVPF] = useState(0.9);
  const [vWire, setVWire] = useState("PVC");
  const [vMM, setVMM] = useState(2);
  const [vLimit, setVLimit] = useState(5);
  const [vR, setVR] = useState(5.657);
  const [vX, setVX] = useState(0.119);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 桌機自動展開 sidebar
  useEffect(() => {
    if (window.innerWidth >= 768) setSidebarOpen(true);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setExtracting(true);
    setExtractError("");
    for (const file of files) {
      try {
        const text = await extractPdfText(file);
        const date = new Date().toLocaleDateString("zh-TW");
        setDocs(prev => [
          ...prev.filter(d => d.name !== file.name),
          { name: file.name, text, date, size: (file.size / 1024).toFixed(0) },
        ]);
      } catch {
        setExtractError(`無法解析 ${file.name}，請使用文字版 PDF。`);
      }
    }
    setExtracting(false);
    e.target.value = "";
  };

  const sendMessage = useCallback(async (text?: string) => {
    const userText = text || input.trim();
    if (!userText || loading) return;
    setInput("");
    // 手機上送出後自動收起 sidebar
    if (window.innerWidth < 768) setSidebarOpen(false);

    const userMsg: Message = { role: "user", content: userText };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setLoading(true);

    try {
      const docContext = docs.length
        ? docs.map(d => `=== ${d.name}（${d.date}）===\n${d.text}`).join("\n\n")
        : null;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updated.map(m => ({ role: m.role, content: m.content })),
          docContext,
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessages([...updated, { role: "assistant", content: data.text }]);
    } catch {
      setMessages([...updated, { role: "assistant", content: "⚠️ 連線錯誤，請稍後再試。" }]);
    }
    setLoading(false);
  }, [input, loading, messages, docs]);

  // 導線阻抗資料庫（依據計算書 PVC/FR/XLPE）
  const wireDB: Record<string, Record<number, {R: number; X: number}>> = {
    PVC: {2:{R:5.657,X:0.119},3.5:{R:4.285,X:0.116},5.5:{R:3.24,X:0.115},8:{R:2.25,X:0.104},14:{R:1.26,X:0.0973},22:{R:0.809,X:0.0951},30:{R:0.606,X:0.094},38:{R:0.474,X:0.0914},50:{R:0.364,X:0.0897},60:{R:0.302,X:0.0887},80:{R:0.228,X:0.0877},100:{R:0.183,X:0.0868},150:{R:0.122,X:0.0856},200:{R:0.0916,X:0.0846},250:{R:0.0733,X:0.0838}},
    FR:  {2:{R:5.657,X:0.119},3.5:{R:4.285,X:0.116},5.5:{R:3.24,X:0.115},8:{R:2.25,X:0.104},14:{R:1.26,X:0.0973},22:{R:0.809,X:0.0951},30:{R:0.606,X:0.094},38:{R:0.474,X:0.0914},50:{R:0.364,X:0.0897},60:{R:0.302,X:0.0887},80:{R:0.228,X:0.0877},100:{R:0.183,X:0.0868},150:{R:0.122,X:0.0856},200:{R:0.0916,X:0.0846},250:{R:0.0733,X:0.0838}},
    XLPE:{2:{R:5.657,X:0.119},3.5:{R:4.285,X:0.116},5.5:{R:3.24,X:0.115},8:{R:2.25,X:0.104},14:{R:1.26,X:0.0973},22:{R:0.809,X:0.0951},30:{R:0.606,X:0.094},38:{R:0.474,X:0.0914},50:{R:0.364,X:0.0897},60:{R:0.302,X:0.0887},80:{R:0.228,X:0.0877},100:{R:0.183,X:0.0868},150:{R:0.122,X:0.0856},200:{R:0.0916,X:0.0846},250:{R:0.03505,X:0.04375}},
  };

  const wireMMList = [2,3.5,5.5,8,14,22,30,38,50,60,80,100,150,200,250];

  const getWireRX = (wire: string, mm: number) => {
    if(wire === "custom") return {R: vR, X: vX};
    return wireDB[wire]?.[mm] || {R: vR, X: vX};
  };

  const calcVD = () => {
    const {R, X} = getWireRX(vWire, vMM);
    const sinPF = Math.sqrt(1 - vPF * vPF);
    const Z = R * vPF + X * sinPF;
    let VD = 0;
    if(vPhase === "1p2w") VD = 2 * vLength/1000 * vCurrent * Z;
    else if(vPhase === "1p3w" || vPhase === "3p4w") VD = vLength/1000 * vCurrent * Z;
    else VD = Math.sqrt(3) * vLength/1000 * vCurrent * Z;
    const pct = VD / vVolt * 100;
    return { Z, VD, pct, vEnd: vVolt - VD, R, X, sinPF };
  };

  const vResult = calcVD();

  const updateWire = (wire: string, mm: number) => {
    setVWire(wire);
    setVMM(mm);
    if(wire !== "custom") {
      const d = wireDB[wire]?.[mm];
      if(d) { setVR(d.R); setVX(d.X); }
    }
  };

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <div style={{
      display: "flex", height: "100dvh", background: "#0D1B2A",
      fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#E2E8F0", overflow: "hidden",
      position: "relative",
    }}>

      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            display: isMobile ? "block" : "none",
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10,
          }}
        />
      )}

      {/* Sidebar */}
      <div style={{
        position: isMobile ? "fixed" : "relative",
        left: 0, top: 0, bottom: 0, zIndex: 20,
        width: "260px",
        transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.3s",
        background: "#0A1520", borderRight: "1px solid #1E3A5F",
        display: "flex", flexDirection: "column",
      }}>
        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #1E3A5F", flexShrink: 0 }}>
          {(["docs", "quick", "vdrop"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: "10px 0", background: tab === t ? "#0D1B2A" : "transparent",
              border: "none", borderBottom: tab === t ? "2px solid #F5C518" : "2px solid transparent",
              color: tab === t ? "#F5C518" : "#475569", cursor: "pointer",
              fontSize: "10px", fontWeight: tab === t ? 700 : 400, letterSpacing: "0.5px",
            }}>
              {t === "docs" ? "📁 法規文件" : t === "quick" ? "⚡ 常見問題" : "🔌 電壓降"}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px" }}>

          {tab === "docs" && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={extracting}
                style={{
                  width: "100%", padding: "12px", marginBottom: "12px",
                  background: "#1a3a1a", border: "1px dashed #2a6a2a",
                  borderRadius: "8px", color: extracting ? "#475569" : "#4ade80",
                  cursor: extracting ? "default" : "pointer", fontSize: "13px",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                }}
              >
                {extracting ? "⏳ 解析中..." : "＋ 上傳法規 PDF"}
              </button>
              <input ref={fileInputRef} type="file" accept=".pdf" multiple onChange={handleUpload} style={{ display: "none" }} />

              {extractError && (
                <div style={{ fontSize: "11px", color: "#f87171", background: "#2a1a1a", border: "1px solid #5a2a2a", borderRadius: "5px", padding: "8px", marginBottom: "10px" }}>
                  {extractError}
                </div>
              )}

              {docs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 8px", color: "#334155", fontSize: "11px", lineHeight: "1.8" }}>
                  尚未上傳任何法規<br />
                  <span style={{ color: "#1E3A5F" }}>上傳後 AI 將依據<br />你的文件版本回答</span>
                </div>
              ) : (
                docs.map(doc => (
                  <div key={doc.name} style={{
                    background: "#111f2e", border: "1px solid #1E3A5F",
                    borderRadius: "7px", padding: "10px", marginBottom: "8px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ fontSize: "11px", color: "#7DD3FC", fontWeight: 600, lineHeight: "1.4", flex: 1 }}>
                        📄 {doc.name.replace(".pdf", "")}
                      </div>
                      <button onClick={() => setDocs(d => d.filter(x => x.name !== doc.name))}
                        style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: "14px", padding: "0 2px" }}>✕</button>
                    </div>
                    <div style={{ marginTop: "6px", display: "flex", gap: "8px", fontSize: "10px", color: "#475569" }}>
                      <span>📅 {doc.date}</span>
                      <span>📦 {doc.size} KB</span>
                      <span style={{ color: "#4ade80" }}>✓ 已載入</span>
                    </div>
                  </div>
                ))
              )}

              <div style={{ marginTop: "12px", padding: "10px", background: "#0D1B2A", border: "1px solid #1E3A5F", borderRadius: "6px", fontSize: "10px", color: "#475569", lineHeight: "1.8" }}>
                💡 <strong style={{ color: "#64748B" }}>取得官方 PDF：</strong><br />
                前往 <span style={{ color: "#7DD3FC" }}>law.moj.gov.tw</span><br />
                搜尋法規 → 下載 PDF<br />
                法規修正後重新上傳即可
              </div>
            </>
          )}

          {tab === "quick" && (
            <>
              <div style={{ fontSize: "10px", letterSpacing: "2px", color: "#F5C518", fontWeight: 700, marginBottom: "12px" }}>
                ◈ 常見查詢
              </div>
              {QUICK_QUESTIONS.map((q, i) => (
                <button key={i} onClick={() => sendMessage(q)} style={{
                  display: "block", width: "100%", padding: "10px", marginBottom: "6px",
                  background: "transparent", border: "1px solid #1E3A5F", borderRadius: "6px",
                  color: "#64748B", cursor: "pointer", fontSize: "12px", textAlign: "left", lineHeight: "1.5",
                }}>{q}</button>
              ))}
            </>
          )}

          {tab === "vdrop" && (
            <div style={{ fontSize: "12px", color: "#CBD5E1" }}>
              {/* 說明標題 */}
              <div style={{ fontSize: "10px", letterSpacing: "2px", color: "#F5C518", fontWeight: 700, marginBottom: "12px" }}>
                ◈ 電壓降計算
              </div>

              {/* 供電方式 */}
              <div style={{ marginBottom: "10px" }}>
                <div style={{ fontSize: "10px", color: "#475569", marginBottom: "4px" }}>供電方式</div>
                <select value={vPhase} onChange={e => {
                  const v = e.target.value as typeof vPhase;
                  setVPhase(v);
                  setVVolt(v === "3p4w" || v === "3p3w" ? 380 : 220);
                }} style={{ width: "100%", background: "#111f2e", border: "1px solid #1E3A5F", borderRadius: "5px", color: "#CBD5E1", padding: "6px 8px", fontSize: "11px" }}>
                  <option value="1p2w">1φ2W — 110V 單相二線</option>
                  <option value="1p3w">1φ3W — 220/110V 單相三線</option>
                  <option value="3p4w">3φ4W — 380/220V 三相四線</option>
                  <option value="3p3w">3φ3W — 380V 三相三線</option>
                </select>
              </div>

              {/* 計算電壓 */}
              <div style={{ marginBottom: "10px" }}>
                <div style={{ fontSize: "10px", color: "#475569", marginBottom: "4px" }}>計算電壓 V</div>
                <select value={vVolt} onChange={e => setVVolt(Number(e.target.value))} style={{ width: "100%", background: "#111f2e", border: "1px solid #1E3A5F", borderRadius: "5px", color: "#CBD5E1", padding: "6px 8px", fontSize: "11px" }}>
                  <option value={110}>110 V</option>
                  <option value={220}>220 V</option>
                  <option value={380}>380 V</option>
                </select>
              </div>

              {/* 電流 / 距離 / PF */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
                {[
                  { label: "電流 I (A)", val: vCurrent, set: setVCurrent, step: "0.01" },
                  { label: "距離 L (m)", val: vLength, set: setVLength, step: "1" },
                  { label: "功率因數 cosθ", val: vPF, set: setVPF, step: "0.001" },
                ].map(({ label, val, set, step }) => (
                  <div key={label} style={{ gridColumn: label === "功率因數 cosθ" ? "1 / -1" : undefined }}>
                    <div style={{ fontSize: "10px", color: "#475569", marginBottom: "4px" }}>{label}</div>
                    <input type="number" value={val} step={step}
                      onChange={e => set(Number(e.target.value))}
                      style={{ width: "100%", background: "#111f2e", border: "1px solid #1E3A5F", borderRadius: "5px", color: "#CBD5E1", padding: "6px 8px", fontSize: "11px" }} />
                  </div>
                ))}
              </div>

              {/* 導線種類 / 線徑 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
                <div>
                  <div style={{ fontSize: "10px", color: "#475569", marginBottom: "4px" }}>導線種類</div>
                  <select value={vWire} onChange={e => updateWire(e.target.value, vMM)} style={{ width: "100%", background: "#111f2e", border: "1px solid #1E3A5F", borderRadius: "5px", color: "#CBD5E1", padding: "6px 8px", fontSize: "11px" }}>
                    <option value="PVC">PVC 600V</option>
                    <option value="FR">FR-LSOH</option>
                    <option value="XLPE">XLPE</option>
                    <option value="custom">自訂阻抗</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: "#475569", marginBottom: "4px" }}>線徑 mm²</div>
                  <select value={vMM} onChange={e => updateWire(vWire, Number(e.target.value))} style={{ width: "100%", background: "#111f2e", border: "1px solid #1E3A5F", borderRadius: "5px", color: "#CBD5E1", padding: "6px 8px", fontSize: "11px" }}>
                    {wireMMList.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              {/* R / X 阻抗 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
                {[
                  { label: "R (Ω/km)", val: vR, set: setVR },
                  { label: "X (Ω/km)", val: vX, set: setVX },
                ].map(({ label, val, set }) => (
                  <div key={label}>
                    <div style={{ fontSize: "10px", color: "#475569", marginBottom: "4px" }}>{label}</div>
                    <input type="number" value={val} step="0.0001" readOnly={vWire !== "custom"}
                      onChange={e => set(Number(e.target.value))}
                      style={{ width: "100%", background: vWire !== "custom" ? "#0a1420" : "#111f2e", border: "1px solid #1E3A5F", borderRadius: "5px", color: vWire !== "custom" ? "#475569" : "#CBD5E1", padding: "6px 8px", fontSize: "11px" }} />
                  </div>
                ))}
              </div>

              {/* 許可壓降 */}
              <div style={{ marginBottom: "14px" }}>
                <div style={{ fontSize: "10px", color: "#475569", marginBottom: "4px" }}>許可壓降標準</div>
                <select value={vLimit} onChange={e => setVLimit(Number(e.target.value))} style={{ width: "100%", background: "#111f2e", border: "1px solid #1E3A5F", borderRadius: "5px", color: "#CBD5E1", padding: "6px 8px", fontSize: "11px" }}>
                  <option value={3}>3%（照明迴路）</option>
                  <option value={5}>5%（一般動力）</option>
                  <option value={10}>10%（電動機起動）</option>
                </select>
              </div>

              {/* 計算結果 */}
              <div style={{ background: "#0D1B2A", border: "1px solid #1E3A5F", borderRadius: "8px", padding: "12px", marginBottom: "12px" }}>
                <div style={{ fontSize: "10px", color: "#F5C518", fontWeight: 700, marginBottom: "10px", letterSpacing: "1px" }}>計算結果</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
                  {[
                    { label: "電壓降 VD", val: `${vResult.VD.toFixed(4)} V` },
                    { label: "壓降百分率", val: `${vResult.pct.toFixed(4)} %` },
                    { label: "末端電壓", val: `${vResult.vEnd.toFixed(2)} V` },
                    { label: "總阻抗 Z", val: `${vResult.Z.toFixed(6)}` },
                  ].map(({ label, val }) => (
                    <div key={label} style={{ background: "#111f2e", borderRadius: "5px", padding: "8px" }}>
                      <div style={{ fontSize: "9px", color: "#475569", marginBottom: "2px" }}>{label}</div>
                      <div style={{ fontSize: "12px", color: "#7DD3FC", fontWeight: 700 }}>{val}</div>
                    </div>
                  ))}
                </div>

                {/* 狀態指示 */}
                <div style={{
                  padding: "7px 10px", borderRadius: "5px", fontSize: "11px", fontWeight: 700, textAlign: "center",
                  background: vResult.pct <= vLimit * 0.6 ? "#1a3a1a" : vResult.pct <= vLimit ? "#2a2a0a" : "#3a1a1a",
                  color: vResult.pct <= vLimit * 0.6 ? "#4ade80" : vResult.pct <= vLimit ? "#fbbf24" : "#f87171",
                  border: `1px solid ${vResult.pct <= vLimit * 0.6 ? "#2a6a2a" : vResult.pct <= vLimit ? "#5a5a0a" : "#6a2a2a"}`,
                }}>
                  {vResult.pct <= vLimit * 0.6 ? "✓ 符合標準，裕量充足"
                    : vResult.pct <= vLimit ? "⚠ 符合標準，接近上限"
                    : "✕ 超出許可壓降，需加大線徑"}
                </div>

                {/* 進度條 */}
                <div style={{ marginTop: "10px" }}>
                  <div style={{ background: "#1E3A5F", borderRadius: "99px", height: "6px", overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: "99px",
                      width: `${Math.min(vResult.pct / 10 * 100, 100).toFixed(1)}%`,
                      background: vResult.pct <= vLimit * 0.6 ? "#4ade80" : vResult.pct <= vLimit ? "#fbbf24" : "#f87171",
                      transition: "width 0.3s, background 0.3s",
                    }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "#475569", marginTop: "3px" }}>
                    <span>0%</span><span>限制 {vLimit}%</span><span>10%</span>
                  </div>
                </div>
              </div>

              {/* 公式說明 */}
              <div style={{ background: "#0D1B2A", border: "1px solid #1E3A5F", borderRadius: "8px", padding: "12px", marginBottom: "12px", fontSize: "10px", color: "#475569", lineHeight: "1.9" }}>
                <div style={{ color: "#F5C518", fontWeight: 700, marginBottom: "6px", fontSize: "10px" }}>▸ 計算公式</div>
                <div style={{ color: "#7DD3FC", fontFamily: "monospace", fontSize: "10px", marginBottom: "4px" }}>
                  {vPhase === "1p2w" ? "VD = 2 × L × I × Z" : vPhase === "3p3w" ? "VD = √3 × L × I × Z" : "VD = L × I × Z"}
                </div>
                <div style={{ fontFamily: "monospace", fontSize: "10px", marginBottom: "4px" }}>
                  Z = R×cosθ + X×sinθ
                </div>
                <div style={{ fontFamily: "monospace", fontSize: "10px", marginBottom: "6px" }}>
                  = {vResult.R}×{vPF.toFixed(3)} + {vResult.X}×{vResult.sinPF.toFixed(4)}<br/>
                  = <span style={{ color: "#7DD3FC" }}>{vResult.Z.toFixed(6)} Ω/km</span>
                </div>
                <div style={{ borderTop: "1px solid #1E3A5F", paddingTop: "6px", fontSize: "9px", lineHeight: "1.8" }}>
                  VD% = VD ÷ V × 100%<br/>
                  = {vResult.VD.toFixed(4)} ÷ {vVolt} × 100%<br/>
                  = <span style={{ color: vResult.pct <= vLimit ? "#4ade80" : "#f87171" }}>{vResult.pct.toFixed(4)}%</span>
                </div>
              </div>

              {/* 說明備註 */}
              <div style={{ background: "#0a1220", border: "1px solid #1E3A5F", borderRadius: "6px", padding: "10px", fontSize: "9px", color: "#475569", lineHeight: "1.8" }}>
                <div style={{ color: "#64748B", fontWeight: 700, marginBottom: "4px" }}>說明備註</div>
                1. 1φ2W：VD = 2×L×I×Z<br/>
                2. 1φ3W 或 3φ4W：VD = L×I×Z<br/>
                3. 3φ3W：VD = √3×L×I×Z<br/>
                4. Z = R×cosθ + X×sinθ（Ω/km）<br/>
                5. VD% = VD÷V×100%
              </div>
            </div>
          )}
        </div>

        {docs.length > 0 && (
          <div style={{ padding: "10px 12px", borderTop: "1px solid #1E3A5F", background: "#0A1520" }}>
            <div style={{ fontSize: "11px", color: "#4ade80", display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
              已載入 {docs.length} 份法規文件
            </div>
          </div>
        )}
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* Header */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #1E3A5F", display: "flex", alignItems: "center", gap: "10px", background: "#0A1520", flexShrink: 0 }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", fontSize: "20px", padding: "2px 4px", flexShrink: 0 }}>☰</button>
          <div style={{ width: "30px", height: "30px", background: "#F5C518", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", flexShrink: 0 }}>⚡</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: "14px", color: "#E2E8F0", whiteSpace: "nowrap" }}>
              {tab === "vdrop" ? "🔌 電壓降計算區" : "電氣法規 AI 助理"}
            </div>
            <div style={{ fontSize: "10px", color: docs.length > 0 ? "#4ade80" : "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {tab === "vdrop" ? "依電機技師計算書公式" : docs.length > 0 ? `依據 ${docs.length} 份上傳文件` : "AI 知識模式・上傳 PDF 切換文件模式"}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "5px", flexShrink: 0 }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22C55E", display: "inline-block" }} />
            <span style={{ fontSize: "10px", color: "#475569" }}>連線中</span>
          </div>
        </div>

        {/* Chat */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {messages.length === 0 && (
            <div style={{ margin: "auto", textAlign: "center", maxWidth: "340px", opacity: 0.45, padding: "0 16px" }}>
              <div style={{ fontSize: "44px", marginBottom: "12px" }}>⚡</div>
              <div style={{ fontSize: "15px", color: "#94A3B8", marginBottom: "8px" }}>詢問任何電氣法規問題</div>
              <div style={{ fontSize: "11px", color: "#475569", lineHeight: "1.7" }}>
                點左上角 ☰ 開啟選單<br />
                可上傳 PDF 或選擇常見問題
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} style={{ display: "flex", flexDirection: msg.role === "user" ? "row-reverse" : "row", gap: "8px", alignItems: "flex-start" }}>
              <div style={{
                width: "28px", height: "28px", borderRadius: "6px", flexShrink: 0,
                background: msg.role === "user" ? "#1E3A5F" : "#1a2a1a",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px",
                border: `1px solid ${msg.role === "user" ? "#2a5a8c" : "#2a4a2a"}`,
              }}>
                {msg.role === "user" ? "👤" : "⚡"}
              </div>
              <div style={{
                maxWidth: "80%", padding: "10px 13px",
                borderRadius: msg.role === "user" ? "12px 4px 12px 12px" : "4px 12px 12px 12px",
                background: msg.role === "user" ? "#1a3a5c" : "#111f2e",
                border: `1px solid ${msg.role === "user" ? "#2a5a8c" : "#1E3A5F"}`,
                fontSize: "13px", lineHeight: "1.7", color: "#CBD5E1",
              }}>
                {msg.role === "assistant" ? formatMessage(msg.content) : msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "6px", background: "#1a2a1a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", border: "1px solid #2a4a2a" }}>⚡</div>
              <div style={{ padding: "12px 16px", background: "#111f2e", border: "1px solid #1E3A5F", borderRadius: "4px 12px 12px 12px", display: "flex", gap: "4px", alignItems: "center" }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#F5C518", animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid #1E3A5F", background: "#0A1520", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", background: "#111f2e", border: "1px solid #1E3A5F", borderRadius: "10px", padding: "8px 12px" }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="輸入法規問題⋯"
              rows={1}
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#E2E8F0", fontSize: "14px", resize: "none", lineHeight: "1.5", maxHeight: "120px", overflow: "auto", fontFamily: "inherit" }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              style={{
                background: loading || !input.trim() ? "#1E3A5F" : "#F5C518",
                color: loading || !input.trim() ? "#475569" : "#0D1B2A",
                border: "none", borderRadius: "6px", width: "36px", height: "36px",
                cursor: loading || !input.trim() ? "default" : "pointer",
                fontSize: "18px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                fontWeight: 700, transition: "all 0.2s",
              }}
            >↑</button>
          </div>
          <div style={{ marginTop: "5px", fontSize: "10px", color: "#334155", textAlign: "center" }}>
            AI 回覆僅供參考，請以最新版法規原文為準
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1.1)} }
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:#0D1B2A}
        ::-webkit-scrollbar-thumb{background:#1E3A5F;border-radius:2px}
        textarea::placeholder{color:#475569}
        button:hover{opacity:0.85}
      `}</style>
    </div>
  );
}
