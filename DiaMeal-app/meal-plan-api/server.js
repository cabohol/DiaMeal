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
// app.use(cors({
//   origin: 'http://localhost:5173', // Your Vue app URL
//   credentials: true
// }));
// app.use(express.json());

app.use(cors({
  origin: true, // Allow all origins for now
  credentials: true
}));
app.use(express.json());

// --- Helper function to filter ingredients based on user constraints ---
function filterIngredientsByConstraints(ingredients, allergies, religiousDiets, diabetesType) {
  return ingredients.filter(ingredient => {
    // Filter out allergens
    if (allergies.length > 0) {
      const allergenList = ingredient.common_allergens || [];
      const hasAllergen = allergies.some(allergy => 
        allergenList.some(allergen => 
          allergen.toLowerCase().includes(allergy.toLowerCase()) ||
          allergy.toLowerCase().includes(allergen.toLowerCase())
        )
      );
      if (hasAllergen) return false;
    }

    // Filter based on religious dietary restrictions
    for (const diet of religiousDiets) {
      switch (diet.toLowerCase()) {
        case 'halal':
          if (!ingredient.is_halal) return false;
          break;
        case 'kosher':
          if (!ingredient.is_kosher) return false;
          break;
        case 'vegetarian':
          if (!ingredient.is_vegetarian) return false;
          break;
        case 'vegan':
          if (!ingredient.is_vegan) return false;
          break;
      }
    }

    // Filter based on availability
    if (ingredient.availability === 'unavailable') {
      return false;
    }

    return true;
  });
}

// REPLACE YOUR EXISTING /api/generateMealPlan endpoint with this updated version:
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

    // --- 3) Pull latest user profile, constraints, AND available ingredients ---
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

    // --- NEW: Fetch available ingredients from database ---
    const { data: ingredientsData, error: ingredientsError } = await supabase
      .from("ingredients")
      .select("*")
      .order("name", { ascending: true });

    if (ingredientsError) {
      console.error('Ingredients fetch error:', ingredientsError);
      throw ingredientsError;
    }

    const allergiesList = (allergiesData || []).map(a => a.allergy).filter(Boolean);
    const religiousList = (religiousData || []).map(r => r.diet_type).filter(Boolean);

    // --- Filter ingredients based on user constraints ---
    const availableIngredients = filterIngredientsByConstraints(
      ingredientsData || [],
      allergiesList,
      religiousList,
      user.diabetes_type
    );

    console.log(`Using ${availableIngredients.length} filtered ingredients for meal planning...`);

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

    // --- 5) Generate 7 days of meals using Groq with ingredients ---
    const systemSchema = `
Return ONLY valid JSON (no markdown, no commentary), matching exactly this TypeScript type:

type Meal = {
  name: string;
  meal_type: "breakfast" | "lunch" | "dinner";
  calories: number;                // kcal
  ingredients: string[];           // MUST use ingredients from the provided available_ingredients list
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

CRITICAL RULES:
- Use ONLY ingredients from the provided available_ingredients list
- Each meal's ingredients array must contain ingredient names that exist in available_ingredients
- Generate UNIQUE meals for each day (avoid repeating the same meal across days)
- Consider ingredient categories, nutritional values, and diabetes-friendliness flags
- For diabetes management: prioritize ingredients with is_diabetic_friendly=true, high fiber, lean protein
- Respect budget constraints by balancing affordable and premium ingredients
- Create balanced nutrition across all meals using the ingredient nutritional data
`;

    const content = {
      instruction: "Generate a complete 7-day meal plan using ONLY the provided ingredients. Create nutritionally balanced, diabetes-friendly meals that respect user constraints.",
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
      religious_diets: religiousList,
      available_ingredients: availableIngredients.map(ing => ({
        name: ing.name,
        category: ing.category,
        calories_per_serving: ing.calories_per_serving,
        protein_grams: ing.protein_grams,
        carbs_grams: ing.carbs_grams,
        fat_grams: ing.fat_grams,
        fiber_grams: ing.fiber_grams,
        is_diabetic_friendly: ing.is_diabetic_friendly,
        is_halal: ing.is_halal,
        is_kosher: ing.is_kosher,
        is_vegetarian: ing.is_vegetarian,
        is_vegan: ing.is_vegan,
        common_allergens: ing.common_allergens,
        typical_serving_size: ing.typical_serving_size,
        availability: ing.availability
      }))
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

    // --- 7) Validate ingredients in generated meals ---
    const availableIngredientNames = new Set(availableIngredients.map(ing => ing.name.toLowerCase()));
    
    for (let dayNum = 1; dayNum <= 7; dayNum++) {
      const dayKey = `day${dayNum}`;
      const dayMeals = weekPlan[dayKey];
      
      if (!dayMeals) {
        throw new Error(`Missing meals for ${dayKey}`);
      }

      for (const mealType of ["breakfast", "lunch", "dinner"]) {
        const mealsForType = dayMeals[mealType];
        
        if (!Array.isArray(mealsForType) || mealsForType.length !== 3) {
          throw new Error(`Invalid structure for ${dayKey} ${mealType}`);
        }

        // Validate ingredients exist in our database
        for (const meal of mealsForType) {
          if (Array.isArray(meal.ingredients)) {
            for (const ingredient of meal.ingredients) {
              if (!availableIngredientNames.has(ingredient.toLowerCase())) {
                console.warn(`Warning: Ingredient "${ingredient}" not found in database for meal "${meal.name}"`);
              }
            }
          }
        }
      }
    }

    // --- 8) Save all meals and plans into DB with ingredient relationships ---
    const startDate = new Date();
    const mealPlansByDay = {};

    for (let dayNum = 1; dayNum <= 7; dayNum++) {
      const dayKey = `day${dayNum}`;
      const dayMeals = weekPlan[dayKey];
      
      // Calculate date for this day
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + (dayNum - 1));
      const dateStr = currentDate.toISOString().split('T')[0];
      
      mealPlansByDay[dateStr] = { breakfast: [], lunch: [], dinner: [] };

      // Process each meal type for this day
      for (const mealType of ["breakfast", "lunch", "dinner"]) {
        const mealsForType = dayMeals[mealType];

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

          // --- NEW: Create meal-ingredient relationships ---
          if (Array.isArray(meal.ingredients) && meal.ingredients.length > 0) {
            const ingredientRelationships = [];
            
            for (const ingredientName of meal.ingredients) {
              // Find the ingredient in our database
              const dbIngredient = availableIngredients.find(
                ing => ing.name.toLowerCase() === ingredientName.toLowerCase()
              );
              
              if (dbIngredient) {
                ingredientRelationships.push({
                  meal_id: mealRow.id,
                  ingredient_id: dbIngredient.id,
                  quantity: 1, // Default quantity, could be enhanced later
                  unit: dbIngredient.typical_serving_size || 'serving'
                });
              }
            }

            if (ingredientRelationships.length > 0) {
              const { error: relationError } = await supabase
                .from("meal_ingredients")
                .insert(ingredientRelationships);
              
              if (relationError) {
                console.error('Meal ingredients relationship error:', relationError);
                // Don't throw error, just log it as this is supplementary data
              }
            }
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

    // --- 9) Respond with structured JSON ---
    return res.status(200).json({
      success: true,
      message: "7-day meal plan generated successfully using ingredient database",
      mealPlansByDay,
      isExisting: false,
      ingredientsUsed: availableIngredients.length
    });

  } catch (error) {
    console.error("generateMealPlan error:", error);
    return res
      .status(500)
      .json({ success: false, error: error?.message || "Internal server error" });
  }
});

