import { getOpenAI } from "./openAIClient.js";

/**
 * 用 LLM 判斷是否值得存為長期記憶
 * 並萃取 "適合被記住的一句話"
 */
export async function extractLongTermMemory(userMessage) {
    const openai = getOpenAI();

    const systemPrompt = `
    你是一個「對話記憶萃取器（Memory Extractor）」。
    你的任務是判斷使用者的一句話是否包含「值得長期記住的資訊」。

    【什麼該記住】
    - 使用者的長期偏好（例如：喜歡 / 不喜歡 / 習慣）
    - 使用者的身分或背景（例如：職業、角色）
    - 使用者對助理的固定指示（例如：之後請用繁體中文）
    - 穩定不易改變的事實

    【什麼不該記住】
    - 閒聊
    - 情緒性發言
    - 問題本身
    - 一次性請求
    - 暫時狀態（例如：我今天很累）

    【輸出格式（JSON，且只能輸出 JSON）】
    {
    "store": true | false,
    "text": "若 store=true，請輸出『適合被長期記住的一句話』",
    "type": "preference | profile | instruction | fact | other",
    "confidence": 0.0 ~ 1.0
    }
    `;

    const response = await openai.responses.create({
        model: "gpt-4o-mini",
        input: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage }
        ],
        temperature: 0, // 判斷行任務一定要 0
        max_output_tokens: 200,
    });

    let result;

    try {
        result = JSON.parse(response.output_text);
    } catch (e) {
        // 防呆: 解析失敗不存
        return { store: false };
    }

    // 基本防呆
    if (!result || result.store !== true) {
        return { store: false };
    }

    if (!result.text || result.text.length < 4) {
        return { store: false };
    }

    return result;
};
