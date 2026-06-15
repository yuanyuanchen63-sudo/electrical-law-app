"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
const QUICK_QUESTIONS = [
  "PVC管填充率如何計算？",
  "電壓降計算公式？",
  "低壓配電盤設計原則？",
  "消防泵浦供電規範？",
  "ATS切換方式有哪些？",
  "接地電阻標準值是多少？",
];

type Message = { role: "user" | "assistant"; content: string };
type Doc = { 
  name: string; 
  text: string; 
  date: string; 
  size: string;
  url?: string;
};

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
  const [tab, setTab] = useState<"docs" | "quick">("docs");
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
      const filePath = `${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage
        .from("documents")
        .getPublicUrl(filePath);

      const fileUrl = publicUrlData.publicUrl;

      const { error: dbError } = await supabase
        .from("documents")
        .insert({
          file_name: file.name,
          file_url: fileUrl,
          text_content: text,
        });

      if (dbError) {
        throw dbError;
      }

      setDocs(prev => [
        ...prev.filter(d => d.name !== file.name),
        {
          name: file.name,
          text,
          date,
          size: (file.size / 1024).toFixed(0),
          url: fileUrl,
        },
      ]);
    } catch (err: any) {
      console.error(err);
      setExtractError(
        `${file.name}：${err?.message || JSON.stringify(err)}`
      );
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
          {(["docs", "quick"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: "12px 0", background: tab === t ? "#0D1B2A" : "transparent",
              border: "none", borderBottom: tab === t ? "2px solid #F5C518" : "2px solid transparent",
              color: tab === t ? "#F5C518" : "#475569", cursor: "pointer",
              fontSize: "11px", fontWeight: tab === t ? 700 : 400, letterSpacing: "1px",
            }}>
              {t === "docs" ? "📁 工程知識庫" : "⚡ 常見問題"}
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
                {extracting ? "⏳ 解析中..." : "＋ 上傳工程文件"}
              </button>
              <input ref={fileInputRef} type="file" accept=".pdf" multiple onChange={handleUpload} style={{ display: "none" }} />

              {extractError && (
                <div style={{ fontSize: "11px", color: "#f87171", background: "#2a1a1a", border: "1px solid #5a2a2a", borderRadius: "5px", padding: "8px", marginBottom: "10px" }}>
                  {extractError}
                </div>
              )}

              {docs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 8px", color: "#334155", fontSize: "11px", lineHeight: "1.8" }}>
                  尚未上傳任何工程文件<br />
                  <span style={{ color: "#1E3A5F" }}>上傳後 AI 將依據<br />你的工程文件回答</span>
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
                💡 <strong style={{ color: "#64748B" }}>支援文件類型：</strong><br />
  • 電氣法規 PDF<br />
  • 建築技術規則<br />
  • 消防法規文件<br />
  • 設計規範書<br />
  • 設備型錄與手冊<br />
  • 業主技術規範<br />
            <br />
                  上傳後 AI 將依據文件內容回答問題與分析資料
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
        </div>

        {docs.length > 0 && (
          <div style={{ padding: "10px 12px", borderTop: "1px solid #1E3A5F", background: "#0A1520" }}>
            <div style={{ fontSize: "11px", color: "#4ade80", display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
              已載入 {docs.length} 份工程文件
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
            <div style={{ fontWeight: 700, fontSize: "14px", color: "#E2E8F0", whiteSpace: "nowrap" }}>機電智庫 AI</div>
            <div style={{ fontSize: "10px", color: docs.length > 0 ? "#4ade80" : "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {docs.length > 0 ? `依據 ${docs.length} 份上傳文件` : "機電法規 × 工程知識 × AI 智慧查詢"}
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
              <div style={{ fontSize: "15px", color: "#94A3B8", marginBottom: "8px" }}>詢問任何機電智庫問題</div>
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
              placeholder="請輸入問題⋯"
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
