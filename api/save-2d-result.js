const { Redis } = require('@upstash/redis');

const redis = new Redis({
    url: process.env.KV_REST_API_URL || process.env.OTHER_KV_REST_API_URL,   
    token: process.env.KV_REST_API_TOKEN || process.env.OTHER_KV_REST_API_TOKEN, 
});

// Redis ထဲမှာ သုံးမယ့် Key Name
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
    // အသစ်ဆုံးဒေတာကို ထိပ်ဆုံးကပြပြီး စုစုပေါင်း ၃၆၅ ရက်စာပဲ ပြန်ပေးမည်။
    if (req.method === 'GET') {
        try {
            // zrange သုံးပြီး Score အများဆုံး (အသစ်ဆုံး) ကနေ အနည်းဆုံး (အဟောင်းဆုံး) ကို ဆွဲထုတ်မည်။
            // Upstash JSON ပြန်ပေးသည့် format အပေါ်မူတည်၍ rev: true ထည့်ထားသည်။
            const rawData = await redis.zrange(REDIS_KEY, 0, 364, { rev: true });

            // Frontend က သုံးရလွယ်အောင် Object Format ပြောင်းပေးခြင်း
            const formattedResponse = {};

            if (rawData && rawData.length > 0) {
                rawData.forEach(item => {
                    // Upstash က data ကို parse လုပ်ပြီးသား ပေးနိုင်သလို string အနေနဲ့လည်း ပေးနိုင်၍ စစ်ဆေးခြင်း
                    const parsedItem = typeof item === 'string' ? JSON.parse(item) : item;
                    const dateKey = parsedItem.date;

                    formattedResponse[dateKey] = {
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
        const secretToken = req.headers['authorization'];
        if (secretToken !== 'Bearer MY_SECRET_KEY_123') {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        try {
            let bodyData = req.body;
            if (typeof bodyData === 'string') {
                bodyData = JSON.parse(bodyData);
            }

            const { type, data } = bodyData; // type: 'noon' သို့မဟုတ် 'evening', data: { date: '2026-06-22', ... }

            if (!type || !data || !data.date) {
                return res.status(400).json({ error: 'Missing type, data or date' });
            }

            const targetDate = data.date; // ဥပမာ - "2026-06-22"
            const score = new Date(targetDate).getTime(); // Date ကို စီဖို့အတွက် Timestamp ပြောင်းခြင်း

            // ၁။ အဲဒီရက်စွဲအတွက် ရှိပြီးသား ဒေတာ ဟောင်း ရှိမရှိ အရင်ရှာစစ်မယ်
            const allItems = await redis.zrange(REDIS_KEY, 0, -1);
            let existingRecord = { date: targetDate, noon_result: null, evening_result: null };

            if (allItems && allItems.length > 0) {
                const found = allItems.find(item => {
                    const parsed = typeof item === 'string' ? JSON.parse(item) : item;
                    return parsed.date === targetDate;
                });

                if (found) {
                    existingRecord = typeof found === 'string' ? JSON.parse(found) : found;
                    // လက်ရှိအဟောင်းကို ဒေတာအသစ်နဲ့ မထပ်အောင် ခဏ ဖျက်ထုတ်လိုက်မယ်
                    await redis.zrem(REDIS_KEY, JSON.stringify(found));
                }
            }

            // ၂။ ဒေတာအသစ် (noon သို့မဟုတ် evening) ကို Update လုပ်မယ်
            if (type === 'noon') {
                existingRecord.noon_result = data;
            } else if (type === 'evening') {
                existingRecord.evening_result = data;
            }

            // ၃။ ဒေတာဘေ့စ်ထဲကို Sorted Set အနေနဲ့ ပြန်ထည့်မယ် (Score က နေ့ရက် Timestamp ဖြစ်လို့ အော်တို စီသွားမယ်)
            await redis.zadd(REDIS_KEY, { score: score, member: JSON.stringify(existingRecord) });

            // ၄။ ⚠️ ၃၆၅ ရက်ထက် ကျော်သွားတဲ့ အဟောင်းဆုံး ဒေတာတွေကို ဖျက်ထုတ်ပစ်ခြင်း
            // Score အနည်းဆုံး (အဟောင်းဆုံး) ကောင်တွေကို ဖျက်တာဖြစ်ပြီး Rank (0 ကနေ စုစုပေါင်းထဲက ၃၆၅ ခု ချန်ပြီး ကျန်တာဖျက်)
            const totalElements = await redis.zcard(REDIS_KEY);
            if (totalElements > 365) {
                const excessCount = totalElements - 365;
                // အောက်ဆုံးက အဟောင်းဆုံး 'excessCount' အရေအတွက်ကို ဖျက်မယ်
                await redis.zremrangebyrank(REDIS_KEY, 0, excessCount - 1);
            }

            return res.status(200).json({ success: true, message: `${type} result saved for ${targetDate}.` });
        } catch (error) {
            return res.status(500).json({ error: 'Server Internal Error', details: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
