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
         case 'catholic':
          if (!ingredient.is_catholic) return false;
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

// Add this validation function before the /api/generateMealPlan endpoint
function validateWeekPlan(weekPlan) {
  const errors = [];
  
  for (let dayNum = 1; dayNum <= 7; dayNum++) {
    const dayKey = `day${dayNum}`;
    const dayMeals = weekPlan[dayKey];
    
    if (!dayMeals) {
      errors.push(`Missing ${dayKey}`);
      continue;
    }

    for (const mealType of ["breakfast", "lunch", "dinner"]) {
      const mealsForType = dayMeals[mealType];
      
      if (!Array.isArray(mealsForType)) {
        errors.push(`${dayKey}.${mealType} is not an array`);
        continue;
      }
      
      if (mealsForType.length !== 3) {
        errors.push(`${dayKey}.${mealType} has ${mealsForType.length} meals instead of 3`);
      }
      
      // Validate each meal has required fields
      mealsForType.forEach((meal, idx) => {
        if (!meal.name) {
          errors.push(`${dayKey}.${mealType}[${idx}] missing name`);
        }
        if (!meal.ingredients || !Array.isArray(meal.ingredients)) {
          errors.push(`${dayKey}.${mealType}[${idx}] missing or invalid ingredients`);
        }
        if (typeof meal.calories !== 'number') {
          errors.push(`${dayKey}.${mealType}[${idx}] missing or invalid calories`);
        }
      });
    }
  }
  
  return errors;
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
    // In server.js, in the force_regenerate block (around line 206):
  if (force_regenerate) {
    // Delete ALL existing AI-generated meal plans for this user
    const { data: oldPlans } = await supabase
      .from("meal_plans")
      .select("meal_id")
      .eq("user_id", user_id)
      .eq("recommended_by_ai", true);

    if (oldPlans && oldPlans.length > 0) {
      const mealIds = oldPlans.map(p => p.meal_id).filter(Boolean);
      
      // Delete meal plans
      await supabase
        .from("meal_plans")
        .delete()
        .eq("user_id", user_id)
        .eq("recommended_by_ai", true);

      // Delete meal-ingredient relationships
      if (mealIds.length > 0) {
        await supabase
          .from("meal_ingredients")
          .delete()
          .in("meal_id", mealIds);
          
        // Delete meals
        await supabase
          .from("meals")
          .delete()
          .in("id", mealIds);
      }
    }
  }

    const systemSchema = `
    You are a Filipino meal planning assistant. Generate a 7-day meal plan in JSON format, matching exactly this TypeScript type:

    type Meal = {
      name: string;
      meal_type: "breakfast" | "lunch" | "dinner";
      calories: number;                
      ingredients: string[];           
      estimated_cost_per_serving: number;  
      serving_size: string;                
      servings_count: number;              
      procedures: string;              
      preparation_time: string;        
    };

    type WeekPlan = {
      day1: { breakfast: [Meal, Meal, Meal]; lunch: [Meal, Meal, Meal]; dinner: [Meal, Meal, Meal]; };
      day2: { breakfast: [Meal, Meal, Meal]; lunch: [Meal, Meal, Meal]; dinner: [Meal, Meal, Meal]; };
      day3: { breakfast: [Meal, Meal, Meal]; lunch: [Meal, Meal, Meal]; dinner: [Meal, Meal, Meal]; };
      day4: { breakfast: [Meal, Meal, Meal]; lunch: [Meal, Meal, Meal]; dinner: [Meal, Meal, Meal]; };
      day5: { breakfast: [Meal, Meal, Meal]; lunch: [Meal, Meal, Meal]; dinner: [Meal, Meal, Meal]; };
      day6: { breakfast: [Meal, Meal, Meal]; lunch: [Meal, Meal, Meal]; dinner: [Meal, Meal, Meal]; };
      day7: { breakfast: [Meal, Meal, Meal]; lunch: [Meal, Meal, Meal]; dinner: [Meal, Meal, Meal]; };
    };

    CRITICAL RULES: 
   - Total meals: 63 (7 days × 3 meal types × 3 options per type)
   - NO MORE, NO LESS than 3 options per meal type per day
    - Use ONLY ingredients from the provided available_ingredients list

    INGREDIENT USAGE (CRITICAL):
    - You will receive a list of available_ingredients
    - ONLY use ingredients from this list
    - Each ingredient has nutritional data, cost, and dietary flags
    - Use ONLY ingredients from the provided available_ingredients list
    - Each meal's ingredients array must contain ingredient names that exist in available_ingredients  
    - Check ingredient flags (is_diabetic_friendly, is_halal, etc.) before using
    - Use ingredient.price_range for cost calculations

    PERSONALIZATION REQUIREMENTS (VERY IMPORTANT):
    1. **Gender & Age**: Adjust portion sizes and calorie targets
      - Males typically need 2000-2500 kcal/day
      - Females typically need 1600-2000 kcal/day
      - Adjust based on age (older adults may need less)

    2. **Height & Weight**: Calculate caloric needs using BMI/BMR considerations
      - Consider if user is underweight, normal, overweight, or obese
      - Adjust meal portions accordingly

    3. **Diabetes Type**: CRITICAL for meal planning
      - Type 1: Focus on consistent carb counting, balanced meals
      - Type 2: Prioritize low-glycemic foods, high fiber, portion control
      - Always use is_diabetic_friendly=true ingredients when possible
      - Limit high-carb ingredients, avoid refined sugars

    4. **Lab Results**: Use to fine-tune recommendations
      - High Fasting Blood Sugar (>100 mg/dL): Reduce breakfast carbs
      - High Postprandial Blood Sugar (>140 mg/dL): Lower overall carb load
      - High HbA1c (>6.5%): Strict low-glycemic meal selection
      - Poor Glucose Tolerance: Smaller, more frequent meals

    5. **Allergies**: STRICTLY AVOID all allergens
      - Check ingredient.common_allergens array
      - Never include ingredients containing user's allergens

    6. **Religious Diets**: STRICTLY RESPECT dietary laws
      - Halal: Only use ingredients with is_halal=true
      - Kosher: Only use ingredients with is_kosher=true
      - Catholic: Only use ingredients with is_catholic=true
      - Vegetarian: Only use ingredients with is_vegetarian=true
      - Vegan: Only use ingredients with is_vegan=true

    7. **Budget**: Stay within weekly budget constraints
      - Max cost per meal: weekly_budget / 21
      - Prioritize affordable ingredients
      - Mix budget-friendly and moderate-cost meals

    NUTRITION GUIDELINES FOR DIABETICS:
    - Prioritize: High fiber (>5g per meal), lean protein (20-30g per meal)
    - Moderate: Complex carbs (30-45g per meal for Type 2)
    - Minimize: Simple sugars, refined carbs, high-glycemic foods
    - Include: Vegetables, whole grains, lean meats, healthy fats

    PROCEDURE FORMAT:
    - Write procedures as single string with numbered steps separated by \\n\\n
    - Example: "Step 1: Instruction here.\\n\\nStep 2: Next instruction.\\n\\nStep 3: Final step."
    - Include specific temperatures, times, and measurements
    - 4-9 steps depending on complexity

    COST CALCULATION:
    - Use ingredient.price_range to estimate costs
    - Calculate: estimated_cost_per_serving = sum(ingredient_cost × quantity)
    - serving_size: e.g., "1 plate", "1 bowl"
    - servings_count: typically 1 per person
    `;

    const content = {
      instruction: `Create a personalized 7-day Filipino meal plan strictly adhering to these user requirements:

    REQUIRED PERSONALIZATION:
    - Gender: ${user.gender} (adjust calorie needs accordingly)
    - Age: ${user.age} years (consider age-appropriate portions)
    - Height: ${user.height_cm} cm | Weight: ${user.weight_kg} kg (calculate BMI/caloric needs)
    - Diabetes Type: ${user.diabetes_type} (CRITICAL: follow diabetes-specific guidelines)
    - Budget: ₱${user.budget}/week (stay within cost constraints)

    STRICT CONSTRAINTS:
    ${allergiesList.length > 0 ? `- ALLERGIES: NEVER use ingredients containing: ${allergiesList.join(', ')}` : ''}
    ${religiousList.length > 0 ? `- RELIGIOUS DIETS: ONLY use ingredients that are: ${religiousList.join(', ')}` : ''}

    LAB RESULTS (use to optimize meal planning):
    ${lab ? `
    - Fasting Blood Sugar: ${lab.fasting_blood_sugar || 'N/A'} mg/dL
    - Postprandial Blood Sugar: ${lab.postprandial_blood_sugar || 'N/A'} mg/dL
    - HbA1c: ${lab.hba1c || 'N/A'}%
    - Glucose Tolerance: ${lab.glucose_tolerance || 'N/A'}
    ` : '- No lab results available'}

    Use this data to create meals that are:
    1. Safe for ${user.diabetes_type} diabetes management
    2. Nutritionally balanced for ${user.gender}, ${user.age} years old
    3. Appropriate portion sizes for ${user.height_cm}cm / ${user.weight_kg}kg
    4. Within ₱${user.budget} weekly budget
    5. Free from allergens: ${allergiesList.join(', ') || 'none'}
    6. Compliant with: ${religiousList.join(', ') || 'no restrictions'}`,
      
      budget_constraints: {
        total_weekly_budget: user.budget,
        target_daily_budget: Math.floor(user.budget / 7),
        max_meal_cost: Math.floor(user.budget / 21),
        priority: "Stay within budget while maintaining nutrition",
        currency: "PHP (₱)"
      },
      
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
        price_range: ing.price_range,  
        calories_per_serving: ing.calories_per_serving,
        protein_grams: ing.protein_grams,
        carbs_grams: ing.carbs_grams,
        fat_grams: ing.fat_grams,
        fiber_grams: ing.fiber_grams,
        is_diabetic_friendly: ing.is_diabetic_friendly,
        is_halal: ing.is_halal,
        is_kosher: ing.is_kosher,
        is_catholic: ing.is_catholic,
        is_vegetarian: ing.is_vegetarian,
        is_vegan: ing.is_vegan,
        common_allergens: ing.common_allergens,
        typical_serving_size: ing.typical_serving_size,
        availability: ing.availability
      }))
    };

    console.log('Calling Groq API for 7-day plan...');
    const chat = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      top_p: 0.95,
      max_completion_tokens: 10000, // Increased for 7-day plan
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

    // ✅ ADD BUDGET VALIDATION HERE (inside the function where 'user' exists)
