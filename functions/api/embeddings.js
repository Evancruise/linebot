import { getOpenAI } from "./openAIClient.js";

export async function embedText(text) {
    const openai = getOpenAI();

    // 建議: text-embedding-3-small
    const r = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
    });

    return r.data[0].embedding;
}