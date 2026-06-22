// api/save-2d-result.js
const { Redis } = require('@upstash/redis');

const redis = new Redis({
    url: process.env.KV_REST_API_URL || process.env.OTHER_KV_REST_API_URL,   
    token: process.env.KV_REST_API_TOKEN || process.env.OTHER_KV_REST_API_TOKEN, 
});

// Redis Sorted Set အတွက် သုံးမည့် Key
const REDIS_KEY = 'twod_results_set';

module.exports = async (req, res) => {
    // CORS Headers 
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 🌟 ၁။ Browser ကနေ ဒေတာပြန်တောင်းခြင်း (GET Method)
    if (req.method === 'GET') {
        try {
            // zrange သုံးပြီး Score အများဆုံး (အသစ်ဆုံး) ကနေ စုစုပေါင်း ၃၆၅ ရက်စာ ဆွဲထုတ်မည်။
            const rawData = await redis.zrange(REDIS_KEY, 0, 364, { rev: true });

            // "date" ဆိုသည့် Key ပုံသေအောက်တွင် အားလုံးကို အုပ်ပေးထားမည့် Object Structure
            const formattedResponse = {
                date: {}
            };

            if (rawData && rawData.length > 0) {
                rawData.forEach(item => {
                    const parsedItem = typeof item === 'string' ? JSON.parse(item) : item;
                    const dateKey = parsedItem.date; // ဥပမာ- "2026-06-22"

                    // "date" Key ကြီး၏အောက်တွင် dynamic ရက်စွဲများကို Key အဖြစ် ထည့်သွင်းခြင်း
                    formattedResponse.date[dateKey] = {
                        noon_result: parsedItem.noon_result || null,
                        evening_result: parsedItem.evening_result || null
                    };
                });
            }

            return res.status(200).json(formattedResponse);
        } catch (error) {
            return res.status(500).json({ error: 'Failed to fetch data', details: error.message });
        }
    }
    
    // 🌟 ၂။ ပထမ API ကနေ ဒေတာလှမ်းပို့သိမ်းလျှင် (POST Method)
    if (req.method === 'POST') {
        // လုံခြုံရေးအတွက် Secret Token စစ်ဆေးခြင်း
        const secretToken = req.headers['authorization'];
        if (secretToken !== 'Bearer MY_SECRET_KEY_123') {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        try {
            let bodyData = req.body;
            if (typeof bodyData === 'string') {
                bodyData = JSON.parse(bodyData);
            }

            const { type, data } = bodyData; 

            if (!type || !data || !data.date) {
                return res.status(400).json({ error: 'Missing type, data or date' });
            }

            const targetDate = data.date; // ဥပမာ - "2026-06-22"
            const score = new Date(targetDate).getTime(); // ရက်စွဲအလိုက် အော်တိုစီရန်အတွက် Timestamp ပြောင်းလဲခြင်း

            // ၁။ ၎င်းရက်စွဲအတွက် ရှိပြီးသား ဒေတာဟောင်း ရှိ၊ မရှိ ရှာဖွေခြင်း
            const allItems = await redis.zrange(REDIS_KEY, 0, -1);
            let existingRecord = { date: targetDate, noon_result: null, evening_result: null };

            if (allItems && allItems.length > 0) {
                const found = allItems.find(item => {
                    const parsed = typeof item === 'string' ? JSON.parse(item) : item;
                    return parsed.date === targetDate;
                });

                if (found) {
                    existingRecord = typeof found === 'string' ? JSON.parse(found) : found;
                    // ဒေတာအသစ်နှင့် မထပ်စေရန် ရှိပြီးသား Record ဟောင်းအား ယာယီဖျက်ထုတ်ခြင်း
                    await redis.zrem(REDIS_KEY, JSON.stringify(found));
                }
            }

            // ၂။ ဒေတာအသစ် (noon သို့မဟုတ် evening) ကို လက်ရှိ Record ထဲသို့ ဖြည့်စွက်ခြင်း
            if (type === 'noon') {
                existingRecord.noon_result = data;
            } else if (type === 'evening') {
                existingRecord.evening_result = data;
            }

            // ၃။ ဒေတာဘေ့စ်ထဲသို့ Sorted Set အဖြစ် ပြန်လည်သိမ်းဆည်းခြင်း
            await redis.zadd(REDIS_KEY, { score: score, member: JSON.stringify(existingRecord) });

            // ၄။ ⚠️ ဒေတာအရေအတွက် ၃၆၅ ခုထက် ကျော်လွန်ပါက အဟောင်းဆုံးဒေတာများကို အလိုအလျောက်ဖျက်ခြင်း
            const totalElements = await redis.zcard(REDIS_KEY);
            if (totalElements > 365) {
                const excessCount = totalElements - 365;
                await redis.zremrangebyrank(REDIS_KEY, 0, excessCount - 1);
            }

            return res.status(200).json({ success: true, message: `${type} result saved for ${targetDate}.` });
        } catch (error) {
            return res.status(500).json({ error: 'Server Internal Error', details: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
