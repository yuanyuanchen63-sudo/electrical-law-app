"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };
type Doc = { name: string; text: string; date: string; size: string };
type Phase = "1p2w" | "1p3w" | "3p4w" | "3p3w";

const QUICK_QUESTIONS = [
  "單相 220V 迴路的導線截面積最小需幾 mm²？",
  "緊急出口指示燈的安裝高度規定？",
  "變壓器室的防火區劃要求？",
  "屋內配線的接地規定為何？",
  "分路保護器的額定電流如何選定？",
  "特低壓電路的電壓範圍規定？",
];

async function extractPdfText(file: File, maxChars = 15000): Promise<string> {
  await new Promise<void>((res, rej) => {
    if ((window as any).pdfjsLib) return res();
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => res();
    s.onerror = () => rej(new Error("PDF.js 載入失敗"));
    document.head.appendChild(s);
  });

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
          if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={j} style={{ color: "#F5C518" }}>{part.slice(2, -2)}</strong>;
          }
          if (part.startsWith("【") && part.endsWith("】")) {
            return (
              <span key={j} style={{
                background: "#1a2f4a", color: "#7DD3FC", padding: "1px 6px",
                borderRadius: "3px", fontFamily: "monospace", fontSize: "0.85em",
                border: "1px solid #2a4a6a",
              }}>{part}</span>
            );
          }
          if (part === "「依上傳文件」") {
            return (
              <span key={j} style={{
                background: "#1a3a1a", color: "#4ade80", padding: "1px 6px",
                borderRadius: "3px", fontSize: "0.8em", border: "1px solid #2a5a2a",
              }}>{part}</span>
            );
          }
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState<"docs" | "quick">("docs");
  const [appMode, setAppMode] = useState<"law" | "vdrop">("law");
  const [guideOpen, setGuideOpen] = useState(false);

  // 電壓降計算輸入欄位：依 Excel 計算書欄位設計
  const [vDesc, setVDesc] = useState("KWH1,1L");
  const [vPhase, setVPhase] = useState<Phase>("1p3w");
  const [vVolt, setVVolt] = useState(220);
  const [vLightKVA, setVLightKVA] = useState("2");
  const [vMotorHP, setVMotorHP] = useState("0");
  const [vHeatKW, setVHeatKW] = useState("0");
  const [vLength, setVLength] = useState("17");
  const [vWire, setVWire] = useState("PVC");
  const [vMM, setVMM] = useState(30);
  const [vWireCount, setVWireCount] = useState("1");
  const vLimit = 3;
  const [vR, setVR] = useState("0.606");
  const [vX, setVX] = useState("0.094");

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // R、X 依你提供的「電阻參照表」，單位 Ω/km
  const wireDB: Record<number, { R: number; X: number }> = {
    2: { R: 5.657, X: 0.119 },
    5.5: { R: 3.24, X: 0.115 },
    8: { R: 2.25, X: 0.104 },
    14: { R: 1.26, X: 0.0973 },
    22: { R: 0.801, X: 0.0965 },
    30: { R: 0.606, X: 0.094 },
    38: { R: 0.474, X: 0.0914 },
    50: { R: 0.368, X: 0.0913 },
    60: { R: 0.295, X: 0.0912 },
    80: { R: 0.223, X: 0.091 },
    100: { R: 0.175, X: 0.0909 },
    125: { R: 0.14, X: 0.0895 },
    150: { R: 0.115, X: 0.0887 },
    200: { R: 0.0902, X: 0.0878 },
    250: { R: 0.0701, X: 0.0875 },
  };
  const wireMMList = [2, 5.5, 8, 14, 22, 30, 38, 50, 60, 80, 100, 125, 150, 200, 250];

  const num = (value: string) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const handleDecimalInput = (value: string, setter: React.Dispatch<React.SetStateAction<string>>) => {
    if (/^\d*(\.\d*)?$/.test(value)) setter(value);
  };

  const handleIntegerInput = (value: string, setter: React.Dispatch<React.SetStateAction<string>>) => {
    if (/^\d*$/.test(value)) setter(value);
  };

  const phaseLabel = (phase: Phase) => {
    if (phase === "1p2w") return "1φ2W";
    if (phase === "1p3w") return "1φ3W";
    if (phase === "3p4w") return "3φ4W";
    return "3φ3W";
  };

  const voltageDisplay = () => {
    if (vPhase === "1p2w") return `${vVolt}`;
    if (vPhase === "1p3w") return `${vVolt}/${vVolt / 2}`;
    if (vPhase === "3p4w") return `${vVolt}/${Math.round(vVolt / Math.sqrt(3))}`;
    return `${vVolt}`;
  };

  const voltageForPercent = () => {
    if (vPhase === "1p2w") return vVolt;
    if (vPhase === "1p3w") return vVolt / 2;
    if (vPhase === "3p4w") return vVolt / Math.sqrt(3);
    return vVolt;
  };

  const calcLoad = () => {
    const kva = num(vLightKVA);
    const hp = num(vMotorHP);
    const kw = num(vHeatKW);

    // Excel C欄：負載(VA) = KVA×1000 + HP×1000 + kW×1000
    // Excel G欄：PF = (KVA×1000×0.9 + HP×746 + kW×1000) ÷ 負載(VA)
    const loadVA = kva * 1000 + hp * 1000 + kw * 1000;
    const realW = kva * 1000 * 0.9 + hp * 746 + kw * 1000;
    const pf = loadVA > 0 ? Math.min(Math.max(realW / loadVA, 0), 1) : 0;
    return { kva, hp, kw, loadVA, realW, pf };
  };

  const calcCurrent = (loadVA: number) => {
    if (vVolt <= 0) return 0;
    // Excel D欄邏輯：
    // 1φ2W：I = VA ÷ 110
    // 1φ3W：I = VA ÷ 220
    // 3φ4W / 3φ3W：I = VA ÷ (√3 × 線電壓)
    if (vPhase === "3p4w" || vPhase === "3p3w") return loadVA / (Math.sqrt(3) * vVolt);
    return loadVA / vVolt;
  };

  const getBaseRX = () => {
    if (vWire === "custom") return { R: num(vR), X: num(vX) };
    return wireDB[vMM] || wireDB[2];
  };

  const calcVD = () => {
    const load = calcLoad();
    const current = calcCurrent(load.loadVA);
    const length = num(vLength);
    const wireCount = Math.max(1, Math.floor(num(vWireCount)) || 1);
    const base = getBaseRX();
    const R = base.R / wireCount;
    const X = base.X / wireCount;
    const sinTheta = Math.sqrt(Math.max(0, 1 - load.pf * load.pf));

    // Excel I欄 Z列：Z = R×PF + X×SIN(ACOS(PF))
    const Z = R * load.pf + X * sinTheta;

    // 指定公式：電壓降 VD = 電流 I × 距離 L × 總阻抗 Z ÷ 1000
    const VD = current * length * Z / 1000;

    // 指定公式：壓降百分率 = 電壓降 ÷ 電壓 × 100
    const pctBaseV = vVolt;
    const pct = pctBaseV > 0 ? VD / pctBaseV * 100 : 0;
    const vEnd = pctBaseV - VD;

    return {
      load,
      current,
      length,
      wireCount,
      baseR: base.R,
      baseX: base.X,
      R,
      X,
      sinTheta,
      Z,
      VD,
      pct,
      pctBaseV,
      vEnd,
    };
  };

  const updateWire = (wire: string, mm: number) => {
    setVWire(wire);
    setVMM(mm);
    if (wire !== "custom") {
      const d = wireDB[mm] || wireDB[2];
      setVR(String(d.R));
      setVX(String(d.X));
    }
  };

  const vResult = calcVD();
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  const inputStyle = {
    width: "100%",
    background: "#111f2e",
    border: "1px solid #1E3A5F",
    borderRadius: "8px",
    color: "#CBD5E1",
    padding: "10px",
    fontSize: "13px",
  };

  const labelStyle = { fontSize: "12px", color: "#94A3B8", marginBottom: "6px" };

  if (appMode === "vdrop") {
    return (
      <div style={{
        minHeight: "100dvh",
        background: "#0D1B2A",
        color: "#E2E8F0",
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        padding: "18px",
      }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{
            background: "#0A1520",
            border: "1px solid #1E3A5F",
            borderRadius: "14px",
            padding: "16px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}>
            <button onClick={() => setAppMode("law")} style={{ background: "transparent", border: "1px solid #1E3A5F", color: "#94A3B8", borderRadius: "8px", padding: "9px 12px", cursor: "pointer" }}>返回法規 AI</button>
            <div style={{ width: "38px", height: "38px", background: "#F5C518", color: "#0D1B2A", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>⚡</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "18px", fontWeight: 900 }}>電壓降計算表</div>
              <div style={{ fontSize: "12px", color: "#64748B" }}>欄位與公式依 Excel 計算書模板；R / X 阻抗依電阻參照表</div>
            </div>
            <button onClick={() => setGuideOpen(true)} style={{ marginLeft: "auto", background: "#F5C518", color: "#0D1B2A", border: "none", borderRadius: "8px", padding: "10px 14px", fontWeight: 900, cursor: "pointer" }}>使用指南</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 430px) 1fr", gap: "16px" }}>
            <div style={{ background: "#0A1520", border: "1px solid #1E3A5F", borderRadius: "14px", padding: "16px" }}>
              <div style={{ color: "#F5C518", fontSize: "12px", letterSpacing: "2px", fontWeight: 800, marginBottom: "14px" }}>◈ 輸入資料</div>
              <div style={{ display: "grid", gap: "12px" }}>
                <label>
                  <div style={labelStyle}>說明</div>
                  <input type="text" value={vDesc} onChange={e => setVDesc(e.target.value)} style={inputStyle} />
                </label>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <label>
                    <div style={labelStyle}>計算電壓 / 供電方式</div>
                    <select value={vPhase} onChange={e => {
                      const next = e.target.value as Phase;
                      setVPhase(next);
                      if (next === "1p2w") setVVolt(110);
                      if (next === "1p3w") setVVolt(220);
                      if (next === "3p4w" || next === "3p3w") setVVolt(380);
                    }} style={inputStyle}>
                      <option value="1p2w">1φ2W — 單相二線</option>
                      <option value="1p3w">1φ3W — 單相三線</option>
                      <option value="3p4w">3φ4W — 三相四線</option>
                      <option value="3p3w">3φ3W — 三相三線</option>
                    </select>
                  </label>
                  <label>
                    <div style={labelStyle}>計算電壓 V</div>
                    <select value={vVolt} onChange={e => setVVolt(Number(e.target.value))} style={inputStyle}>
                      <option value={110}>110 V</option>
                      <option value={220}>220 V</option>
                      <option value={380}>380 V</option>
                    </select>
                  </label>
                </div>

                <div style={{ background: "#0D1B2A", border: "1px solid #1E3A5F", borderRadius: "10px", padding: "12px" }}>
                  <div style={{ fontSize: "12px", color: "#F5C518", fontWeight: 800, marginBottom: "10px" }}>負載輸入｜燈 / 力 / 熱</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                    <label>
                      <div style={labelStyle}>燈｜KVA</div>
                      <input type="text" inputMode="decimal" value={vLightKVA} onChange={e => handleDecimalInput(e.target.value, setVLightKVA)} style={inputStyle} />
                    </label>
                    <label>
                      <div style={labelStyle}>力｜HP</div>
                      <input type="text" inputMode="decimal" value={vMotorHP} onChange={e => handleDecimalInput(e.target.value, setVMotorHP)} style={inputStyle} />
                    </label>
                    <label>
                      <div style={labelStyle}>熱｜kW</div>
                      <input type="text" inputMode="decimal" value={vHeatKW} onChange={e => handleDecimalInput(e.target.value, setVHeatKW)} style={inputStyle} />
                    </label>
                  </div>
                  <div style={{ marginTop: "8px", color: "#64748B", fontSize: "11px", lineHeight: "1.7" }}>
                    負載 VA = 燈KVA×1000 + 力HP×1000 + 熱kW×1000<br />
                    PF =〔燈KVA×1000×0.9 + 力HP×746 + 熱kW×1000〕÷ 負載VA
                  </div>
                </div>

                <label>
                  <div style={labelStyle}>距離 L（m，單程距離）</div>
                  <input type="text" inputMode="decimal" value={vLength} onChange={e => handleDecimalInput(e.target.value, setVLength)} style={inputStyle} />
                </label>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <label>
                    <div style={labelStyle}>導線種類</div>
                    <select value={vWire} onChange={e => updateWire(e.target.value, vMM)} style={inputStyle}>
                      <option value="PVC">PVC 600V</option>
                      <option value="FR">FR-LSOH</option>
                      <option value="XLPE">XLPE</option>
                      <option value="custom">自訂阻抗</option>
                    </select>
                  </label>
                  <label>
                    <div style={labelStyle}>線徑 mm²</div>
                    <select value={vMM} onChange={e => updateWire(vWire, Number(e.target.value))} style={inputStyle}>
                      {wireMMList.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <label>
                    <div style={labelStyle}>線徑條數 / 並聯組數</div>
                    <input type="text" inputMode="numeric" value={vWireCount} onChange={e => handleIntegerInput(e.target.value, setVWireCount)} style={inputStyle} />
                  </label>
                  <div style={{ background: "#0D1B2A", border: "1px solid #1E3A5F", borderRadius: "8px", padding: "10px" }}>
                    <div style={labelStyle}>許可壓降</div>
                    <div style={{ color: "#F5C518", fontSize: "15px", fontWeight: 900 }}>3%</div>
                    <div style={{ color: "#64748B", fontSize: "11px", marginTop: "4px" }}>全系統統一採用 3% 判斷</div>
                  </div>
                </div>

                {vWire === "custom" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <label>
                      <div style={labelStyle}>R Ω/km</div>
                      <input type="text" inputMode="decimal" value={vR} onChange={e => handleDecimalInput(e.target.value, setVR)} style={inputStyle} />
                    </label>
                    <label>
                      <div style={labelStyle}>X Ω/km</div>
                      <input type="text" inputMode="decimal" value={vX} onChange={e => handleDecimalInput(e.target.value, setVX)} style={inputStyle} />
                    </label>
                  </div>
                )}
              </div>
            </div>

            <div style={{ background: "#0A1520", border: "1px solid #1E3A5F", borderRadius: "14px", padding: "16px" }}>
              <div style={{ color: "#F5C518", fontSize: "12px", letterSpacing: "2px", fontWeight: 800, marginBottom: "14px" }}>◈ 計算結果</div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "10px", marginBottom: "14px" }}>
                {[
                  { label: "說明", val: vDesc || "—" },
                  { label: "計算電壓", val: `${phaseLabel(vPhase)}｜${voltageDisplay()} V` },
                  { label: "負載", val: `${vResult.load.loadVA.toLocaleString(undefined, { maximumFractionDigits: 3 })} VA` },
                  { label: "電流 I", val: `${vResult.current.toFixed(1)} A` },
                  { label: "距離 L", val: `${vResult.length || 0} m` },
                  { label: "線徑", val: `${vWire} ${vMM} mm²${vResult.wireCount > 1 ? ` × ${vResult.wireCount}` : ""}` },
                  { label: "功率因數 PF", val: vResult.load.pf.toFixed(2) },
                  { label: "R 阻抗", val: `${vResult.R.toFixed(9)} Ω/km` },
                  { label: "X 阻抗", val: `${vResult.X.toFixed(9)} Ω/km` },
                  { label: "Z 阻抗", val: `${vResult.Z.toFixed(9)} Ω/km` },
                  { label: "電壓降", val: `${vResult.VD.toFixed(9)} V` },
                  { label: "壓降百分率", val: `${vResult.pct.toFixed(4)} %` },
                ].map(item => (
                  <div key={item.label} style={{ background: "#111f2e", border: "1px solid #1E3A5F", borderRadius: "10px", padding: "12px" }}>
                    <div style={{ color: "#64748B", fontSize: "11px", marginBottom: "5px" }}>{item.label}</div>
                    <div style={{ color: "#7DD3FC", fontSize: "17px", fontWeight: 900, wordBreak: "break-word" }}>{item.val}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px", marginBottom: "14px" }}>
                <div style={{ background: "#0D1B2A", border: "1px solid #1E3A5F", borderRadius: "10px", padding: "14px" }}>
                  <div style={{ color: "#F5C518", fontWeight: 900, marginBottom: "8px", fontSize: "13px" }}>阻抗拆解</div>
                  <div style={{ color: "#94A3B8", fontSize: "12px", lineHeight: "1.9" }}>
                    <div>參照表 R：{vResult.baseR} Ω/km</div>
                    <div>參照表 X：{vResult.baseX} Ω/km</div>
                    <div>線徑條數：{vResult.wireCount}</div>
                    <div>有效 R：{vResult.R.toFixed(9)} Ω/km</div>
                    <div>有效 X：{vResult.X.toFixed(9)} Ω/km</div>
                    <div>計算 Z：{vResult.Z.toFixed(9)} Ω/km</div>
                  </div>
                </div>

                <div style={{ background: "#0D1B2A", border: "1px solid #1E3A5F", borderRadius: "10px", padding: "14px" }}>
                  <div style={{ color: "#F5C518", fontWeight: 900, marginBottom: "8px", fontSize: "13px" }}>壓降判斷</div>
                  <div style={{ color: "#94A3B8", fontSize: "12px", lineHeight: "1.9" }}>
                    <div>許可壓降：3%</div>
                    <div>目前壓降百分率：{vResult.pct.toFixed(4)}%</div>
                    <div>末端電壓：{vResult.vEnd.toFixed(3)} V</div>
                  </div>
                  <div style={{
                    marginTop: "10px",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: 900,
                    textAlign: "center",
                    background: vResult.pct <= vLimit * 0.6 ? "#1a3a1a" : vResult.pct <= vLimit ? "#2a2a0a" : "#3a1a1a",
                    color: vResult.pct <= vLimit * 0.6 ? "#4ade80" : vResult.pct <= vLimit ? "#fbbf24" : "#f87171",
                    border: `1px solid ${vResult.pct <= vLimit * 0.6 ? "#2a6a2a" : vResult.pct <= vLimit ? "#5a5a0a" : "#6a2a2a"}`,
                  }}>
                    {vResult.pct <= vLimit * 0.6 ? "✓ 符合 3% 標準，裕量充足" : vResult.pct <= vLimit ? "⚠ 符合 3% 標準，但接近上限" : "✕ 超出 3% 許可壓降，建議加大線徑或縮短距離"}
                  </div>
                </div>
              </div>

              <div style={{ background: "#0D1B2A", border: "1px solid #1E3A5F", borderRadius: "10px", padding: "14px", color: "#94A3B8", fontSize: "12px", lineHeight: "1.9" }}>
                <div style={{ color: "#F5C518", fontWeight: 900, marginBottom: "8px" }}>公式追蹤</div>
                <div>負載 VA = 燈KVA×1000 + 力HP×1000 + 熱kW×1000 = {vResult.load.kva}×1000 + {vResult.load.hp}×1000 + {vResult.load.kw}×1000 = {vResult.load.loadVA.toFixed(3)} VA</div>
                <div>PF =〔燈KVA×1000×0.9 + 力HP×746 + 熱kW×1000〕÷ 負載VA = {vResult.load.pf.toFixed(2)}</div>
                <div>Z = R×PF + X×SIN(ACOS(PF)) = {vResult.R.toFixed(9)}×{vResult.load.pf.toFixed(2)} + {vResult.X.toFixed(9)}×{vResult.sinTheta.toFixed(9)} = {vResult.Z.toFixed(9)} Ω/km</div>
                <div>電壓降 VD = 電流I × 距離L × 總阻抗Z ÷ 1000 = {vResult.current.toFixed(1)} × {vResult.length || 0} × {vResult.Z.toFixed(9)} ÷ 1000 = {vResult.VD.toFixed(9)} V</div>
                <div>壓降百分率 = 電壓降 ÷ 電壓 × 100 = {vResult.VD.toFixed(9)} ÷ {vVolt} × 100 = {vResult.pct.toFixed(4)}%</div>
              </div>
            </div>
          </div>
        </div>

        {guideOpen && (
          <div onClick={() => setGuideOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: "18px", zIndex: 100 }}>
            <div onClick={e => e.stopPropagation()} style={{ width: "min(760px, 100%)", background: "#0A1520", border: "1px solid #1E3A5F", borderRadius: "14px", padding: "20px", color: "#CBD5E1", lineHeight: "1.9" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", marginBottom: "10px" }}>
                <div style={{ fontSize: "18px", fontWeight: 900, color: "#F5C518" }}>電壓降使用指南</div>
                <button onClick={() => setGuideOpen(false)} style={{ background: "transparent", border: "none", color: "#94A3B8", fontSize: "22px", cursor: "pointer" }}>×</button>
              </div>
              <div style={{ fontSize: "13px" }}>
                <strong>1. 說明：</strong>填迴路或盤名，例如 KWH1,1L。<br />
                <strong>2. 計算電壓：</strong>1φ3W 會呈現 220/110；3φ4W 會呈現 380/220。<br />
                <strong>3. 負載：</strong>燈填 KVA、力填 HP、熱填 kW，系統依 Excel 計算書公式換算 VA、I、PF。<br />
                <strong>4. 距離：</strong>填單程距離，單位公尺。<br />
                <strong>5. 線徑與條數：</strong>線徑查電阻參照表；條數代表並聯組數，R、X 會除以條數後計算。<br />
                <strong>6. 結果：</strong>以卡片方式呈現說明、計算電壓、負載、電流、距離、線徑、功率因數、R / X / Z、電壓降、壓降百分率；許可壓降統一採 3%。
              </div>
            </div>
          </div>
        )}

        <style>{`
          *{box-sizing:border-box}
          button:hover{opacity:.86}
          input,select{outline:none}
          input[type=number]::-webkit-inner-spin-button,
          input[type=number]::-webkit-outer-spin-button{ -webkit-appearance:none; margin:0; }
          input[type=number]{ -moz-appearance:textfield; }
          @media (max-width: 900px){
            div[style*="grid-template-columns: minmax(300px, 430px) 1fr"]{ grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", height: "100dvh", background: "#0D1B2A",
      fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#E2E8F0", overflow: "hidden",
      position: "relative",
    }}>
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ display: isMobile ? "block" : "none", position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10 }} />
      )}

      <div style={{
        position: isMobile ? "fixed" : "relative",
        left: 0, top: 0, bottom: 0, zIndex: 20,
        width: "260px",
        transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.3s",
        background: "#0A1520", borderRight: "1px solid #1E3A5F",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ display: "flex", borderBottom: "1px solid #1E3A5F", flexShrink: 0 }}>
          {(["docs", "quick"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: "10px 0", background: tab === t ? "#0D1B2A" : "transparent",
              border: "none", borderBottom: tab === t ? "2px solid #F5C518" : "2px solid transparent",
              color: tab === t ? "#F5C518" : "#475569", cursor: "pointer",
              fontSize: "10px", fontWeight: tab === t ? 700 : 400, letterSpacing: "0.5px",
            }}>
              {t === "docs" ? "📁 法規文件" : "⚡ 常見問題"}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px" }}>
          {tab === "docs" && (
            <>
              <button onClick={() => fileInputRef.current?.click()} disabled={extracting} style={{
                width: "100%", padding: "12px", marginBottom: "12px",
                background: "#1a3a1a", border: "1px dashed #2a6a2a",
                borderRadius: "8px", color: extracting ? "#475569" : "#4ade80",
                cursor: extracting ? "default" : "pointer", fontSize: "13px",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
              }}>
                {extracting ? "⏳ 解析中..." : "＋ 上傳法規 PDF"}
              </button>
              <input ref={fileInputRef} type="file" accept=".pdf" multiple onChange={handleUpload} style={{ display: "none" }} />

              {extractError && <div style={{ fontSize: "11px", color: "#f87171", background: "#2a1a1a", border: "1px solid #5a2a2a", borderRadius: "5px", padding: "8px", marginBottom: "10px" }}>{extractError}</div>}

              {docs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 8px", color: "#334155", fontSize: "11px", lineHeight: "1.8" }}>
                  尚未上傳任何法規<br /><span style={{ color: "#1E3A5F" }}>上傳後 AI 將依據<br />你的文件版本回答</span>
                </div>
              ) : docs.map(doc => (
                <div key={doc.name} style={{ background: "#111f2e", border: "1px solid #1E3A5F", borderRadius: "7px", padding: "10px", marginBottom: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ fontSize: "11px", color: "#7DD3FC", fontWeight: 600, lineHeight: "1.4", flex: 1 }}>📄 {doc.name.replace(".pdf", "")}</div>
                    <button onClick={() => setDocs(d => d.filter(x => x.name !== doc.name))} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: "14px", padding: "0 2px" }}>✕</button>
                  </div>
                  <div style={{ marginTop: "6px", display: "flex", gap: "8px", fontSize: "10px", color: "#475569" }}>
                    <span>📅 {doc.date}</span><span>📦 {doc.size} KB</span><span style={{ color: "#4ade80" }}>✓ 已載入</span>
                  </div>
                </div>
              ))}

              <div style={{ marginTop: "12px", padding: "10px", background: "#0D1B2A", border: "1px solid #1E3A5F", borderRadius: "6px", fontSize: "10px", color: "#475569", lineHeight: "1.8" }}>
                💡 <strong style={{ color: "#64748B" }}>取得官方 PDF：</strong><br />前往 <span style={{ color: "#7DD3FC" }}>law.moj.gov.tw</span><br />搜尋法規 → 下載 PDF<br />法規修正後重新上傳即可
              </div>
            </>
          )}

          {tab === "quick" && (
            <>
              <div style={{ fontSize: "10px", letterSpacing: "2px", color: "#F5C518", fontWeight: 700, marginBottom: "12px" }}>◈ 常見查詢</div>
              {QUICK_QUESTIONS.map((q, i) => (
                <button key={i} onClick={() => sendMessage(q)} style={{
                  display: "block", width: "100%", padding: "10px", marginBottom: "6px",
                  background: "transparent", border: "1px solid #1E3A5F", borderRadius: "6px",
                  color: "#64748B", cursor: "pointer", fontSize: "12px", textAlign: "left", lineHeight: "1.5",
                }}>{q}</button>
              ))}
            </>
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

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #1E3A5F", display: "flex", alignItems: "center", gap: "10px", background: "#0A1520", flexShrink: 0 }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", fontSize: "20px", padding: "2px 4px", flexShrink: 0 }}>☰</button>
          <div style={{ width: "30px", height: "30px", background: "#F5C518", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", flexShrink: 0 }}>⚡</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: "14px", color: "#E2E8F0", whiteSpace: "nowrap" }}>電氣法規 AI 助理</div>
            <div style={{ fontSize: "10px", color: docs.length > 0 ? "#4ade80" : "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {docs.length > 0 ? `依據 ${docs.length} 份上傳文件` : "AI 知識模式・上傳 PDF 切換文件模式"}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
            <button onClick={() => setAppMode("vdrop")} style={{ background: "#F5C518", color: "#0D1B2A", border: "none", borderRadius: "6px", padding: "8px 10px", cursor: "pointer", fontSize: "11px", fontWeight: 800 }}>電壓降計算</button>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22C55E", display: "inline-block" }} />
            <span style={{ fontSize: "10px", color: "#475569" }}>連線中</span>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {messages.length === 0 && (
            <div style={{ margin: "auto", textAlign: "center", maxWidth: "340px", opacity: 0.45, padding: "0 16px" }}>
              <div style={{ fontSize: "44px", marginBottom: "12px" }}>⚡</div>
              <div style={{ fontSize: "15px", color: "#94A3B8", marginBottom: "8px" }}>詢問任何電氣法規問題</div>
              <div style={{ fontSize: "11px", color: "#475569", lineHeight: "1.7" }}>點左上角 ☰ 開啟選單<br />可上傳 PDF 或選擇常見問題</div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} style={{ display: "flex", flexDirection: msg.role === "user" ? "row-reverse" : "row", gap: "8px", alignItems: "flex-start" }}>
              <div style={{
                width: "28px", height: "28px", borderRadius: "6px", flexShrink: 0,
                background: msg.role === "user" ? "#1E3A5F" : "#1a2a1a",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px",
                border: `1px solid ${msg.role === "user" ? "#2a5a8c" : "#2a4a2a"}`,
              }}>{msg.role === "user" ? "👤" : "⚡"}</div>
              <div style={{
                maxWidth: "80%", padding: "10px 13px",
                borderRadius: msg.role === "user" ? "12px 4px 12px 12px" : "4px 12px 12px 12px",
                background: msg.role === "user" ? "#1a3a5c" : "#111f2e",
                border: `1px solid ${msg.role === "user" ? "#2a5a8c" : "#1E3A5F"}`,
                fontSize: "13px", lineHeight: "1.7", color: "#CBD5E1",
              }}>{msg.role === "assistant" ? formatMessage(msg.content) : msg.content}</div>
            </div>
          ))}

          {loading && (
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "6px", background: "#1a2a1a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", border: "1px solid #2a4a2a" }}>⚡</div>
              <div style={{ padding: "12px 16px", background: "#111f2e", border: "1px solid #1E3A5F", borderRadius: "4px 12px 12px 12px", display: "flex", gap: "4px", alignItems: "center" }}>
                {[0, 1, 2].map(i => <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#F5C518", animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />)}
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

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
            <button onClick={() => sendMessage()} disabled={loading || !input.trim()} style={{
              background: loading || !input.trim() ? "#1E3A5F" : "#F5C518",
              color: loading || !input.trim() ? "#475569" : "#0D1B2A",
              border: "none", borderRadius: "6px", width: "36px", height: "36px",
              cursor: loading || !input.trim() ? "default" : "pointer",
              fontSize: "18px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              fontWeight: 700, transition: "all 0.2s",
            }}>↑</button>
          </div>
          <div style={{ marginTop: "5px", fontSize: "10px", color: "#334155", textAlign: "center" }}>AI 回覆僅供參考，請以最新版法規原文為準</div>
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

const td = {
  border: "1px solid #31577d",
  padding: "8px",
  textAlign: "center" as const,
  background: "#111f2e",
};
