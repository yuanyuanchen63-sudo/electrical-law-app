# ⚡ 電氣法規 AI 助理 — 部署說明

完成後你會有一個網址，手機、平板、電腦都能使用。

---

## 第一步：取得 Anthropic API Key

1. 前往 https://console.anthropic.com/
2. 註冊帳號（可用 Google 登入）
3. 左側選「API Keys」→ 點「Create Key」
4. 複製金鑰（格式：`sk-ant-xxxxxxx`），**只顯示一次，請先存起來**
5. 左側選「Billing」→「Set Limit」→ 設定月費上限（建議 $10 USD）

---

## 第二步：安裝工具（只需做一次）

### 安裝 Node.js
1. 前往 https://nodejs.org/
2. 下載「LTS」版本並安裝
3. 安裝完成後，開啟終端機（Mac：Terminal；Windows：命令提示字元）
4. 輸入 `node -v`，看到版本號表示成功

### 安裝 Git
1. 前往 https://git-scm.com/
2. 下載並安裝

---

## 第三步：在本機測試

開啟終端機，輸入以下指令：

```bash
# 進入專案資料夾
cd electrical-law-app

# 安裝套件（需要幾分鐘）
npm install

# 建立環境變數檔案
cp .env.example .env.local
```

用文字編輯器開啟 `.env.local`，將 `sk-ant-xxxxxxx` 換成你的真實 API Key：

```
ANTHROPIC_API_KEY=sk-ant-你的真實金鑰
```

儲存後，啟動開發伺服器：

```bash
npm run dev
```

開啟瀏覽器前往 http://localhost:3000，確認功能正常。

---

## 第四步：上傳到 GitHub

1. 前往 https://github.com/ 註冊帳號
2. 點右上角「+」→「New repository」
3. 名稱輸入 `electrical-law-app`，選「Private」（私人），點「Create」
4. 回到終端機，輸入：

```bash
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/你的帳號/electrical-law-app.git
git push -u origin main
```

---

## 第五步：部署到 Vercel

1. 前往 https://vercel.com/，點「Sign Up」→ 選「Continue with GitHub」
2. 登入後點「Add New Project」
3. 找到 `electrical-law-app`，點「Import」
4. **重要：設定環境變數**
   - 展開「Environment Variables」
   - Name 輸入：`ANTHROPIC_API_KEY`
   - Value 貼上你的 API Key
   - 點「Add」
5. 點「Deploy」，等待約 1 分鐘

部署完成後，Vercel 會給你一個網址，例如：
`https://electrical-law-app.vercel.app`

**這個網址手機、平板、電腦都能開啟使用！**

---

## 更新法規文件

每次法規修正後，只需要在網站介面上傳新的 PDF 即可，不需要修改程式碼。

## 更新程式碼

若需要修改功能，改完後執行：

```bash
git add .
git commit -m "更新說明"
git push
```

Vercel 會自動重新部署，約 1 分鐘後生效。

---

## 遇到問題？

- Vercel 部署失敗：檢查 API Key 是否正確設定
- PDF 無法解析：確認 PDF 是文字版（非掃描圖片）
- 費用查詢：前往 https://console.anthropic.com/billing
