// api/save-2d-result.js
const { Redis } = require('@upstash/redis');

const redis = new Redis({
    url: process.env.KV_REST_API_URL || process.env.OTHER_KV_REST_API_URL,   
    token: process.env.KV_REST_API_TOKEN || process.env.OTHER_KV_REST_API_TOKEN, 
});

const REDIS_ZSET_KEY = 'twod_results_zset';
const MAX_DAYS = 365;

module.exports = async (req, res) => {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // 🌟 ၁။ GET Method - ရက်စွဲအလိုက် အသစ်ဆုံးမှ အဟောင်းဆုံး စီထွက်လာမည်
    if (req.method === 'GET') {
        try {
            // Upstash မှာ zrevrange အစား zrange ကို { rev: true } ထည့်သုံးရပါတယ်
            const rawList = await redis.zrange(REDIS_ZSET_KEY, 0, MAX_DAYS - 1, { rev: true });
            
            const formattedResponse = {};
            if (rawList && rawList.length > 0) {
                rawList.forEach(item => {
                    let parsedItem = typeof item === 'string' ? JSON.parse(item) : item;
                    const { date, noon_result, evening_result } = parsedItem;
                    if (date) {
                        formattedResponse[date] = {
                            noon_result: noon_result || null,
                            evening_result: evening_result || null
                        };
                    }
                });
            }

            return res.status(200).json(formattedResponse);
        } catch (error) {
            return res.status(500).json({ error: 'Failed to fetch data', details: error.message });
        }
    }
    
    // 🌟 ၂။ POST Method - ဘယ်လိုပဲထည့်ထည့် ရက်စွဲ (Date) အတိုင်းပဲ စီသွားမည်
    if (req.method === 'POST') {
        const secretToken = req.headers['authorization'];
        if (secretToken !== 'Bearer MY_SECRET_KEY_123') {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        try {
            let bodyData = req.body;
            if (typeof bodyData === 'string') bodyData = JSON.parse(bodyData);

            const { type, data } = bodyData; 
            if (!type || !data || !data.date) {
                return res.status(400).json({ error: 'Missing type, data or date' });
            }

            const targetDate = data.date; 
            const timestamp = new Date(targetDate).getTime(); 

            // Redis ထဲမှာ ရှိသမျှ ဒေတာအကုန် ဆွဲထုတ်ပြီး စစ်ဆေးရန် (ရက်စွဲတူ ရှိ/မရှိ)
            const rawList = await redis.zrange(REDIS_ZSET_KEY, 0, -1);
            let existingItem = null;
            let existingDayData = { date: targetDate, noon_result: null, evening_result: null };

            if (rawList && rawList.length > 0) {
                for (let item of rawList) {
                    let parsed = typeof item === 'string' ? JSON.parse(item) : item;
                    if (parsed.date === targetDate) {
                        existingItem = item; 
                        existingDayData = parsed;
                        break;
                    }
                }
            }

            // ဒေတာအသစ်ကို Update လုပ်ခြင်း
            if (type === 'noon') {
                existingDayData.noon_result = data;
            } else if (type === 'evening') {
                existingDayData.evening_result = data;
            }

            // ရက်စွဲတူရှိခဲ့ရင် အဟောင်းကို အရင်ဖျက်ထုတ်ပေးရပါတယ်
            if (existingItem) {
                await redis.zrem(REDIS_ZSET_KEY, existingItem);
            }

            // ZADD သုံးပြီး သိမ်းမည်။ Score နေရာမှာ timestamp ကို သုံးထားသည်။
            await redis.zadd(REDIS_ZSET_KEY, { score: timestamp, member: JSON.stringify(existingDayData) });

            // ၃၆၅ ရက်ကျော်ရင် အဟောင်းဆုံးတွေကို ဖြတ်ထုတ်ခြင်း
            const totalCount = await redis.zcard(REDIS_ZSET_KEY);
            if (totalCount > MAX_DAYS) {
                await redis.zremrangebyrank(REDIS_ZSET_KEY, 0, totalCount - MAX_DAYS - 1);
            }

            return res.status(200).json({ success: true, message: `${type} result saved for ${targetDate}.` });
        } catch (error) {
            return res.status(500).json({ error: 'Server Internal Error', details: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
