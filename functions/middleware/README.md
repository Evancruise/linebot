# Middleware 使用指南

本資料夾包含各種可重用的 Express Middleware，用於增強 API 的安全性、效能和可維護性。

## 📁 檔案結構

```
middleware/
├── index.js              # 統一匯出所有 middleware
├── auth.js              # 認證相關（JWT, OAuth, API Key）
├── rateLimiter.js       # 速率限制
├── errorHandler.js      # 錯誤處理
├── logger.js            # 日誌記錄
└── demo.js              # 範例 middleware
```

## 🔐 認證 Middleware (`auth.js`)

### JWT 驗證

```javascript
import { createJwtAuth } from "./middleware/auth.js";

// 必需驗證（預設）
app.use("/api/protected", createJwtAuth({
  secret: process.env.JWT_SECRET,
}));

// 可選驗證（允許未認證使用者）
app.use("/api/public", createJwtAuth({
  secret: process.env.JWT_SECRET,
  required: false,
}));

// 使用時，req.user 會包含解碼後的 JWT payload
router.get("/profile", createJwtAuth(), (req, res) => {
  res.json({ user: req.user });
});
```

### API Key 驗證

```javascript
import { createApiKeyAuth } from "./middleware/auth.js";

app.use("/api/external", createApiKeyAuth({
  apiKeys: process.env.API_KEYS?.split(",") || [],
  headerName: "x-api-key", // 預設
}));
```

### 角色權限檢查

```javascript
import { createJwtAuth, requireRole } from "./middleware/auth.js";

// 先驗證 JWT，再檢查角色
router.get("/admin", 
  createJwtAuth(),
  requireRole("admin"),
  (req, res) => {
    res.json({ message: "Admin only" });
  }
);

// 允許多個角色
router.get("/moderator", 
  createJwtAuth(),
  requireRole(["admin", "moderator"]),
  (req, res) => {
    res.json({ message: "Moderator or Admin" });
  }
);
```

## ⚡ 速率限制 (`rateLimiter.js`)

### 記憶體版本（單一實例）

```javascript
import { createRateLimiter } from "./middleware/rateLimiter.js";

app.use("/api/", createRateLimiter({
  windowMs: 60 * 1000,    // 1 分鐘
  maxRequests: 60,         // 最多 60 次請求
  keyGenerator: (req) => req.ip, // 使用 IP 作為 key
}));
```

### Firestore 版本（多實例部署）

```javascript
import { createFirestoreRateLimiter } from "./middleware/rateLimiter.js";
import admin from "firebase-admin";

const db = admin.firestore();

app.use("/api/", createFirestoreRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
  db: db,
  keyGenerator: (req) => {
    // 可以根據使用者 ID 或其他條件產生 key
    return req.user?.id || req.ip;
  },
}));
```

## 📝 日誌記錄 (`logger.js`)

```javascript
import { requestLogger, errorLogger } from "./middleware/logger.js";

// 記錄所有請求
app.use(requestLogger({
  logLevel: "info",
  includeBody: false,      // 是否記錄請求 body
  includeHeaders: false,   // 是否記錄 headers
  skipPaths: ["/health"], // 跳過記錄的路徑
}));

// 錯誤日誌（放在錯誤處理之前）
app.use(errorLogger);
```

## 🚨 錯誤處理 (`errorHandler.js`)

```javascript
import { 
  AppError, 
  asyncHandler, 
  errorHandler, 
  notFoundHandler 
} from "./middleware/errorHandler.js";

// 使用 asyncHandler 包裝 async 路由
router.get("/users/:id", asyncHandler(async (req, res, next) => {
  const user = await getUserById(req.params.id);
  if (!user) {
    throw new AppError("使用者不存在", 404, "USER_NOT_FOUND");
  }
  res.json(user);
}));

// 404 處理（放在所有路由之後）
app.use(notFoundHandler);

// 錯誤處理（必須放在最後）
app.use(errorHandler);
```

### 自訂錯誤

```javascript
import { AppError } from "./middleware/errorHandler.js";

router.post("/users", asyncHandler(async (req, res) => {
  if (!req.body.email) {
    throw new AppError("Email 為必填欄位", 400, "VALIDATION_ERROR");
  }
  
  // 業務邏輯...
}));
```

## 🔄 完整使用範例

```javascript
import express from "express";
import { 
  createJwtAuth,
  createRateLimiter,
  requestLogger,
  errorHandler,
  notFoundHandler,
  asyncHandler,
  AppError
} from "./middleware/index.js";

const app = express();

// 1. 日誌記錄（最前面）
app.use(requestLogger());

// 2. 速率限制
app.use("/api/", createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
}));

// 3. 路由
app.get("/api/public", (req, res) => {
  res.json({ message: "公開 API" });
});

app.get("/api/protected", 
  createJwtAuth(),
  asyncHandler(async (req, res) => {
    res.json({ 
      message: "受保護的 API",
      user: req.user 
    });
  })
);

// 4. 404 處理
app.use(notFoundHandler);

// 5. 錯誤處理（最後）
app.use(errorHandler);
```

## 🔧 環境變數設定

在 Firebase Secrets 或 `.env` 中設定：

```bash
# JWT
JWT_SECRET=your-secret-key

# API Keys（多個用逗號分隔）
API_KEYS=key1,key2,key3

# OAuth
OAUTH_CLIENT_ID=your-client-id
```

## 📌 注意事項

1. **Middleware 順序很重要**：
   - 日誌記錄應該在最前面
   - 速率限制在認證之前
   - 認證在路由之前
   - 錯誤處理必須在最後

2. **Firestore Rate Limiter**：
   - 適合多實例部署
   - 需要定期清理過期記錄（可設定 Firestore TTL）

3. **JWT Secret**：
   - 必須使用 Firebase Secrets 管理
   - 不要寫死在程式碼中

4. **錯誤處理**：
   - 使用 `asyncHandler` 包裝所有 async 路由
   - 使用 `AppError` 建立自訂錯誤
   - `errorHandler` 必須放在所有路由之後

