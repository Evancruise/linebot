# LINE AI 聊天機器人

一個基於 Firebase Functions v2 和 OpenAI 的智能 LINE 聊天機器人，具備對話記憶、向量檢索（RAG）和長期記憶提取功能。

## 📋 目錄

- [功能特色](#功能特色)
- [技術架構](#技術架構)
- [專案結構](#專案結構)
- [環境需求](#環境需求)
- [安裝與設定](#安裝與設定)
- [部署](#部署)
- [使用說明](#使用說明)
- [API 端點](#api-端點)
- [開發指南](#開發指南)

## ✨ 功能特色

### 🤖 核心功能
- **智能對話**：使用 OpenAI GPT-4o-mini 模型進行自然語言對話
- **友善幽默**：預設友善、幽默的對話風格，可自訂提示詞
- **自動搜尋**：當使用者詢問需要最新資訊的問題時，可自動使用網路搜尋功能

### 🧠 記憶系統
- **短期記憶**：保存最近 20 輪對話記錄，維持對話上下文
- **向量記憶（RAG）**：使用向量相似度檢索相關歷史對話，提供上下文感知的回覆
- **長期記憶提取**：自動判斷並儲存使用者的偏好、身分、習慣等重要資訊

### 🔧 技術特點
- **Firebase Functions v2**：使用最新的 Firebase Functions 架構
- **Firestore 整合**：對話記錄和向量記憶儲存在 Firestore
- **模組化設計**：功能拆分為獨立模組，易於維護和擴展

## 🏗️ 技術架構

```
┌─────────────┐
│  LINE 用戶   │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ Firebase Functions│
│  (Express Router) │
└──────┬──────────┘
       │
       ├──► LINE Bot SDK ──► LINE Platform
       │
       ├──► OpenAI API ──► GPT-4o-mini
       │
       └──► Firestore ──► 記憶儲存
            ├── 短期記憶 (對話記錄)
            └── 向量記憶 (RAG)
```

## 📁 專案結構

```
line_bot/
├── functions/                    # Firebase Functions 程式碼
│   ├── api/                      # API 路由模組
│   │   ├── linebot_ai.js        # 主要 LINE AI 聊天機器人
│   │   ├── memoryService.js     # 記憶服務（短期+向量記憶）
│   │   ├── memoryExtractor.js   # 長期記憶提取器
│   │   ├── openAIClient.js      # OpenAI 客戶端
│   │   ├── lineConfig.js        # LINE 配置
│   │   ├── embeddings.js        # 文字嵌入功能
│   │   ├── openai.js            # OpenAI 測試路由
│   │   └── ...
│   ├── index.js                 # Functions 入口點
│   └── package.json             # 依賴套件
├── public/                       # 靜態檔案（Firebase Hosting）
│   └── mbti_data.json           # MBTI 資料（範例）
├── firebase.json                # Firebase 設定檔
└── README.md                    # 本檔案
```

## 🔧 環境需求

- **Node.js**: 24.x
- **Firebase CLI**: 最新版本
- **Firebase 專案**: 已建立並啟用 Functions 和 Firestore
- **LINE Developers 帳號**: 用於建立 LINE Bot
- **OpenAI API Key**: 用於 GPT 模型

## 📦 安裝與設定

### 1. 安裝依賴

```bash
cd functions
npm install
```

### 2. Firebase 設定

確保已登入 Firebase CLI：

```bash
firebase login
firebase use --add  # 選擇你的 Firebase 專案
```

### 3. 設定 Firebase Secrets

在 Firebase Console 設定以下 Secrets（或使用 CLI）：

```bash
firebase functions:secrets:set LINE_SECRET
firebase functions:secrets:set LINE_ACCESS_TOKEN
firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set GCLOUD_PROJECT_ID
firebase functions:secrets:set FIRESTORE_DATABASE_ID
```

### 4. LINE Bot 設定

1. 前往 [LINE Developers Console](https://developers.line.biz/)
2. 建立新的 Provider 和 Channel
3. 取得 **Channel Secret** 和 **Channel Access Token**
4. 設定 Webhook URL：`https://YOUR-PROJECT.cloudfunctions.net/api/linebot_ai`

### 5. Firestore 設定

確保 Firestore 已啟用，並設定適當的安全規則。專案會自動建立以下集合：
- `linebot_memory`: 短期對話記憶
- `linebot_memory_vectors`: 向量記憶儲存

## 🚀 部署

### 本地開發

```bash
# 啟動 Firebase 模擬器
npm run serve

# 或使用 Firebase CLI
firebase emulators:start --only functions
```

本地測試網址：`http://127.0.0.1:5001/YOUR-PROJECT/asia-east1/api/linebot_ai`

### 部署到 Firebase

```bash
# 部署 Functions
npm run deploy

# 或使用 Firebase CLI
firebase deploy --only functions
```

部署後的網址：`https://YOUR-PROJECT.cloudfunctions.net/api/linebot_ai`

### 使用 ngrok 進行本地測試

```bash
# 啟動模擬器後，在另一個終端執行
npm run tunnel
# 或
ngrok http 5001
```

將 ngrok URL 設定到 LINE Webhook 設定頁面。

## 💬 使用說明

### 基本對話

使用者可以直接與機器人對話，機器人會：
1. 讀取短期記憶（最近 20 輪對話）
2. 檢索相關的向量記憶（RAG）
3. 生成回應
4. 儲存對話記錄

### 記憶功能

- **短期記憶**：自動保存最近對話，無需額外設定
- **長期記憶**：機器人會自動判斷使用者訊息中是否包含值得長期記住的資訊（如偏好、身分、習慣等），並自動提取儲存

### 自訂提示詞

編輯 `functions/api/linebot_ai.js` 中的 `system` 變數（約第 66-68 行）來自訂機器人的個性和行為：

```javascript
const system = `你是友善、幽默、使用繁體中文的 LINE 助手。
你會參考「檢索到的記憶」來回答，但若記憶不足或不相關，就以使用者當下訊息為主。
`;
```

## 🔌 API 端點

### LINE Webhook

- **路徑**: `/linebot_ai`
- **方法**: `POST`
- **用途**: 接收 LINE 平台發送的訊息事件

### Health Check

- **路徑**: `/linebot_ai`
- **方法**: `GET`
- **回應**: `"我是 linebot_ai webhook"`

## 🛠️ 開發指南

### 主要模組說明

#### `linebot_ai.js`
主要的 LINE Bot 路由處理器，負責：
- 接收 LINE Webhook 事件
- 處理使用者訊息
- 整合記憶系統和 OpenAI API
- 回覆使用者

#### `memoryService.js`
記憶管理服務，提供：
- `loadMemory()`: 載入短期對話記憶
- `appendMemory()`: 新增對話記錄
- `upsertVectorMemory()`: 儲存向量記憶
- `queryVectorMemory()`: 檢索相關向量記憶

#### `memoryExtractor.js`
長期記憶提取器，使用 LLM 判斷使用者訊息是否包含值得長期記住的資訊。

#### `openAIClient.js`
OpenAI API 客戶端單例，確保只建立一個連線。

#### `embeddings.js`
文字嵌入功能，將文字轉換為向量用於相似度搜尋。

### 新增功能

1. 在 `functions/api/` 建立新的路由檔案
2. 在 `functions/index.js` 中引入並掛載路由
3. 如需新的 Secrets，在 `functions/index.js` 的 `secrets` 陣列中新增

### 測試

```bash
# 使用 Firebase 模擬器測試
npm run serve

# 查看 Functions 日誌
npm run logs
```

## 📝 注意事項

1. **Secrets 管理**：所有敏感資訊都使用 Firebase Secrets 管理，不會寫在程式碼中
2. **記憶限制**：短期記憶預設保留最近 20 輪對話，可在 `memoryService.js` 中調整 `MAX_MEMORY_LENGTH`
3. **向量檢索**：相似度分數低於 0.25 的記憶不會被使用，可在 `linebot_ai.js` 中調整
4. **長期記憶提取**：只有信心度 >= 0.6 的記憶才會被儲存，可在 `linebot_ai.js` 中調整

## 🔒 安全建議

- 定期更新依賴套件
- 使用 Firebase Security Rules 保護 Firestore 資料
- 不要在程式碼中硬編碼 API Keys
- 定期檢查 Firebase Functions 日誌

## 📄 授權

本專案為私有專案。

## 🤝 貢獻

歡迎提交 Issue 或 Pull Request。

## 📧 聯絡方式

如有問題，請透過 Firebase Console 或專案維護者聯絡。

---

**最後更新**: 2024

