// api/save-2d-result.js
const { Redis } = require('@upstash/redis');

const redis = new Redis({
    url: process.env.KV_REST_API_URL || process.env.OTHER_KV_REST_API_URL,   
    token: process.env.KV_REST_API_TOKEN || process.env.OTHER_KV_REST_API_TOKEN, 
});

module.exports = async (req, res) => {
    // CORS Headers 
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

        // 🌟 ၁။ Browser ကနေ ဒီအတိုင်း Link ကို ဝင်ကြည့်လျှင် (GET Method)
    if (req.method === 'GET') {
        try {
            let storedNoon = await redis.get('noon_result');
            if (storedNoon && typeof storedNoon === 'string') storedNoon = JSON.parse(storedNoon);

            let storedEvening = await redis.get('evening_result');
            if (storedEvening && typeof storedEvening === 'string') storedEvening = JSON.parse(storedEvening);

            // ရရှိလာတဲ့ ဒေတာထဲက တစ်ခုခုဆီကနေ ရက်စွဲ (Date) ကို ယူပါတယ်။ ဒေတာမရှိရင် လက်ရှိ Today Date ကို သုံးပါတယ်။
            let resultDate = "-";
            if (storedNoon && storedNoon.date) {
                resultDate = storedNoon.date;
            } else if (storedEvening && storedEvening.date) {
                resultDate = storedEvening.date;
            } else {
                // ဒေတာ လုံးဝမရှိသေးပါက လက်ရှိစက်ရဲ့ ရက်စွဲကို ယူခြင်း (YYYY-MM-DD ဖော်မတ်)
                resultDate = new Date().toISOString().split('T')[0];
            }

            // ရက်စွဲ Object အောက်ထဲသို့ ထည့်သွင်းတည်ဆောက်ခြင်း
            const formattedResponse = {
                [resultDate]: {
                    noon_result: storedNoon || null,
                    evening_result: storedEvening || null
                }
            };

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

            if (!type || !data) {
                return res.status(400).json({ error: 'Missing type or data' });
            }

            // ဒေတာဘေ့စ်ထဲသို့ သိမ်းဆည်းခြင်း
            await redis.set(`${type}_result`, JSON.stringify(data));

            return res.status(200).json({ success: true, message: `${type} result saved.` });
        } catch (error) {
            return res.status(500).json({ error: 'Server Internal Error', details: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
