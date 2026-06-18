const { Redis } = require('@upstash/redis');

const redis = new Redis({
    url: process.env.KV_REST_API_URL,   
    token: process.env.KV_REST_API_TOKEN, 
});

module.exports = async (req, res) => {
    // CORS Header သတ်မှတ်ခြင်း (ဒီဘက်က လှမ်းပို့တာ လက်ခံနိုင်အောင်)
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
        const { type, data } = req.body; 

        try {
            // 🌟 ရလာတဲ့ နေ့လယ် သို့မဟုတ် ညနေ ဒေတာကို တခြား Database ထဲသိမ်းခြင်း
            await redis.set(`${type}_result`, JSON.stringify(data));

            return res.status(200).json({ success: true, message: `${type} result saved.` });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    } else {
        return res.status(405).json({ error: 'Method not allowed' });
    }
};
