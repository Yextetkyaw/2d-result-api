// api/save-2d-result.js
const { Redis } = require('@upstash/redis');

const redis = new Redis({
    url: process.env.KV_REST_API_URL || process.env.OTHER_KV_REST_API_URL,   
    token: process.env.KV_REST_API_TOKEN || process.env.OTHER_KV_REST_API_TOKEN, 
});

// Redis ထဲမှာ သိမ်းမယ့် List Key Name
const REDIS_LIST_KEY = 'twod_results_list';
const MAX_DAYS = 365; // သိမ်းဆည်းမည့် အများဆုံး ရက်အရေအတွက်

module.exports = async (req, res) => {
    // CORS Headers 
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 🌟 ၁။ ဒေတာအားလုံးကို ရက်စွဲအလိုက် အသစ်ဆုံးမှ အဟောင်းဆုံး စီပြီး ပြန်ထုတ်ပေးခြင်း (GET Method)
    if (req.method === 'GET') {
        try {
            // List ထဲက ဒေတာအားလုံး (0 မှ 364 အထိ) ကို ဆွဲထုတ်မည်
            const rawList = await redis.lrange(REDIS_LIST_KEY, 0, MAX_DAYS - 1);
            
            // ရလာတဲ့ Array ကို Object ပုံစံ ပြန်ပြောင်းပေးမည်
            const formattedResponse = {};

            rawList.forEach(item => {
                let parsedItem = item;
                if (typeof parsedItem === 'string') {
                    parsedItem = JSON.parse(parsedItem);
                }
                
                const { date, noon_result, evening_result } = parsedItem;
                if (date) {
                    formattedResponse[date] = {
                        noon_result: noon_result || null,
                        evening_result: evening_result || null
                    };
                }
            });

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

            const targetDate = data.date;

            // ၁။ လက်ရှိ ရှိပြီးသား ဒေတာစာရင်းကို ယူရမည် (တစ်ရက်တည်းမှာ noon ကော evening ကော ရှိနိုင်လို့ စစ်ဆေးရန်)
            const rawList = await redis.lrange(REDIS_LIST_KEY, 0, MAX_DAYS - 1);
            
            let existingIndex = -1;
            let existingDayData = { date: targetDate, noon_result: null, evening_result: null };

            // ယနေ့ရက်စွဲနဲ့ ဒေတာ ရှိပြီးသားလား ရှာဖွေခြင်း
            for (let i = 0; i < rawList.length; i++) {
                let currentItem = typeof rawList[i] === 'string' ? JSON.parse(rawList[i]) : rawList[i];
                if (currentItem.date === targetDate) {
                    existingIndex = i;
                    existingDayData = currentItem;
                    break;
                }
            }

            // ၂။ ဒေတာအသစ်ကို Update လုပ်ခြင်း
            if (type === 'noon') {
                existingDayData.noon_result = data;
            } else if (type === 'evening') {
                existingDayData.evening_result = data;
            }

            if (existingIndex !== -1) {
                // ရှိပြီးသား ရက်စွဲဆိုရင် ၎င်း Index နေရာမှာ ဒေတာ အဟောင်းကို ဖျက်ပြီး အသစ်ပြန်သွင်းရန်
                // ပိုမိုလွယ်ကူစေရန် List တစ်ခုလုံးကို Update လုပ်ပေးခြင်း (သိုမဟုတ် LSET သုံးနိုင်သည်)
                // သို့သော် ဒေတာအသစ်ဆုံးကို အပေါ်မှာ ထားချင်တာ ဖြစ်လို့ ရှိပြီးသားဒေတာကို ဖျက်ပြီး ထိပ်ဆုံးကို ပို့ပေးခြင်းက ပိုကောင်းပါတယ်
                await redis.lrem(REDIS_LIST_KEY, 1, rawList[existingIndex]);
            }

            // ဒေတာကို List ရဲ့ ထိပ်ဆုံး (အပေါ်ဆုံး) သို့ တွန်းထည့်မည်
            await redis.lpush(REDIS_LIST_KEY, JSON.stringify(existingDayData));

            // ၃။ ဒေတာအရေအတွက် ၃၆၅ ခုထက် ကျော်သွားရင် အောက်ဆုံးက အဟောင်းဆုံးတွေကို ဖြတ်ပစ်မည်
            await redis.ltrim(REDIS_LIST_KEY, 0, MAX_DAYS - 1);

            return res.status(200).json({ success: true, message: `${type} result saved for ${targetDate}.` });
        } catch (error) {
            return res.status(500).json({ error: 'Server Internal Error', details: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
