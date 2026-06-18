// api/save-2d-result.js
const { Redis } = require('@upstash/redis');

// ဒေတာဘေ့စ် ချိတ်ဆက်မှုကို အမှားအယွင်းမရှိအောင် သေချာပြင်ဆင်ခြင်း
const redis = new Redis({
    url: process.env.KV_REST_API_URL || process.env.OTHER_KV_REST_API_URL,   
    token: process.env.KV_REST_API_TOKEN || process.env.OTHER_KV_REST_API_TOKEN, 
});

module.exports = async (req, res) => {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // လုံခြုံရေးအတွက် Secret Token စစ်ဆေးခြင်း
    const secretToken = req.headers['authorization'];
    if (secretToken !== 'Bearer MY_SECRET_KEY_123') {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.method === 'POST') {
        try {
            // req.body က string ဖြစ်နေရင် JSON object ပြောင်းဖို့ ကြိုးစားခြင်း
            let bodyData = req.body;
            if (typeof bodyData === 'string') {
                bodyData = JSON.parse(bodyData);
            }

            const { type, data } = bodyData; 

            if (!type || !data) {
                return res.status(400).json({ error: 'Missing type or data' });
            }

            // 🌟 ဒေတာဘေ့စ်အသစ်ထဲသို့ အောင်မြင်စွာ သိမ်းဆည်းခြင်း
            await redis.set(`${type}_result`, JSON.stringify(data));

            return res.status(200).json({ success: true, message: `${type} result saved.` });
        } catch (error) {
            console.error("Error inside POST:", error.message);
            return res.status(500).json({ error: 'Server Internal Error', details: error.message });
        }
    } else {
        return res.status(405).json({ error: 'Method not allowed' });
    }
};
