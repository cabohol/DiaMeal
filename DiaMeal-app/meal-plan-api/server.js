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

// Generate 7-Day Meal Plan endpoint
app.post('/api/generateMealPlan', async (req, res) => {
  try {
    // --- 1) Validate input ---
    const { user_id, force_regenerate = false } = req.body || {};
    if (!user_id) {
      return res.status(400).json({ success: false, error: "Missing user_id" });
    }

    // --- 2) Check if valid meal plan already exists (unless force regenerate) ---
    if (!force_regenerate) {
      const { data: existingPlans, error: checkError } = await supabase
        .from("meal_plans")
        .select(`
          *,
          meals (*)
        `)
        .eq("user_id", user_id)
        .eq("recommended_by_ai", true)
        .gte("date", new Date().toISOString().split('T')[0]) // Today or future
        .order("date", { ascending: true });

      if (!checkError && existingPlans && existingPlans.length >= 21) { // 3 meals x 7 days
        // Group existing plans by date
        const plansByDate = {};
        existingPlans.forEach(plan => {
          const dateStr = plan.date.split('T')[0];
          if (!plansByDate[dateStr]) {
            plansByDate[dateStr] = { breakfast: [], lunch: [], dinner: [] };
          }
          if (plan.meals) {
            const mealType = plan.meals.meal_type;
            if (plansByDate[dateStr][mealType]) {
              plansByDate[dateStr][mealType].push(plan.meals);
            }
          }
        });

        return res.status(200).json({
          success: true,
          message: "Using existing meal plan",
          mealPlansByDay: plansByDate,
          isExisting: true
        });
      }
    }

    // --- 3) Pull latest user profile & constraints from Supabase ---
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

    // --- 4) Delete old meal plans if regenerating ---
    if (force_regenerate) {
      // First get all meal_ids from existing plans
      const { data: oldPlans } = await supabase
        .from("meal_plans")
        .select("meal_id")
        .eq("user_id", user_id)
        .eq("recommended_by_ai", true);

      if (oldPlans && oldPlans.length > 0) {
        const mealIds = oldPlans.map(p => p.meal_id).filter(Boolean);
        
        // Delete meal plans first
        await supabase
          .from("meal_plans")
          .delete()
          .eq("user_id", user_id)
          .eq("recommended_by_ai", true);

        // Then delete meals
        if (mealIds.length > 0) {
          await supabase
            .from("meals")
            .delete()
            .in("id", mealIds);
        }
      }
    }

    // --- 5) Generate 7 days of meals using Groq ---
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

type WeekPlan = {
  day1: {
    breakfast: [Meal, Meal, Meal];
    lunch: [Meal, Meal, Meal];
    dinner: [Meal, Meal, Meal];
  };
  day2: {
    breakfast: [Meal, Meal, Meal];
    lunch: [Meal, Meal, Meal];
    dinner: [Meal, Meal, Meal];
  };
  day3: {
    breakfast: [Meal, Meal, Meal];
    lunch: [Meal, Meal, Meal];
    dinner: [Meal, Meal, Meal];
  };
  day4: {
    breakfast: [Meal, Meal, Meal];
    lunch: [Meal, Meal, Meal];
    dinner: [Meal, Meal, Meal];
  };
  day5: {
    breakfast: [Meal, Meal, Meal];
    lunch: [Meal, Meal, Meal];
    dinner: [Meal, Meal, Meal];
  };
  day6: {
    breakfast: [Meal, Meal, Meal];
    lunch: [Meal, Meal, Meal];
    dinner: [Meal, Meal, Meal];
  };
  day7: {
    breakfast: [Meal, Meal, Meal];
    lunch: [Meal, Meal, Meal];
    dinner: [Meal, Meal, Meal];
  };
};

Rules:
- Generate UNIQUE meals for each day (avoid repeating the same meal across days)
- Respect allergies and religious diets strictly (avoid forbidden items)
- For diabetes-friendly meals: prioritize high fiber, lean protein, low added sugar; moderate carbs
- Fit roughly within user's budget context if provided (use affordable options)
- Keep names and fields concise
- Provide variety across the week while maintaining nutritional balance
`;

    const content = {
      instruction: "Generate a complete 7-day meal plan with 3 meal types and 3 alternatives each per day. Ensure variety across days.",
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

    console.log('Calling Groq API for 7-day plan...');
    const chat = await groq.chat.completions.create({
      model: "deepseek-r1-distill-llama-70b",
      temperature: 0.7,
      top_p: 0.95,
      max_completion_tokens: 8192, // Increased for 7-day plan
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

    // --- 6) Parse Groq JSON safely ---
    let weekPlan;
    try {
      weekPlan = JSON.parse(chat.choices?.[0]?.message?.content || "{}");
    } catch (e) {
      console.error('AI response parse error:', e);
      throw new Error("AI response was not valid JSON.");
    }

    // --- 7) Save all meals and plans into DB ---
    const startDate = new Date();
    const mealPlansByDay = {};

    for (let dayNum = 1; dayNum <= 7; dayNum++) {
      const dayKey = `day${dayNum}`;
      const dayMeals = weekPlan[dayKey];
      
      if (!dayMeals) {
        throw new Error(`Missing meals for ${dayKey}`);
      }

      // Calculate date for this day
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + (dayNum - 1));
      const dateStr = currentDate.toISOString().split('T')[0];
      
      mealPlansByDay[dateStr] = { breakfast: [], lunch: [], dinner: [] };

      // Process each meal type for this day
      for (const mealType of ["breakfast", "lunch", "dinner"]) {
        const mealsForType = dayMeals[mealType];
        
        if (!Array.isArray(mealsForType) || mealsForType.length !== 3) {
          throw new Error(`Invalid structure for ${dayKey} ${mealType}`);
        }

        // Save each meal alternative
        for (const meal of mealsForType) {
          const mealPayload = {
            meal_type: meal.meal_type || mealType,
            calories: typeof meal.calories === "number" ? meal.calories : null,
            ingredients: Array.isArray(meal.ingredients) ? meal.ingredients : [],
            procedures: meal.procedures || "",
            preparation_time: meal.preparation_time || null,
            name: meal.name || `${mealType} option`,
            user_id
          };

          const { data: mealRow, error: mealErr } = await supabase
            .from("meals")
            .insert([mealPayload])
            .select()
            .single();
          
          if (mealErr) {
            console.error('Meal insert error:', mealErr);
            throw mealErr;
          }

          const { data: planRow, error: planErr } = await supabase
            .from("meal_plans")
            .insert([{
              date: currentDate,
              recommended_by_ai: true,
              meal_id: mealRow.id,
              user_id
            }])
            .select()
            .single();
          
          if (planErr) {
            console.error('Meal plan insert error:', planErr);
            throw planErr;
          }

          mealPlansByDay[dateStr][mealType].push(mealRow);
        }
      }
    }

    // --- 8) Respond with structured JSON ---
    return res.status(200).json({
      success: true,
      message: "7-day meal plan generated successfully",
      mealPlansByDay,
      isExisting: false
    });

  } catch (error) {
    console.error("generateMealPlan error:", error);
    return res
      .status(500)
      .json({ success: false, error: error?.message || "Internal server error" });
  }
});

// Get existing meal plan endpoint
app.get('/api/getMealPlan/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const startDate = new Date().toISOString().split('T')[0];
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 6);
    const endDateStr = endDate.toISOString().split('T')[0];

    const { data: plans, error } = await supabase
      .from("meal_plans")
      .select(`
        *,
        meals (*)
      `)
      .eq("user_id", userId)
      .eq("recommended_by_ai", true)
      .gte("date", startDate)
      .lte("date", endDateStr)
      .order("date", { ascending: true });

    if (error) throw error;

    // Group by date
    const mealPlansByDay = {};
    plans.forEach(plan => {
      const dateStr = plan.date.split('T')[0];
      if (!mealPlansByDay[dateStr]) {
        mealPlansByDay[dateStr] = { breakfast: [], lunch: [], dinner: [] };
      }
      if (plan.meals) {
        const mealType = plan.meals.meal_type;
        if (mealPlansByDay[dateStr][mealType]) {
          mealPlansByDay[dateStr][mealType].push(plan.meals);
        }
      }
    });

    res.status(200).json({
      success: true,
      mealPlansByDay
    });

  } catch (error) {
    console.error("getMealPlan error:", error);
    res.status(500).json({ 
      success: false, 
      error: error?.message || "Failed to fetch meal plan" 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`API Server running on http://localhost:${PORT}`);
});