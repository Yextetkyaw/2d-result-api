// api/save-2d-result.js
const { Redis } = require('@upstash/redis');

// Vercel Storage ကပေးတဲ့ ပုံမှန် Variable နာမည် သို့မဟုတ် ကိုယ်တိုင်ထည့်ထားတဲ့ နာမည် နှစ်ခုလုံးကို စစ်ဆေးချိတ်ဆက်ခြင်း
const redis = new Redis({
    url: process.env.KV_REST_API_URL || process.env.OTHER_KV_REST_API_URL,   
    token: process.env.KV_REST_API_TOKEN || process.env.OTHER_KV_REST_API_TOKEN, 
});

module.exports = async (req, res) => {
    // CORS Headers သတ်မှတ်ခြင်း
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Preflight request (OPTIONS) အတွက် သီးသန့် အောင်မြင်ကြောင်း ပြန်ပေးခြင်း
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // လုံခြုံရေးအတွက် Secret Token စစ်ဆေးခြင်း
    const secretToken = req.headers['authorization'];
    if (secretToken !== 'Bearer MY_SECRET_KEY_123') {
        return res.status(401).json({ error: 'Unauthorized: Token invalid or missing' });
    }

    // POST Method စစ်ဆေးခြင်း
    if (req.method === 'POST') {
        try {
            const { type, data } = req.body; 

            // Payload ထဲမှာ ဒေတာ အပြည့်အစုံ ပါမပါ စစ်ဆေးခြင်း
            if (!type || !data) {
                return res.status(400).json({ error: 'Missing type or data in request body' });
            }

            // 🌟 ရလာတဲ့ ဒေတာကို ဒုတိယ Database အသစ်ထဲသို့ String ပြောင်း၍ စနစ်တကျသိမ်းခြင်း
            await redis.set(`${type}_result`, JSON.stringify(data));

            return res.status(200).json({ success: true, message: `${type} result saved to new database.` });
        } catch (error) {
            // Redis error သို့မဟုတ် တခြား error တစ်ခုခုတက်ရင် Function ကြီး မဒေါင်းစေဘဲ message ပြန်ပေးခြင်း
            console.error("Database Save Error:", error.message);
            return res.status(500).json({ error: 'Database operations failed', details: error.message });
        }
    } else {
        return res.status(405).json({ error: 'Method not allowed. Use POST instead.' });
    }
};
