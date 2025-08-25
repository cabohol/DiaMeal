import express from 'express';
import cors from 'cors';
import { Groq } from 'groq-sdk';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Supabase
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

// Initialize Groq
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Middleware
app.use(cors({
  origin: 'http://localhost:5173', // Your Vue app URL
  credentials: true
}));
app.use(express.json());

// Generate Meal Plan endpoint
app.post('/api/generateMealPlan', async (req, res) => {
  try {
    // --- 1) Validate input ---
    const { user_id } = req.body || {};
    if (!user_id) {
      return res.status(400).json({ success: false, error: "Missing user_id" });
    }

    // --- 2) Pull latest user profile & constraints from Supabase ---
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", user_id)
      .single();
    if (userError || !user) {
      console.error('User fetch error:', userError);
      throw userError || new Error("User not found");
    }

    const { data: lab, error: labError } = await supabase
      .from("lab_results")
      .select("*")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    // lab may be null if none yet; that's okay.

    const { data: allergiesData } = await supabase
      .from("allergies")
      .select("allergy")
      .eq("user_id", user_id);

    const { data: religiousData } = await supabase
      .from("religious_diets")
      .select("diet_type")
      .eq("user_id", user_id);

    const allergiesList = (allergiesData || []).map(a => a.allergy).filter(Boolean);
    const religiousList = (religiousData || []).map(r => r.diet_type).filter(Boolean);

    // --- 3) Ask Groq for deterministic JSON (no streaming) ---
    const systemSchema = `
Return ONLY valid JSON (no markdown, no commentary), matching exactly this TypeScript type:

type Meal = {
  name: string;
  meal_type: "breakfast" | "lunch" | "dinner";
  calories: number;                // kcal
  ingredients: string[];           // plain strings
  procedures: string;              // short steps or paragraph
  preparation_time: string;        // e.g., "15m"
};

type Plan = {
  meals: {
    breakfast: [Meal, Meal, Meal];
    lunch: [Meal, Meal, Meal];
    dinner: [Meal, Meal, Meal];
  }
};

Rules:
- Respect allergies and religious diets strictly (avoid forbidden items).
- For diabetes-friendly meals: prioritize high fiber, lean protein, low added sugar; moderate carbs.
- Fit roughly within user's budget context if provided (use affordable options).
- Keep names and fields concise.
`;

    const content = {
      instruction: "Generate 3 meal types with 3 alternatives each for the next day.",
      user_profile: {
        id: user.id,
        full_name: user.full_name,
        gender: user.gender,
        age: user.age,
        height_cm: user.height_cm,
        weight_kg: user.weight_kg,
        diabetes_type: user.diabetes_type,
        budget: user.budget
      },
      latest_lab_results: lab || {},
      allergies: allergiesList,
      religious_diets: religiousList
    };

    console.log('Calling Groq API...');
    const chat = await groq.chat.completions.create({
      model: "deepseek-r1-distill-llama-70b",
      temperature: 0.6,
      top_p: 0.95,
      max_completion_tokens: 2048,
      stream: false,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemSchema },
        {
          role: "user",
          content: JSON.stringify(content)
        }
      ]
    });

    // --- 4) Parse Groq JSON safely ---
    let ai;
    try {
      ai = JSON.parse(chat.choices?.[0]?.message?.content || "{}");
    } catch (e) {
      console.error('AI response parse error:', e);
      throw new Error("AI response was not valid JSON.");
    }

    // Validate minimum structure
    const meals = ai?.meals || {};
    for (const k of ["breakfast", "lunch", "dinner"]) {
      if (!Array.isArray(meals[k]) || meals[k].length !== 3) {
        throw new Error(`AI returned invalid structure for ${k}.`);
      }
    }

    // --- 5) Save all alternatives into DB ---
    const today = new Date().toISOString().split('T')[0]; // Format as YYYY-MM-DD
    const saved = [];

    // Insert each alternative to `meals` then link with `meal_plans`
    for (const mealType of ["breakfast", "lunch", "dinner"]) {
      for (const alt of meals[mealType]) {
        // Normalize fields in case AI formatting differs slightly
        const payload = {
          meal_type: alt.meal_type || mealType,
          calories: typeof alt.calories === "number" ? alt.calories : null,
          ingredients: Array.isArray(alt.ingredients) ? alt.ingredients : [],
          procedures: alt.procedures || "",
          preparation_time: alt.preparation_time || null,
          name: alt.name || `${mealType} option`,
          user_id
        };

        const { data: mealRow, error: mealErr } = await supabase
          .from("meals")
          .insert([payload])
          .select()
          .single();
        if (mealErr) {
          console.error('Meal insert error:', mealErr);
          throw mealErr;
        }

        const { data: planRow, error: planErr } = await supabase
          .from("meal_plans")
          .insert([
            {
              date: today,
              recommended_by_ai: true,
              meal_id: mealRow.id,
              user_id
            }
          ])
          .select()
          .single();
        if (planErr) {
          console.error('Meal plan insert error:', planErr);
          throw planErr;
        }

        saved.push({ meal: mealRow, mealPlan: planRow });
      }
    }

    // --- 6) Respond with clean JSON ---
    return res.status(200).json({
      success: true,
      mealsByType: meals, // { breakfast: [3], lunch: [3], dinner: [3] }
      saved
    });
  } catch (error) {
    console.error("generateMealPlan error:", error);
    return res
      .status(500)
      .json({ success: false, error: error?.message || "Internal server error" });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`API Server running on http://localhost:${PORT}`);
});