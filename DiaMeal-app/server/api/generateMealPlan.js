// server/api/generateMealPlan.js
import dotenv from "dotenv";
import { Groq } from "groq-sdk";
dotenv.config();

export default async function handler(req, res, body) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  if (!process.env.GROQ_API_KEY) {
    res.write(`data: ERROR: Missing GROQ_API_KEY in environment variables\n\n`);
    return res.end();
  }

  try {
    const { userData } = JSON.parse(body || "{}");

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are a licensed Filipino dietitian specializing in diabetic nutrition for Type 1 and Type 2 diabetes.
You create meal plans that are safe for blood sugar control, culturally relevant to the Philippines, and nutritionally balanced. 
You must include calorie counts and estimated preparation time for each dish.`
        },
        {
          role: "user",
          content: `You are a licensed dietitian in the Philippines specializing in Type 1 and Type 2 diabetes. 
Generate a 7-day diabetic-friendly meal plan using only Filipino dishes.
For each day, include:
- Breakfast: 3 alternative dishes (name, calories, estimated prep time in minutes)
- Lunch: 3 alternative dishes (same info)
- Dinner: 3 alternative dishes (same info)

Return ONLY a valid JSON array in this format:
[
  {
    "day": 1,
    "meals": {
      "breakfast": [
        { "name": "", "calories": 0, "time": 0 },
        { "name": "", "calories": 0, "time": 0 },
        { "name": "", "calories": 0, "time": 0 }
      ],
      "Lunch": [
        { "name": "", "calories": 0, "time": 0 },
        { "name": "", "calories": 0, "time": 0 },
        { "name": "", "calories": 0, "time": 0 }
      ],"Dinner": [
        { "name": "", "calories": 0, "time": 0 },
        { "name": "", "calories": 0, "time": 0 },
        { "name": "", "calories": 0, "time": 0 }
      ]
    }
  },
  ...
]`
        }
      ],
      model: "deepseek-r1-distill-llama-70b",
      temperature: 0.6,
      max_completion_tokens: 4096,
      top_p: 0.95,
      stream: true
    });

    for await (const chunk of chatCompletion) {
      const text = chunk.choices[0]?.delta?.content || "";
      res.write(`data: ${text}\n\n`);
    }

    res.end();
  } catch (err) {
    res.write(`data: ERROR: ${err.message}\n\n`);
    res.end();
  }
}