// KEEP your existing /api/getMealPlan/:userId endpoint as is

// ADD these new endpoints at the end, before app.listen():

// Get ingredients endpoint
app.get('/api/getIngredients', async (req, res) => {
  try {
    const { category, diabetic_friendly, search } = req.query;
    
    let query = supabase.from('ingredients').select('*');
    
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }
    
    if (diabetic_friendly === 'true') {
      query = query.eq('is_diabetic_friendly', true);
    }
    
    if (search) {
      query = query.ilike('name', `%${search}%`);
    }
    
    query = query.order('name', { ascending: true });
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    res.status(200).json({
      success: true,
      ingredients: data || []
    });
    
  } catch (error) {
    console.error("getIngredients error:", error);
    res.status(500).json({ 
      success: false, 
      error: error?.message || "Failed to fetch ingredients" 
    });
  }
});

// Get meal with ingredients endpoint
app.get('/api/getMealWithIngredients/:mealId', async (req, res) => {
  try {
    const { mealId } = req.params;
    
    const { data: meal, error: mealError } = await supabase
      .from('meals')
      .select(`
        *,
        meal_ingredients (
          quantity,
          unit,
          ingredients (*)
        )
      `)
      .eq('id', mealId)
      .single();
    
    if (mealError) throw mealError;
    
    res.status(200).json({
      success: true,
      meal
    });
    
  } catch (error) {
    console.error("getMealWithIngredients error:", error);
    res.status(500).json({ 
      success: false, 
      error: error?.message || "Failed to fetch meal with ingredients" 
    });
  }
});

// Add this endpoint to your server.js file, before app.listen()

app.get('/api/getMealPlan/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ success: false, error: "Missing userId" });
    }

    // Get existing meal plans for today and the next 6 days
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + 6);

    const { data: mealPlans, error } = await supabase
      .from("meal_plans")
      .select(`
        *,
        meals (*)
      `)
      .eq("user_id", userId)
      .eq("recommended_by_ai", true)
      .gte("date", startDate.toISOString().split('T')[0])
      .lte("date", endDate.toISOString().split('T')[0])
      .order("date", { ascending: true });

    if (error) {
      console.error('Meal plans fetch error:', error);
      throw error;
    }

    // Group meal plans by date
    const mealPlansByDay = {};
    (mealPlans || []).forEach(plan => {
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

    return res.status(200).json({
      success: true,
      mealPlansByDay,
      hasPlans: Object.keys(mealPlansByDay).length > 0
    });

  } catch (error) {
    console.error("getMealPlan error:", error);
    return res.status(500).json({ 
      success: false, 
      error: error?.message || "Failed to fetch meal plans" 
    });
  }
});



// Keep your existing health check and app.listen() as they are
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// app.listen(PORT, () => {
//   console.log(`API Server running on http://localhost:${PORT}`);
// });