export function getLineConfig() {
    const secret = process.env.LINE_SECRET;
    const token = process.env.LINE_ACCESS_TOKEN;

    console.log("secret:", secret);
    console.log("token:", token);

    if (!secret || !token) {
        throw new Error("LINE secrets not available");
    }

    return { channelSecret: secret, channelAccessToken: token };
}