let totalWeekCost = 0;
const weeklyBudget = user.budget;

for (let dayNum = 1; dayNum <= 7; dayNum++) {
  const dayKey = `day${dayNum}`;
  const dayMeals = weekPlan[dayKey];
  
  for (const mealType of ["breakfast", "lunch", "dinner"]) {
    const mealsForType = dayMeals[mealType];
    
    for (const meal of mealsForType) {
      if (typeof meal.estimated_cost_per_serving !== 'number') {
        console.warn(`Missing cost for meal: ${meal.name}`);
        meal.estimated_cost_per_serving = 0;
      }
      totalWeekCost += meal.estimated_cost_per_serving;
    }
  }
}

console.log(`Total week cost: ₱${totalWeekCost.toFixed(2)}`);
console.log(`Weekly budget: ₱${weeklyBudget}`);
console.log(`Budget status: ${totalWeekCost <= weeklyBudget ? '✅ Within budget' : '⚠️ Over budget'}`);

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

        // After parsing weekPlan from Groq, add this validation:
    for (let dayNum = 1; dayNum <= 7; dayNum++) {
      const dayKey = `day${dayNum}`;
      const dayMeals = weekPlan[dayKey];
      
      for (const mealType of ["breakfast", "lunch", "dinner"]) {
        const mealsForType = dayMeals[mealType];
        
        // CRITICAL: Ensure exactly 3 options
        if (!Array.isArray(mealsForType) || mealsForType.length !== 3) {
          console.error(`❌ ${dayKey} ${mealType} has ${mealsForType?.length || 0} meals instead of 3`);
          throw new Error(`Invalid meal count for ${dayKey} ${mealType}: expected 3, got ${mealsForType?.length || 0}`);
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
            user_id,
            // NEW: Add these
            estimated_cost_per_serving: meal.estimated_cost_per_serving || 0,
            serving_size: meal.serving_size || '1 serving',
            servings_count: meal.servings_count || 1
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

app.listen(PORT, () => {
  console.log(`API Server running on http://localhost:${PORT}`);
});