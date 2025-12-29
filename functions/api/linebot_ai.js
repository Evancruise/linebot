import express from "express";
import * as line from "@line/bot-sdk";
import { getOpenAI } from "./openAIClient.js";
import { loadMemory, appendMemory, upsertVectorMemory, queryVectorMemory } from "./memoryService.js";
import { getLineConfig } from "./lineConfig.js";
import { extractLongTermMemory } from "./memoryExtractor.js";

// import OpenAI from "openai";
import admin from "firebase-admin";
import { embedText } from "./embeddings.js";

// const MEMORY_COLLECTION = "line_memory";
// const VECTOR_ROOT = "linebot_memory_vectors";

const router = express.Router();
let db = null;
const appName = `app-${process.env.FIRESTORE_DATABASE_ID}`;

if (!admin.apps.length) {
    admin.initializeApp(
        {
            projectId: process.env.GCLOUD_PROJECT_ID,
        },
        // appName
    );

    db = admin.firestore();
}

router.get("/", (req, res) => {
    res.send("我是 linebot_ai webhook");
});

// const memory_linebot_ai = {} //實作記憶功能
// const MAX_MEMORY_LENGTH = 20; // 每個對話最多保留 20 輪（10 組問答）

router.post(
    "/",
    (req, res, next) => {
        const config = getLineConfig();
        return line.middleware(config)(req, res, next);
    },
    async (req, res) => {
        res.sendStatus(200);

        console.log("Firestore project:", admin.app().options.projectId);

        const config = getLineConfig();
        const client = new line.messagingApi.MessagingApiClient(config);
        const openai = getOpenAI();

        const events = req.body.events || [];
        for (const event of events) {
            if (event.type !== "message" || event.message.type !== "text")
                continue;

            const userMessage = event.message.text.trim();
            const conversationId = getConversationId(event.source);

            if (!conversationId) continue;

            try {
                // 短期記憶
                const memory = await loadMemory(conversationId, db);

                // 向量檢索
                let hits = [];
                
                try {
                    const qEmb = await embedText(userMessage);
                    hits = await queryVectorMemory(conversationId, qEmb, 5);
                } catch (e) {
                    console.warn("RAG disabled for this turn:", e.message);
                }

                const ragContext = hits
                    .filter(h => h.score > 0.25)
                    .map((h, i) => `[記憶${i + 1}|相似度${h.score.toFixed(2)}] ${h.text}`)
                    .join("\n");
                
                const system = `你是友善、幽默、使用繁體中文的 LINE 助手。
                你會參考「檢索到的記憶」來回答，但若記憶不足或不相關，就以使用者當下訊息為主。
                `;
                
                const messages = [
                    { role: "system", content: system },
                    ...(ragContext
                        ? [{ role: "system", content: `以下是檢索到的記憶 (可能有用):\n${ragContext}`}]
                        : []),
                    ...memory,
                    { role: "user", content: userMessage },
                ];
                
                // 呼叫模型
                const response = await openai.responses.create({
                    model: "gpt-4o-mini",
                    input: messages,
                    temperature: 0.7,
                    max_output_tokens: 800,
                });

                const aiText = response.output_text || "我剛剛想了一下，但有點卡住"; 
                
                // 寫回短期記憶
                await appendMemory(conversationId, db, "user", userMessage);
                await appendMemory(conversationId, db, "assistant", aiText);

                // 寫回向量記憶
                /*
                if (shouldStoreToLongTerm(userMessage)) {
                    await upsertVectorMemory(conversationId, {
                        text: userMessage,
                        embedding: qEmb,
                        meta: { type: "user_fact_candidate" },
                    });
                }
                */
                
                const memoryDecision = await extractLongTermMemory(userMessage);

                if (memoryDecision.store && memoryDecision.confidence >= 0.6) {
                    const emb = await embedText(memoryDecision.text);
                
                    await upsertVectorMemory(
                        conversationId, 
                        db,
                        {
                            text: memoryDecision.text,
                            embedding: emb,
                            meta: {
                                type: memoryDecision.type,
                                confidence: memoryDecision.confidence,
                                source: "llm_extractor",
                            },
                        }
                    );
                }
                
                // 回覆 LINE
                await client.replyMessage({
                    replyToken: event.replyToken,
                    messages: [{ type: "text", text: aiText }],
                });

            } catch (err) {
                console.error("RAG error:", err);
                await client.replyMessage({
                    replyToken: event.replyToken,
                    messages: [{ type: "text", text: "系統忙碌中，請再試一次"}],
                });
            }   
        }
    }
);

