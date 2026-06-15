import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const BASE_SYSTEM = `你是一位專精台灣電氣法規的 AI 助理，服務對象為電機技師、電氣設計師與建築師。

回覆規則：
- 先直接回答問題
- 引用具體條文（格式：【法規名稱 第XX條】）
- 提供實務建議
- 若有多條法規交叉，說明各自適用範圍
- 使用繁體中文，語氣專業但易懂
- 回覆結構：① 直接解答 ② 相關條文 ③ 實務提醒
- 如需計算，請列出公式與步驟
- 若使用者提供了法規文件，優先以文件內容為準，並標注「依上傳文件」`;

export async function POST(req: NextRequest) {
  try {
    const { messages, docContext } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
    }

    const systemPrompt = docContext
      ? BASE_SYSTEM +
        `\n\n以下是使用者提供的最新法規文件，請優先參考：\n\n${docContext}`
      : BASE_SYSTEM;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: systemPrompt,
      messages,
    });

    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");

    return NextResponse.json({ text });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "API 呼叫失敗" }, { status: 500 });
  }
}
