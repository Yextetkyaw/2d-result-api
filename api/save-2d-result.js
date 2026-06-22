// api/save-2d-result.js
const { Redis } = require('@upstash/redis');

const redis = new Redis({
    url: process.env.KV_REST_API_URL || process.env.OTHER_KV_REST_API_URL,   
    token: process.env.KV_REST_API_TOKEN || process.env.OTHER_KV_REST_API_TOKEN, 
});

const DATES_ZSET_KEY = 'twod_dates_zset';
const MAX_DAYS = 365;

module.exports = async (req, res) => {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // 🌟 ၁။ GET Method - ရက်စွဲအလိုက် ဒေတာများကို အသစ်ဆုံးမှ အဟောင်းဆုံး စီထုတ်ပေးမည်
    if (req.method === 'GET') {
        try {
            // ရက်စွဲစာရင်းကို အသစ်ဆုံးမှ အဟောင်းဆုံး အရင်ဆွဲထုတ်မည်
            const dates = await redis.zrange(DATES_ZSET_KEY, 0, MAX_DAYS - 1, { rev: true });
            
            const formattedResponse = {};

            if (dates && dates.length > 0) {
                // ရက်စွဲတစ်ခုချင်းစီရဲ့ ဒေတာကို Multi-get (MGET) ဖြင့် တစ်ပြိုင်နက် ဆွဲထုတ်မည်
                const keys = dates.map(date => `twod:data:${date}`);
                const dataResults = await redis.mget(...keys);

                dates.forEach((date, index) => {
                    let dayData = dataResults[index];
                    if (typeof dayData === 'string') dayData = JSON.parse(dayData);

                    formattedResponse[date] = {
                        noon_result: dayData?.noon_result || null,
                        evening_result: dayData?.evening_result || null
                    };
                });
            }

            return res.status(200).json(formattedResponse);
        } catch (error) {
            return res.status(500).json({ error: 'Failed to fetch data', details: error.message });
        }
    }
    
    // 🌟 ၂။ POST Method - ဘယ်လိုပဲထည့်ထည့် ရက်စွဲအလိုက် စီသွားမည်
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
            const dataKey = `twod:data:${targetDate}`;

            // လက်ရှိရက်စွဲအတွက် ဒေတာ ရှိပြီးသားလား လှမ်းယူမယ်
            let existingDayData = await redis.get(dataKey);
            if (typeof existingDayData === 'string') existingDayData = JSON.parse(existingDayData);
            
            if (!existingDayData) {
                existingDayData = { noon_result: null, evening_result: null };
            }

            // ဒေတာအသစ်ကို ထည့်သွင်းမယ်
            if (type === 'noon') {
                existingDayData.noon_result = data;
            } else if (type === 'evening') {
                existingDayData.evening_result = data;
            }

            // ၁။ ဒေတာကို ရက်စွဲအလိုက် သီးသန့် Key နဲ့ သိမ်းမယ်
            await redis.set(dataKey, JSON.stringify(existingDayData));

            // ၂။ ရက်စွဲစာရင်း Sorted Set ထဲမှာ ၎င်းရက်စွဲကို Timestamp score ဖြင့် ထည့်မယ် (ရက်စွဲတူရင်自動 overwrite ဖြစ်လို့ စိတ်ချရတယ်)
            await redis.zadd(DATES_ZSET_KEY, timestamp, targetDate);

            // ၃။ ရက်ပေါင်း ၃၆၅ ရက်ထက် ကျော်သွားရင် အဟောင်းဆုံးရက်စွဲတွေကို ဖျက်ပစ်မယ်
            const totalCount = await redis.zcard(DATES_ZSET_KEY);
            if (totalCount > MAX_DAYS) {
                // အဟောင်းဆုံး ဖြစ်တဲ့ ရက်စွဲတွေကို Sorted Set ထဲက ဖျက်မယ်
                const expiredDates = await redis.zrange(DATES_ZSET_KEY, 0, totalCount - MAX_DAYS - 1);
                if (expiredDates && expiredDates.length > 0) {
                    // သက်ဆိုင်ရာ ဒေတာ Key တွေကိုပါ Database ထဲက ဖျက်ပစ်မယ်
                    const expiredKeys = expiredDates.map(d => `twod:data:${d}`);
                    await redis.del(...expiredKeys);
                    await redis.zremrangebyrank(DATES_ZSET_KEY, 0, totalCount - MAX_DAYS - 1);
                }
            }

            return res.status(200).json({ success: true, message: `${type} result saved for ${targetDate}.` });
        } catch (error) {
            return res.status(500).json({ error: 'Server Internal Error', details: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
