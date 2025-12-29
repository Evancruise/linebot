import express from "express";
import dotenv from "dotenv";
import * as line from "@line/bot-sdk";
import admin from "firebase-admin";
import { getDownloadURL } from "firebase-admin/storage";

dotenv.config();

// 初始化 Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp();
}

// 取得 Firebase Storage 實例
const bucket = admin.storage().bucket();

// LINE Bot 設定
const config = {
    channelSecret: process.env.LINE_SECRET_BOB_V1,
    channelAccessToken: process.env.LINE_ACCESS_TOKEN_BOB_V1
};

const client = new line.messagingApi.MessagingApiClient(config);
const blobClient = new line.messagingApi.MessagingApiBlobClient(config);//用於下載檔案內容(linebot sdk 提供)

const router = express.Router();

router.get("/", (req, res) => {
    res.send("我是檔案上傳助理 webhook");
});

// 處理 LINE webhook
router.post("/", line.middleware(config), async (req, res) => {
    try {
        const events = req.body.events || [];
        
        for (const event of events) {
            // 處理所有檔案類型訊息（圖片、影片、音訊、檔案）
            if (event.type === "message") {
                const messageType = event.message.type;
                const supportedTypes = ["image", "video", "audio", "file"];
                
                if (supportedTypes.includes(messageType)) {
                    await handleFileMessage(event);
                }
            }
        }
        
        res.status(200).send('OK');
    } catch (error) {
        console.error('處理 webhook 時發生錯誤:', error);
        res.status(500).send('Error');
    }
});

/**
 * 取得來源 ID
 */
function getPushTargetFromSource(source) {
    if (source.type === "user" && source.userId) return { type: "user", id: source.userId };
    if (source.type === "group" && source.groupId) return { type: "group", id: source.groupId };
    if (source.type === "room" && source.roomId) return { type: "room", id: source.roomId };
    return undefined;
}

/**
 * 生成儲存路徑
 */
function getStoragePath(sourceInfo, messageId) {
    if (!sourceInfo) {
        // 如果無法判斷來源，使用預設路徑
        return `unknown/${messageId}`;
    }
    
    const prefix = sourceInfo.type === "group" ? "group" : "users";
    return `${prefix}/${sourceInfo.id}/${messageId}`;
}

/**
 * 下載檔案內容（共用函數）
 */
async function downloadMessageContent(messageId) {
    try {
        console.log('開始下載檔案內容:', messageId);
        
        // 使用 getMessageContentWithHttpInfo 來取得 HTTP headers（包含 Content-Type）
        const response = await blobClient.getMessageContentWithHttpInfo(messageId);
        
        // headers 是 Headers 物件，需要使用 .get() 方法來取得值
        const headers = response.httpResponse?.headers;
        let contentType = 'application/octet-stream';
        
        if (headers) {
            contentType = headers.get('content-type') || headers.get('Content-Type') || 'application/octet-stream';
        }
        
        console.log('偵測到的 Content-Type:', contentType);
        console.log('HTTP Status:', response.httpResponse?.status);
        
        const chunks = [];

        for await (const chunk of response.body) {
            chunks.push(chunk);
        }
        
        const buffer = Buffer.concat(chunks);
        console.log('下載完成，檔案大小:', (buffer.length / 1024).toFixed(2), 'KB');
        
        return { buffer, contentType };
    } catch (error) {
        console.error('下載訊息內容時發生錯誤:', error);
        throw new Error(`無法下載訊息內容: ${error.message}`);
    }
}

/**
 * 處理檔案訊息（統一處理圖片、影片、音訊、檔案）
 */
async function handleFileMessage(event) {
    try {
        const messageId = event.message.id;
        const sourceInfo = getPushTargetFromSource(event.source);
        const messageType = event.message.type;
        const originalFileName = event.message.fileName || '';
        const fileSize = event.message.fileSize || 0;
        const duration = event.message.duration || 0;

        // 下載檔案內容
        const { buffer, contentType } = await downloadMessageContent(messageId);
   
        // 生成儲存路徑
        const storageFileName = getStoragePath(sourceInfo, messageId);//用於生成儲存路徑
        const file = bucket.file(storageFileName);//用於上傳檔案到 Firebase Storage
        
        await file.save(buffer, {
            metadata: {
                contentType: contentType,
                metadata: {
                    messageType: messageType,
                    sourceType: sourceInfo?.type || 'unknown',
                    sourceId: sourceInfo?.id || 'unknown',
                    messageId: messageId,
                    originalFileName: originalFileName || '',
                    fileSize: fileSize.toString(),
                    duration: duration.toString(),
                    timestamp: new Date().toISOString()
                }
            }
        });
        
        // 取得可分享的下載網址
        const publicUrl = await getDownloadURL(file);
        console.log('檔案已上傳:', publicUrl);
        
        // 生成回覆訊息
        const fileSizeText = buffer.length >= 1024 * 1024 
            ? `${(buffer.length / 1024 / 1024).toFixed(2)} MB`
            : `${(buffer.length / 1024).toFixed(2)} KB`;
        
        let replyText = `✅ 檔案已成功上傳！\n\n`;
        if (originalFileName) {
            replyText += `原始檔名: ${originalFileName}\n`;
        }
        replyText += `下載路徑: ${publicUrl}\n`;
        replyText += `檔案大小: ${fileSizeText}`;
        if (duration > 0 && messageType === 'audio') {
            replyText += `\n時長: ${Math.floor(duration / 1000)} 秒`;
        }
        
        // 回覆使用者
        await client.replyMessage({
            replyToken: event.replyToken,
            messages: [{
                type: 'text',
                text: replyText
            }]
        });
        
    } catch (error) {
        console.error('處理檔案訊息時發生錯誤:', error);
        await client.replyMessage({
            replyToken: event.replyToken,
            messages: [{
                type: 'text',
                text: '處理檔案時發生錯誤，請稍後再試！'
            }]
        });
    }
}

export default router;