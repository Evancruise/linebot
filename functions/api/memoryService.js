import * as line from "@line/bot-sdk";
import admin from "firebase-admin";

const MEMORY_COLLECTION = "linebot_memory";
const VECTOR_ROOT = "linebot_memory_vectors";

const MAX_MEMORY_LENGTH = 20;

/**
 * 取得對話紀錄
 */
export async function loadMemory(groupId, db, limit = MAX_MEMORY_LENGTH) {
    const docRef = db.collection(MEMORY_COLLECTION).doc(groupId);
    const snap = await docRef.get();
  
    if (!snap.exists) return [];
  
    const messages = snap.data().messages || [];

    return messages
      .slice(-limit)
      .map(m => ({
        role: m.role,
        content: m.content,
    }));
}

/**
 * 新增一筆對話紀錄
 */
export async function appendMemory(groupId, db, role, content) {
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

/**
 * 儲存一筆 "向量記憶"
 * @param {string} groupId userId/groupId/roomId
 * @param {object} item { text, embedding, meta }
 */
export async function upsertVectorMemory(groupId, db, item) {
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

/**
 * 檢索相似的向量記憶  (掃描 conversation 的 items)
 * @param {string} conversationId
 * @param {number[]} queryEmbedding
 * @param {number} topK
 */

export async function queryVectorMemory(conversationId, db, queryEmbedding, topK = 5) {
    try {
      const rootRef = db.collection(VECTOR_ROOT).doc(conversationId);
      const rootSnap = await rootRef.get();
      if (!rootSnap.exists) return [];
  
      const qNorm = l2norm(queryEmbedding);
  
      const snap = await rootRef
        .collection("items")
        .orderBy("ts", "desc")
        .limit(300)
        .get();
  
      if (snap.empty) return [];
  
      const scored = [];
      snap.forEach((doc) => {
        const d = doc.data();
        if (!Array.isArray(d.embedding)) return;
  
        const score = cosineSim(queryEmbedding, qNorm, d.embedding, d.norm);
        scored.push({
          id: doc.id,
          score,
          text: d.text,
          meta: d.meta || {},
        });
      });
  
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, topK);
    } catch (e) {
      console.warn("RAG disabled for this request:", e.message);
      return [];
    }
}

function dot(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
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