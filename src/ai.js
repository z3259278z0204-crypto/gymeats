// 用 Claude 估算一份餐點的熱量與三大營養素
const Anthropic = require('@anthropic-ai/sdk');
const { config } = require('./config');

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

// 用「工具」的方式要求 Claude 一定回傳固定格式的數字，最穩定
const nutritionTool = {
  name: 'record_nutrition',
  description: '回報一份餐點估算的熱量與三大營養素',
  input_schema: {
    type: 'object',
    properties: {
      kcal: { type: 'number', description: '總熱量（大卡）' },
      protein: { type: 'number', description: '蛋白質（公克）' },
      carb: { type: 'number', description: '碳水化合物（公克）' },
      fat: { type: 'number', description: '脂肪（公克）' },
    },
    required: ['kcal', 'protein', 'carb', 'fat'],
  },
};

// 傳入餐點名稱（可含餐別），回傳 { kcal, protein, carb, fat }
// 估算失敗時回傳全 null，讓程式仍可記錄品項與金額
async function estimateNutrition(foodName) {
  try {
    const resp = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: 300,
      tools: [nutritionTool],
      tool_choice: { type: 'tool', name: 'record_nutrition' },
      messages: [
        {
          role: 'user',
          content:
            `估算這份餐點的營養（以台灣常見份量為準，一般成人單人份）：「${foodName}」。` +
            `只需給出合理的整數估算值。`,
        },
      ],
    });

    const toolUse = resp.content.find((c) => c.type === 'tool_use');
    if (!toolUse) return { kcal: null, protein: null, carb: null, fat: null };

    const { kcal, protein, carb, fat } = toolUse.input;
    return {
      kcal: Math.round(kcal),
      protein: Math.round(protein),
      carb: Math.round(carb),
      fat: Math.round(fat),
    };
  } catch (err) {
    console.error('estimateNutrition 失敗：', err.message);
    return { kcal: null, protein: null, carb: null, fat: null };
  }
}

module.exports = { estimateNutrition };
