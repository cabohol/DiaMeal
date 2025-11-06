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

    // --- 3.5) VALIDATE REQUIRED USER DATA ---
    const missingFields = [];
    if (!user.gender) missingFields.push('gender');
    if (!user.age) missingFields.push('age');
    if (!user.height_cm) missingFields.push('height');
    if (!user.weight_kg) missingFields.push('weight');
    if (!user.diabetes_type) missingFields.push('diabetes type');
    if (!user.budget || user.budget < 100) missingFields.push('budget (minimum ₱100)');

    if (missingFields.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: `Incomplete user profile. Missing: ${missingFields.join(', ')}`,
        missingFields
      });
    }

    const { data: lab, error: labError } = await supabase
      .from("lab_results")
      .select("*")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

       if (!lab) {
      return res.status(400).json({ 
        success: false, 
        error: "No lab results found. Please complete your lab results first." 
      });
    }

    const missingLabResults = [];
    if (!lab.fasting_blood_sugar || lab.fasting_blood_sugar <= 0) 
      missingLabResults.push('Fasting Blood Sugar');
    if (!lab.postprandial_blood_sugar || lab.postprandial_blood_sugar <= 0) 
      missingLabResults.push('Postprandial Blood Sugar');
    if (!lab.hba1c || lab.hba1c <= 0) 
      missingLabResults.push('HbA1c');
    if (!lab.glucose_tolerance || lab.glucose_tolerance <= 0) 
      missingLabResults.push('Glucose Tolerance');

    if (missingLabResults.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: `Incomplete lab results. Missing: ${missingLabResults.join(', ')}`,
        missingLabResults
      });
    }

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

  function validateMealNutrition(meal, mealType, dayKey) {
  const errors = [];
  
  // 1. Check nutrition values are present and realistic
  if (!meal.calories || meal.calories < 100 || meal.calories > 1000) {
    errors.push(`${dayKey}.${mealType} "${meal.name}" has invalid calories: ${meal.calories}`);
  }
  
  // 2. Check macros are present (can be 0 for some, but must exist)
  if (typeof meal.carbs !== 'number') {
    errors.push(`${dayKey}.${mealType} "${meal.name}" missing carbs`);
  }
  if (typeof meal.protein !== 'number') {
    errors.push(`${dayKey}.${mealType} "${meal.name}" missing protein`);
  }
  if (typeof meal.fat !== 'number') {
    errors.push(`${dayKey}.${mealType} "${meal.name}" missing fat`);
  }
  if (typeof meal.fiber !== 'number') {
    errors.push(`${dayKey}.${mealType} "${meal.name}" missing fiber`);
  }
  
  // 3. Check procedures are complete
  if (!meal.procedures || meal.procedures.length < 50) {
    errors.push(`${dayKey}.${mealType} "${meal.name}" has incomplete procedures`);
  }
  
  if (meal.procedures && meal.procedures.includes('...')) {
    errors.push(`${dayKey}.${mealType} "${meal.name}" has truncated procedures (contains "...")`);
  }
  
  // 4. Check ingredient amounts exist
  if (!meal.ingredient_amounts || Object.keys(meal.ingredient_amounts).length === 0) {
    errors.push(`${dayKey}.${mealType} "${meal.name}" missing ingredient_amounts`);
  }
  
  return errors;
}

    const systemSchema = `
    You are a Filipino meal planning assistant. Generate a 7-day meal plan in JSON format, matching exactly this TypeScript type:
    
    type IngredientAmount = {
      name: string;           // Ingredient name (must match available_ingredients)
      amount: number;         // Amount in grams
      unit: string;          // Unit (usually "g" for grams)
    };

    type Meal = {
      name: string;
      meal_type: "breakfast" | "lunch" | "dinner";
      calories: number;        
      carbs: number;                   // REQUIRED: Grams of carbohydrates (calculated from ingredients)
      protein: number;                 // REQUIRED: Grams of protein (calculated from ingredients)
      fat: number;                     // REQUIRED: Grams of fat (calculated from ingredients)
      fiber: number;         
      ingredients: string[];           // Keep this for backward compatibility
      ingredient_amounts: {            // NEW: Add specific amounts
        [ingredientName: string]: {
          amount: number;
          unit: string;
        }
      };
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

    INGREDIENT DIVERSITY REQUIREMENTS (CRITICAL):
    - Avoid repeating the same meal across multiple days
    - Use different protein sources each day (e.g., chicken Day 1, fish Day 2, pork Day 3)
    - Rotate vegetables and carbs throughout the week
    - Each day should feel fresh and varied
    - If an ingredient appears in Day 1 breakfast, avoid it in Day 2-7 breakfast
    - Only repeat specific ingredients (not entire meals) if absolutely necessary
    - Prioritize ingredient variety while staying within budget
    - Track all meal names used and deliberately choose completely different dishes for each day

    CRITICAL NUTRITION CALCULATION RULES:
    1. **You MUST calculate actual nutrition values** from ingredient amounts
    2. **Formula for each nutrient:**
      - carbs = Σ (ingredient_amount_g / 100) × ingredient.carbs_per_100g
      - protein = Σ (ingredient_amount_g / 100) × ingredient.protein_per_100g
      - fat = Σ (ingredient_amount_g / 100) × ingredient.fat_per_100g
      - fiber = Σ (ingredient_amount_g / 100) × ingredient.fiber_per_100g
      - calories = Σ (ingredient_amount_g / 100) × ingredient.calories_per_100g

    3. **Example calculation:**
      If using 120g chicken (protein_per_100g: 27):
      protein_from_chicken = (120 / 100) × 27 = 32.4g

    4. **ALL nutrition values MUST be numbers > 0** (can be 0 only for fiber in some cases)

    5. **Round to 1 decimal place** for precision

    INGREDIENT AMOUNTS (NEW - CRITICAL):
    - For EACH ingredient used, specify the exact amount needed in grams
    - Use realistic amounts based on typical Filipino serving sizes:
      * Rice: 150-200g cooked per serving
      * Meat/Fish: 80-120g per serving  
      * Vegetables: 50-150g depending on type
      * Cooking oil: 5-15g (1-3 teaspoons)
      * Garlic: 5-10g (2-3 cloves)
      * Onions: 30-50g (small to medium)
      * Seasonings: 2-5g
    - Store amounts in ingredient_amounts field as an object
    - Calculate estimated_cost_per_serving based on these exact amounts
    
    COST CALCULATION:
    - Use the exact gram amounts to calculate costs
    - Formula: (ingredient_amount_in_grams / 1000) * price_per_kg
    - Sum all ingredient costs for total estimated_cost_per_serving
    
    Example meal structure:
    {
      "name": "Chicken Adobo",
      "meal_type": "lunch",
      "calories": 350,
      "carbs": 45.2,
      "protein": 34.8,
      "fat": 15.3,
      "fiber": 2.1,
      "ingredients": ["Chicken", "Soy Sauce", "Vinegar", "Garlic", "Bay Leaf"],
      "ingredient_amounts": {
        "Chicken": { "amount": 120, "unit": "g" },
        "Soy Sauce": { "amount": 30, "unit": "g" },
        "Vinegar": { "amount": 20, "unit": "g" },
        "Garlic": { "amount": 10, "unit": "g" },
        "Bay Leaf": { "amount": 1, "unit": "g" }
      },
      "estimated_cost_per_serving": 45.50,
      "serving_size": "1 plate",
      "servings_count": 1,
      "procedures": ""Step 1: Instruction here.\\n\\nStep 2: Next instruction.\\n\\nStep 3: Final step."",
      "preparation_time": "45 minutes"
    };

    INGREDIENT USAGE (CRITICAL):
    - You will receive a list called "available_ingredients"
    - You MUST ONLY use ingredient names that EXACTLY match names in that list
    - DO NOT use any ingredient not in the list
    - DO NOT use variations or synonyms (e.g., if list has "Chicken Breast", don't use "Chicken")
    - If an ingredient is not in the list, DO NOT use it - find an alternative from the list
      Example: If available_ingredients includes ["White Rice", "Brown Rice", "Chicken Breast", "Tomato"],
      you can ONLY use those exact names. You cannot use "Rice" (too general) or "Tomatoes" (plural).

    - Each ingredient has nutritional data, cost, and dietary flags
    - Use ONLY ingredients from the provided available_ingredients list
    - Each meal's ingredients array must contain ingredient names that exist in available_ingredients  
    - Check ingredient flags (is_diabetic_friendly, is_halal, etc.) before using
    - Use ingredient.estimated_price for cost calculations
    - For each ingredient, specify the exact amount in grams
    - Calculate nutrition based on these amounts
    - Consider the user's caloric needs and budget
    

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

    4. **Lab Results** — Use to fine-tune recommendations:
      - **Fasting Blood Sugar > 100 mg/dL:** Reduce carbohydrate load at breakfast.
      - **Postprandial Blood Sugar > 140 mg/dL:** Lower total daily carb intake; increase fiber and lean protein.
      - **HbA1c > 6.5%:** Apply strict low-glycemic meal plans with minimal added sugars.
      - **Poor Glucose Tolerance:** Recommend smaller, more frequent meals to stabilize blood sugar.

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
    IMPORTANT: For procedures, write COMPLETE instructions. Each step should be detailed and NOT cut off with "..." 
    - Each step should be detailed but concise (1-2 sentences per step)
    - Example: "Step 1: Instruction here.\\n\\nStep 2: Next instruction.\\n\\nStep 3: Final step."
    - Include specific temperatures, times, and measurements
    - 4-9 steps depending on complexity
    - **NEVER write "Not available" or incomplete procedures**
    - **ALWAYS write COMPLETE step-by-step instructions**

    COST CALCULATION:
    - Use ingredient.estimated_price to estimate costs
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

   
    DIVERSITY REQUIREMENTS (CRITICAL - STRICTLY ENFORCE):
    - ABSOLUTELY NO MEAL REPETITION: Each meal name must be UNIQUE across all 7 days
    - DO NOT reuse the same dish name even with different variations
    - Track all meal names used and ensure 100% uniqueness across the entire week
    - Use ${availableIngredients.length} ingredients creatively to create diverse meals
    - Each of the 63 meals (7 days × 3 meal types × 3 options) must have a unique name

     INGREDIENT AMOUNT REQUIREMENTS (CRITICAL):
    - Specify EXACT gram amounts for every ingredient
    - Use realistic portions suitable for one serving
    - Base amounts on typical Filipino cooking practices
    - Ensure amounts align with calorie calculations
    - Calculate accurate cost based on these specific amounts

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
        estimated_price: ing.estimated_price,  
        calories_per_100g: ing.calories_per_100g,
        protein_per_100g: ing.protein_per_100g,
        carbs_per_100g: ing.carbs_per_100g,
        fat_per_100g: ing.fat_per_100g,
        fiber_per_100g: ing.fiber_per_100g,
        glycemic_index: ing.glycemic_index,
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
      top_p: 0.9,       
      max_completion_tokens: 32000,
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

    // ADD this BEFORE saving meals to database (around line 650):
function validateAndFixIngredients(weekPlan, availableIngredients) {
  console.log('🔍 Starting strict ingredient validation...');
  
  // Create lookup maps for case-insensitive matching
  const ingredientMap = new Map();
  availableIngredients.forEach(ing => {
    ingredientMap.set(ing.name.toLowerCase().trim(), ing.name);
  });
  
  const allErrors = [];
  let fixedCount = 0;
  let invalidCount = 0;
  
  for (let dayNum = 1; dayNum <= 7; dayNum++) {
    const dayKey = `day${dayNum}`;
    const dayMeals = weekPlan[dayKey];
    
    if (!dayMeals) continue;
    
    for (const mealType of ["breakfast", "lunch", "dinner"]) {
      const mealsForType = dayMeals[mealType];
      
      if (!Array.isArray(mealsForType)) continue;
      
      for (const meal of mealsForType) {
        if (!Array.isArray(meal.ingredients)) continue;
        
        // Validate each ingredient
        const validatedIngredients = [];
        const validatedAmounts = {};
        
        for (const ingredientName of meal.ingredients) {
          const lowerName = ingredientName.toLowerCase().trim();
          
          // Try exact match first
          if (ingredientMap.has(lowerName)) {
            const correctName = ingredientMap.get(lowerName);
            validatedIngredients.push(correctName);
            
            // Preserve or fix ingredient amounts
            if (meal.ingredient_amounts) {
              const amountData = meal.ingredient_amounts[ingredientName] || 
                                 meal.ingredient_amounts[correctName] || 
                                 { amount: 100, unit: 'g' };
              validatedAmounts[correctName] = amountData;
            }
            
            if (correctName !== ingredientName) {
              console.log(`✓ Fixed: "${ingredientName}" → "${correctName}"`);
              fixedCount++;
            }
          } else {
            // Try fuzzy matching (find similar names)
            const similar = findSimilarIngredient(ingredientName, availableIngredients);
            
            if (similar) {
              console.log(`⚠️ Replaced invalid "${ingredientName}" with similar "${similar.name}" in ${meal.name}`);
              validatedIngredients.push(similar.name);
              validatedAmounts[similar.name] = { amount: 100, unit: 'g' };
              fixedCount++;
            } else {
              console.error(`❌ Invalid ingredient "${ingredientName}" in ${meal.name} - NO MATCH FOUND`);
              allErrors.push(`${dayKey}.${mealType}: "${meal.name}" uses invalid ingredient "${ingredientName}"`);
              invalidCount++;
            }
          }
        }
        
        // Update meal with validated ingredients
        meal.ingredients = validatedIngredients;
        meal.ingredient_amounts = validatedAmounts;
      }
    }
  }
  
  console.log(`\n📊 Validation Summary:`);
  console.log(`  ✓ Fixed: ${fixedCount}`);
  console.log(`  ❌ Invalid: ${invalidCount}`);
  console.log(`  📝 Errors: ${allErrors.length}`);
  
  if (invalidCount > 10) {
    throw new Error(
      `Too many invalid ingredients (${invalidCount}). AI is not following instructions. ` +
      `Sample errors:\n${allErrors.slice(0, 5).join('\n')}`
    );
  }
  
  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    fixedCount,
    invalidCount
  };
}

// Add this after line 650 (after weekPlan validation)

// CRITICAL: Validate nutrition values
console.log('🔍 Validating nutrition values...');
let nutritionErrors = [];

for (let dayNum = 1; dayNum <= 7; dayNum++) {
  const dayKey = `day${dayNum}`;
  const dayMeals = weekPlan[dayKey];
  
  for (const mealType of ["breakfast", "lunch", "dinner"]) {
    const mealsForType = dayMeals[mealType];
    
    mealsForType.forEach((meal, idx) => {
      // Check calories
      if (!meal.calories || meal.calories < 100 || meal.calories > 1000) {
        nutritionErrors.push(
          `${dayKey}.${mealType}[${idx}] "${meal.name}" has invalid calories: ${meal.calories}`
        );
      }
      
      // Check macros
      if (typeof meal.carbs !== 'number' || meal.carbs < 0) {
        nutritionErrors.push(
          `${dayKey}.${mealType}[${idx}] "${meal.name}" missing/invalid carbs: ${meal.carbs}`
        );
      }
      
      if (typeof meal.protein !== 'number' || meal.protein < 0) {
        nutritionErrors.push(
          `${dayKey}.${mealType}[${idx}] "${meal.name}" missing/invalid protein: ${meal.protein}`
        );
      }
      
      if (typeof meal.fat !== 'number' || meal.fat < 0) {
        nutritionErrors.push(
          `${dayKey}.${mealType}[${idx}] "${meal.name}" missing/invalid fat: ${meal.fat}`
        );
      }
      
      // Check procedures
      if (!meal.procedures || meal.procedures.length < 50) {
        nutritionErrors.push(
          `${dayKey}.${mealType}[${idx}] "${meal.name}" has incomplete procedures`
        );
      }
      
      if (meal.procedures && meal.procedures.includes('...')) {
        nutritionErrors.push(
          `${dayKey}.${mealType}[${idx}] "${meal.name}" has truncated procedures`
        );
      }
      
      // Check ingredient amounts
      if (!meal.ingredient_amounts || Object.keys(meal.ingredient_amounts).length === 0) {
        nutritionErrors.push(
          `${dayKey}.${mealType}[${idx}] "${meal.name}" missing ingredient_amounts`
        );
      }
    });
  }
}

if (nutritionErrors.length > 0) {
  console.error('❌ Nutrition validation failed:');
  nutritionErrors.forEach(err => console.error(`  - ${err}`));
  
  throw new Error(
    `AI generated incomplete meal plan. Issues found:\n${nutritionErrors.slice(0, 10).join('\n')}\n` +
    `(${nutritionErrors.length} total issues)`
  );
}

console.log('✅ Nutrition validation passed');

// Helper function for fuzzy matching
function findSimilarIngredient(searchName, availableIngredients) {
  const search = searchName.toLowerCase().trim();
  
  // Try partial matches
  for (const ing of availableIngredients) {
    const ingName = ing.name.toLowerCase();
    
    // Check if search is contained in ingredient name or vice versa
    if (ingName.includes(search) || search.includes(ingName)) {
      return ing;
    }
  }
  
  // Try removing plurals
  const singularSearch = search.replace(/s$/, '');
  for (const ing of availableIngredients) {
    const ingName = ing.name.toLowerCase();
    if (ingName === singularSearch || ingName === search + 's') {
      return ing;
    }
  }
  
  return null;
}


        // Add comprehensive meal validation
    const allValidationErrors = [];

    for (let dayNum = 1; dayNum <= 7; dayNum++) {
      const dayKey = `day${dayNum}`;
      const dayMeals = weekPlan[dayKey];
      
      if (!dayMeals) {
        allValidationErrors.push(`Missing ${dayKey}`);
        continue;
      }

      for (const mealType of ["breakfast", "lunch", "dinner"]) {
        const mealsForType = dayMeals[mealType];
        
        if (!Array.isArray(mealsForType)) {
          allValidationErrors.push(`${dayKey}.${mealType} is not an array`);
          continue;
        }
        
        if (mealsForType.length !== 3) {
          allValidationErrors.push(`${dayKey}.${mealType} has ${mealsForType.length} meals instead of 3`);
        }
        
        // Validate each meal's nutrition and completeness
        mealsForType.forEach((meal, idx) => {
          const mealErrors = validateMealNutrition(meal, `${mealType}[${idx}]`, dayKey);
          allValidationErrors.push(...mealErrors);
        });
      }
    }

    // If there are validation errors, reject the plan
    if (allValidationErrors.length > 0) {
      console.error('❌ Meal plan validation failed:');
      allValidationErrors.forEach(err => console.error(`  - ${err}`));
      
      throw new Error(
        `AI generated incomplete meal plan. Issues found:\n${allValidationErrors.slice(0, 10).join('\n')}\n` +
        `(${allValidationErrors.length} total issues)`
      );
    }

    console.log('✅ Meal plan validation passed');

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
            carbs: typeof meal.carbs === "number" ? meal.carbs : 0,
            protein: typeof meal.protein === "number" ? meal.protein : 0,
            fat: typeof meal.fat === "number" ? meal.fat : 0,
            fiber: typeof meal.fiber === "number" ? meal.fiber : 0,
            ingredients: Array.isArray(meal.ingredients) ? meal.ingredients : [],
            procedures: meal.procedures || "",
            preparation_time: meal.preparation_time || null,
            name: meal.name || `${mealType} option`,
            user_id,
            // NEW: Add these
            estimated_cost_per_serving: meal.estimated_cost_per_serving || 0,
            serving_size: meal.serving_size || '1 serving',
            servings_count: meal.servings_count || 1,
            ingredient_amounts: meal.ingredient_amounts || {}
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
                // Get the specific amount for this ingredient
                const amountData = meal.ingredient_amounts?.[ingredientName] || 
                                  meal.ingredient_amounts?.[dbIngredient.name] || 
                                  { amount: 100, unit: 'g' }; // Default fallback
                
                ingredientRelationships.push({
                  meal_id: mealRow.id,
                  ingredient_id: dbIngredient.id,
                  quantity: amountData.amount, // Use the specific amount
                  unit: amountData.unit || 'g'  // Use the specific unit
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
              } else {
                console.log(`Saved ${ingredientRelationships.length} ingredient relationships for meal ${mealRow.id}`);
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