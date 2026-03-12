# ⛓ 受理報案輔助系統 v1.0

專為台灣警方派出所第一線受理報案設計的數位鑑識輔助工具。

## 功能

- **本地 OCR 辨識** — Tesseract.js 瀏覽器端引擎，支援繁體中文+英文，**敏感截圖不外流**
- **規則引擎擷取** — 自動偵測錢包地址、TxHash、銀行帳號、網址、金額、時間、電話等
- **密碼學驗證** — EIP-55 Checksum (ETH)、Base58Check (BTC/TRON)、Bech32 (SegWit)
- **鏈上查詢** — Etherscan / TronScan / Blockchain.info API 查詢真實餘額與交易紀錄
- **交易帳本下載** — 一鍵下載錢包資料與交易紀錄 CSV
- **人工校對** — 逐欄確認/修改/駁回，含信心分數與驗證狀態
- **資料持久化** — IndexedDB 本地儲存，重新整理不消失
- **全程稽核** — 所有操作寫入 Audit Log

## 部署（Vercel）

### 1. 推送到 GitHub

```bash
git init
git remote add origin https://github.com/cibnata/case_filing_assist.git
git add .
git commit -m "feat: 受理報案輔助系統 v1.0"
git branch -M main
git push -u origin main --force
```

### 2. 設定 Vercel

1. 登入 [vercel.com](https://vercel.com) → Import `cibnata/case_filing_assist`
2. Framework: **Vite**（自動偵測）
3. **環境變數**（Settings → Environment Variables）：

| 變數名稱 | 必要性 | 說明 |
|----------|--------|------|
| `ETHERSCAN_API_KEY` | 建議 | Etherscan 免費 API Key（ETH 查詢用）|
| `TRONSCAN_API_KEY` | 選填 | TronScan API Key（TRON 查詢用）|

> **OCR 辨識不需要任何 API Key**，完全在瀏覽器本地執行。

4. 點 **Deploy**

### 3. 取得 API Key

- **Etherscan**: [etherscan.io/apis](https://etherscan.io/apis) → 免費註冊
- **TronScan**: [tronscan.org](https://tronscan.org/)

## 本地開發

```bash
npm install

# 使用 Vercel CLI（含 serverless functions）
npx vercel dev

# 或純前端開發
npm run dev
```

## 專案結構

```
├── api/                    # Vercel Serverless Functions
│   ├── wallet.js          #   區塊鏈錢包查詢
│   └── transactions.js    #   區塊鏈交易紀錄查詢
├── src/
│   ├── App.jsx            # 主應用程式
│   ├── main.jsx           # React 入口
│   └── lib/
│       ├── ocr.js         #   Tesseract.js OCR + 規則引擎擷取
│       ├── db.js          #   IndexedDB 持久化層（Dexie）
│       ├── validate.js    #   密碼學地址驗證
│       └── api.js         #   區塊鏈 API 呼叫
├── docs/                   # 開發規格文件
└── vercel.json             # Vercel 部署設定
```

## 技術棧

| 層級 | 技術 |
|------|------|
| 前端 | React 18 + Vite |
| OCR 引擎 | **Tesseract.js 5**（瀏覽器端 WASM，繁中+英文） |
| 情資擷取 | 規則引擎（Regex Pattern + 脈絡分析） |
| 資料持久化 | IndexedDB (Dexie.js) |
| 區塊鏈 API | Etherscan / TronScan / Blockchain.info |
| 密碼學驗證 | js-sha3 (Keccak-256) + Web Crypto API (SHA-256) |
| 部署 | Vercel (Serverless Functions) |

## 安全特性

- **OCR 完全本地執行** — 截圖影像不會傳送到任何外部伺服器
- **IndexedDB 本地儲存** — 案件資料存在員警自己的瀏覽器中
- **鏈上查詢走 Serverless** — API Key 安全存放在 Vercel 環境變數


## Frontend API environment variables

Create a `.env` file in project root if frontend cannot reach OCR/LLM services:

```
VITE_OCR_API_BASE=http://localhost:8000
VITE_LLM_API_BASE=http://localhost:8001
```

For `backend/ocr_server/suryaocr_Server.py`, optional PDF dependency path:

```
POPPLER_PATH=/usr/bin
```


### OCR `Failed to fetch` quick fix

- Dev mode now supports proxy paths by default:
  - OCR: `/ocr-api` -> `http://localhost:8000`
  - LLM: `/llm-api` -> `http://localhost:8001`
- Frontend will try multiple endpoints in order: env var -> proxy path -> localhost fallback.

