import express from "express";
import OpenAI from "openai";

const router = express.Router();
let client = null;

// 設定台灣的地理位置資訊
const userLocation = {
    type: "approximate",      // 必要參數：表示提供的是大致的地理位置資訊
    country: "TW",           // 台灣的 ISO 國家代碼
    city: "Taipei",               // 城市名稱（可從 query 參數指定）
    region: "Taiwan",          // 地區名稱
    timezone: "Asia/Taipei"    // IANA 時區
};

export function getOpenAI() {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY not available");
    }

    if (!client) {
        client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        });
    }

    return client;
}

router.get("/chat", async (req, res) => {
    const openai = getOpenAI();

    const response = await openai.responses.create({
        model: "gpt-4o-mini",
        //model: "gpt-5-nano",
        instructions: "你將會收到一段文字，你的任務是把它翻譯成表情符號。不要使用任何普通文字，盡量只用表情符號。",
        input: "今天的天氣真美麗", //今天的天氣是陰天
    });

    res.json(response.output_text);
});

router.get("/role", async (req, res) => {
  const input = [
    {
      role: "user",
      content: "嗨！我叫 wayne，你現在在做什麼？"
    },
    {
      role: "assistant",
      content: "我正在等你提出問題，需要什麼幫忙嗎？"
    },
    {
      role: "user",
      content: "你記得我叫什麼名字嗎？"
    }
  ];
	const response = await openai.responses.create({
		model: "gpt-4o-mini",
		instructions: "你是 LINE AI 小幫手，回覆要親切並使用繁體中文。", 
		input: input,
	});
  res.json({ response: response.output_text });
});

router.get("/prompt", async (req, res) => {
    // 定義 Prompt 
    const template = `根據以下上下文回答問題。
        如果無法根據提供的信息回答，請回答"我不知道"。
        
        上下文: 大型語言模型(LLM)是自然語言處理中最新使用的模型。
        與較小的模型相比，它們出色的性能使它們對於構建支持自然語言處理的應用程序的開發人員非常有用。
        這些模型可以通過 Hugging Face 的 transformers 庫、OpenAI 的 sdk 來開發。
        
        問題: {query}
        回答:
    `;

    const query = req.query.q || "請問蘋果的英文單字？";
    const prompt = template.replace("{query}", query);

    const response = await openai.responses.create({
        model: "gpt-4o-mini",
        instructions: "你是 LINE AI 小幫手，使用繁體中文，並根據提供的上下文回答。",
        input: [
            {
                role: "user",
                content: prompt
            }
        ]
    });

    res.json({
        response: response.output_text
    });
});

router.get("/fewshot", async (req, res) => {
    const template = `
        你是一個文字情緒字眼分析系統，負責從文字中找出帶有情緒的字眼，並判斷整體語氣。

        規則：
        - 如果文字中沒有明顯的情緒字眼，請回覆：「我不知道」。
        - 回覆格式需包含：
        分析：
        情緒字眼：
        情緒判斷：正面 / 負面 / 中性

        範例 1
        文字：今天真的好沮喪，整個人提不起勁。
        分析：句子中包含明顯的負面情緒描述，語氣低落。
        情緒字眼：沮喪、提不起勁
        情緒判斷：負面

        範例 2
        文字：我超期待明天的旅行，真的好興奮！
        分析：文字中含有正向期待與興奮的語氣。
        情緒字眼：期待、興奮
        情緒判斷：正面

        請依照相同格式分析以下文字：

        文字：{query}
        分析：
        情緒字眼：
        情緒判斷：
        `;
    const query = req.query.q;
    const prompt = template.replace("{query}", query);
  
    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      instructions: "你是一個情緒字眼分析 AI，負責辨識文字中的情緒字眼並判斷情緒傾向，並使用繁體中文回答。",
      input: [
        {
          role: "user",
          content: prompt
        }
      ]
    });
  
    res.json({
      response: response.output_text
    });
});

router.get("/webSearch", async (req, res) => {
    let query = req.query.q || "";

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      instructions: "你是 LINE AI 聊天機器人，回覆要親切並使用繁體中文。",
      tools: [
        { 
          type: "web_search",
          user_location: userLocation
        },
      ],
      input: [
        {
          role: "user",
          content: query
        }
      ],
      include: [
        "web_search_call.action.sources"
      ]
    });
    // 印出關鍵資訊
    const hasWebSearch = response.output?.some(o => o.type === "web_search_call");
    console.log("是否有網路搜尋:", hasWebSearch);
    // console.log("Output Text:", response.output_text);
    const webSearchCall = response.output?.find(o => o.type === "web_search_call");
    if (webSearchCall?.action?.sources) {
      //console.log("搜尋來源:", webSearchCall.action.sources);
    }
    res.json({
      response: response.output_text
    });
});

router.get("/structured", async (req, res) => {
    const userInput = req.query.q || "我買了一台 iPhone 15 Pro，價格是 35900 元，顏色是藍色鈦金屬，很滿意！";
  
    const response = await openai.responses.create({
        model: "gpt-4o-mini",
        instructions: "你是一個產品評論分析助手，請從使用者輸入中提取產品資訊並輸出結構化 JSON。使用繁體中文。",
        input: [
            {
            role: "user",
            // content: `請分析以下評論 並輸出結構化 JSON：${userInput}`
            content: `請分析以下評論：${userInput}`
            }
        ],
        text: { 
            format: {
                type: "json_schema",
                name: "product_review",
                schema: zodResponseFormat(z.object({
                product_name: z.string(),
                price: z.number(),
                color: z.string(),
                features: z.array(z.string()), // 陣列欄位：產品特色列表
                }), "product_review").json_schema.schema
            }
        }
    });
  
    // 解析 JSON 輸出
    let parsedJson = null;
    try {
      parsedJson = JSON.parse(response.output_text);
    } catch (e) {
      console.error("JSON 解析失敗:", e);
    }
  
    res.json({
      output_text: parsedJson,
    });
});

router.get("/control", async (req, res) => {
    const userInput = req.query.q || "請形容咖啡的香氣";
    const response = await openai.responses.create({
        model: "gpt-4o-mini",
        instructions: "你是一個 LINE AI 聊天機器人，回覆要親切並使用繁體中文。",
        input: [
            {
              role: "user",
              content: userInput
            }
         ],
        // 控制回覆字數：限制最大輸出長度
        max_output_tokens: 500,
        
        // 控制創意指數：0.7 表示中等創意，適合一般對話
        // 可調整範圍：0.0（保守）到 2.0（高創意）
        temperature: 0.7,
        
        // 控制選詞範圍：0.9 表示考慮前 90% 機率的詞彙
        // 可調整範圍：0.1（嚴格選詞）到 1.0（考慮所有詞）
        top_p: 1,
    });

    res.json({
        response: response.output_text
    });
});

export default router;