/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { onRequest } from "firebase-functions/https";
import { defineSecret } from "firebase-functions/params";

import express from "express";

// import indexRouter from "./api/index.js";
// import linebotDemoRouter from "./api/linebot_demo.js";
// import linebotMbtiRouter from "./api/linebot_mbti.js";
import linebotAiRouter from "./api/linebot_ai.js";
// import openaiRouter from "./api/openai.js";

const app = express();

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// app.use("/", indexRouter);

// 正式網址: https://67021954e997.ngrok-free.app/line_demo
// 測試網址: http://127.0.0.1:5001/line-ai-da48a/asia-east1/api

// app.use("/linebot_demo", linebotDemoRouter);
// app.use("/linebot_mbti", linebotMbtiRouter);
// app.use("/linebot_ai", linebotAiRouter);
app.use("/linebot_ai", express.raw({ type: "application/json" }), linebotAiRouter);

//openai 測試用
// app.use("/openai",openaiRouter);

export const api = onRequest({
  region: "asia-east1",
  cors: false,
  minInstances: 0,
  secrets: [defineSecret("LINE_SECRET"), defineSecret("LINE_ACCESS_TOKEN"), defineSecret("OPENAI_API_KEY"), defineSecret("GCLOUD_PROJECT_ID"), defineSecret("FIRESTORE_DATABASE_ID")],
}, app);