function getConversationId(source) {
    if (source.type === "user") return source.userId;
    if (source.type === "group") return source.groupId;
    if (source.type === "room") return source.roomId;
    return null;
}

/*
let openaiClient = null;

function getOpenAI() {

    if (!openaiClient) {
        openaiClient = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }

    return openaiClient;
}
*/

// 處理 line webhook
/**
 * LINE webhook（production）
 */

/*
router.post(
    "/",
    (req, res, next) => {
        try {
            console.log("Webhook middleware hit");
            const config = getLineConfig();
            return line.middleware(config)(req, res, next);
        } catch (err) {
            console.error("Middleware error:", err);
            return res.sendStatus(500);
        }
    },
    async (req, res) => {

        const config = getLineConfig();
        const client = new line.messagingApi.MessagingApiClient(config);
        const openai = getOpenAI();

        const events = req.body.events || [];

        for (const event of events) {
            if (event.type !== "message" || event.message.type !== "text") continue;

            const userMessage = event.message.text.trim();

            if (userMessage === "/reset") {
                await clearMemory(groupId);
                await client.replyMessage({
                    replyToken: event.replyToken,
                    messages: [{ type: "text", text: "記憶已清除"}],
                });
                continue;
            }

            try {
                const aiResponse = await getAIResponse(userMessage, openai, event.source);

                await client.replyMessage({
                    replyToken: event.replyToken,
                    messages: [
                        {
                            type: "text",
                            text: aiResponse,
                        },
                    ],
                });
            } catch (err) {
                console.error("AI error:", err);
                await client.replyMessage({
                    replyToken: event.replyToken,
                    messages: [
                        { 
                            type: "text", 
                            text: "我剛剛有點忙，請再試一次 🙏" 
                        },
                    ],
                });
            }
        }
    }
);
*/

/**
 * 取得對話紀錄
 */
/*
async function loadMemory(groupId, limit = 20) {
    const docRef = db.collection(MEMORY_COLLECTION).doc(groupId);
    const doc = await docRef.get();

    if (!doc.exists()) return [];

    const messages = doc.data().messages || [];
    return messages.slice(-limit);
}
*/

/**
 * 新增一筆對話紀錄
 */
/*
async function appendMemory(groupId, role, content) {
    const docRef = db.collection(MEMORY_COLLECTION).doc(groupId);

    await docRef.set(
        {
            messages: admin.firestore.FieldValue.arrayUnion({
                role,
                content,
                ts: Date.now()
            }),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
    );
}
*/

/**
 * 清空對話紀錄 (可做 /reset 指令)
 */
/*
export async function clearMemory(groupId) {
    const ref = db.collection(MEMORY_COLLECTION).doc(groupId);
    await ref.delete();
}
*/

/**
 * 向量工具
 */

/*
function dot(a, b) {
    let s = 0;
    for (let i = 0; i < a.length, i++) {
        s += a[i] * b[i];
    }
    return s;
}

function l2norm(v) {
    return Math.sqrt(dot(v, v));
}

function cosineSim(a, aNorm, b, bNorm) {
    const denom = (aNorm || l2norm(a)) * (bNorm || l2norm(b));
    if (!denom) return 0;
    return dot(a, b) / denom;
}
*/

/**
 * 儲存一筆 "向量記憶"
 * @param {string} groupId userId/groupId/roomId
 * @param {object} item { text, embedding, meta }
 */

/*
export async function upsertVectorMemory(groupId, item) {
    const { text, embedding, meta = {} } = item;
    if (!text || !embedding?.length) throw new Error("Invalid vector memory item");

    const ref = db
        .collection(VECTOR_ROOT)
        .doc(groupId)
        .collection("items")
        .doc();
    
    const norm = l2norm(embedding);

    await ref.set({
        text,
        embedding,
        norm,
        meta,
        ts: Date.now(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return ref.id;
}
*/

/**
 * 檢索相似的向量記憶  (掃描 conversation 的 items)
 * @param {string} conversationId
 * @param {number[]} queryEmbedding
 * @param {number} topK
 */

/*
export async function queryVectorMemory(conversationId, queryEmebdding, topK = 5) {
    const qNorm = l2norm(queryEmbedding);

    const snap = await db
        .collection(VECTOR_ROOT)
        .doc(conversationId)
        .collection("items")
        .orderBy("ts", "desc")
        .limit(300)
        .get();
    
    const scored = [];
    snap.forEach((doc) => {
        const d = doc.data();
        if (!d.embedding?.length) return;
        const score = consineSim(queryEmbedding, qNorm, d.embedding, d.norm);
        scored.push({
            id: doc.id,
            score,
            text: d.text,
            meta: d.meta || {},
            ts: d.ts
        });
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
}
*/

/**
 * 調用 OpenAI 獲取 AI 回應
 * 當需要搜尋資料時，會自動使用 web_search tool
 */

/*
async function getAIResponse(userMessage, openai, source) {

    // memory 是記憶的陣列，包含使用者訊息和 AI 回應，先初始化使用者訊息
    let memory = [{
        role: "user",
        content: userMessage
    }];

    const memory = await loadMemory(conversationId);

    // ② 組合 prompt
    const messages = [
      {
        role: "system",
        content:
          "你是一個友善、幽默、使用繁體中文的 LINE AI 聊天機器人。",
      },
      ...memory,
      { role: "user", content: userMessage },
    ];
    
    const groupId = getPushTargetFromSource(source);

    if (groupId) {
        let memory = await loadMemory(groupId, MAX_MEMORY_LENGTH);
        memory.push({ role: "user", content: userMessage });

        // 更新 memory 變數為限制後的陣列
        console.log("目前記憶:", memory);
    }

    // 設定台灣的地理位置資訊（用於 web_search）
    const userLocation = {
        type: "approximate",
        country: "TW",
        city: "Taipei",
        region: "Taiwan",
        timezone: "Asia/Taipei"
    };

    // 友善、幽默的提示詞
    const instructions = `你是一個友善、幽默的 LINE AI 聊天機器人助手。你的特點是：
- 回覆要親切、溫暖，就像跟朋友聊天一樣
- 適度使用幽默感，讓對話更有趣（但不要太過頭）
- 使用繁體中文回覆
- 回答要簡潔明瞭，不要過於冗長
- 如果使用者問到需要最新資訊的問題（如：天氣、新聞、股價、時事等），你會自動使用網路搜尋功能來獲取最新資料
- 保持輕鬆愉快的對話氛圍`;

    const response = await openai.responses.create({
        model: "gpt-4o-mini",
        instructions: instructions,
        tools: [
            {
                type: "web_search",
                user_location: userLocation
            },
        ],
        input: messages,
        include: [
            "web_search_call.action.sources"
        ],
        // 控制回覆的創意度和長度
        temperature: 0.7, // 中等創意，適合友善幽默的對話
        max_output_tokens: 1000, // 限制回覆長度，保持簡潔
    });

    // 檢查是否有使用網路搜尋
    const hasWebSearch = response.output?.some(o => o.type === "web_search_call");
    if (hasWebSearch) {
        console.log("已使用網路搜尋功能");
        const webSearchCall = response.output?.find(o => o.type === "web_search_call");
        if (webSearchCall?.action?.sources) {
            console.log("搜尋來源數量:", webSearchCall.action.sources.length);
        }
    }

    // 保存 AI 回應到記憶
    if (groupId) {
        memory_linebot_ai[groupId].push({
            role: "assistant",
            content: response.output_text
        });
        // 限制記憶長度（只保留最近的對話記錄）
        memory_linebot_ai[groupId] = memory_linebot_ai[groupId].slice(-MAX_MEMORY_LENGTH);
        console.log("更新後的記憶:", memory_linebot_ai[groupId]);
    }

    const aiText = response.output_text;

    await appendMemory(groupId, "user", userMessage);
    await appendMemory(groupId, "assistant", aiText);

    return aiText;
}
*/

/*
function getPushTargetFromSource(source) {
    if (source.type === "user" && source.userId) return source.userId;
    if (source.type === "group" && source.groupId) return source.groupId;
    if (source.type === "room" && source.roomId) return source.roomId;
    return undefined;
}
*/

export default router;