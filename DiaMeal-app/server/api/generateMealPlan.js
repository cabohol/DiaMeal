import { Groq } from "groq-sdk";
import { supabase } from "../utils/supabase.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Helper function to filter ingredients based on user constraints
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

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ success: false, error: "Method not allowed" });
    }

    // --- Parse body manually ---
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(buffers).toString() || "{}");
    const { user_id } = body;

    if (!user_id) {
      return res.status(400).json({ success: false, error: "Missing user_id" });
    }

    // --- 2) Pull latest user profile, constraints, AND available ingredients ---
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", user_id)
      .single();
    if (userError || !user) throw userError || new Error("User not found");

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

    console.log(`Using ${availableIngredients.length} filtered ingredients for daily meal planning...`);

    // --- 3) Ask Groq for deterministic JSON (no streaming) with ingredients ---
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

type Plan = {
  meals: {
    breakfast: [Meal, Meal, Meal];
    lunch: [Meal, Meal, Meal];
    dinner: [Meal, Meal, Meal];
  }
};

CRITICAL RULES:
- Use ONLY ingredients from the provided available_ingredients list
- Each meal's ingredients array must contain ingredient names that exist in available_ingredients
- Consider ingredient categories, nutritional values, and diabetes-friendliness flags
- For diabetes management: prioritize ingredients with is_diabetic_friendly=true, high fiber, lean protein
- Respect budget constraints by balancing affordable and premium ingredients
- Create balanced nutrition using the ingredient nutritional data
- Keep names and fields concise.
`;

    const content = {
      instruction: "Generate 3 meal types with 3 alternatives each for the next day using ONLY the provided ingredients.",
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
      throw new Error("AI response was not valid JSON.");
    }

    // Validate minimum structure
    const meals = ai?.meals || {};
    for (const k of ["breakfast", "lunch", "dinner"]) {
      if (!Array.isArray(meals[k]) || meals[k].length !== 3) {
        throw new Error(`AI returned invalid structure for ${k}.`);
      }
    }

    // --- 5) Validate ingredients in generated meals ---
    const availableIngredientNames = new Set(availableIngredients.map(ing => ing.name.toLowerCase()));
    
    for (const mealType of ["breakfast", "lunch", "dinner"]) {
      for (const meal of meals[mealType]) {
        if (Array.isArray(meal.ingredients)) {
          for (const ingredient of meal.ingredients) {
            if (!availableIngredientNames.has(ingredient.toLowerCase())) {
              console.warn(`Warning: Ingredient "${ingredient}" not found in database for meal "${meal.name}"`);
            }
          }
        }
      }
    }

    // --- 6) Save all alternatives into DB with ingredient relationships ---
    const today = new Date();
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
        if (mealErr) throw mealErr;

        // --- NEW: Create meal-ingredient relationships ---
        if (Array.isArray(alt.ingredients) && alt.ingredients.length > 0) {
          const ingredientRelationships = [];
          
          for (const ingredientName of alt.ingredients) {
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
        if (planErr) throw planErr;

        saved.push({ meal: mealRow, mealPlan: planRow });
      }
    }

    // --- 7) Respond with clean JSON ---
    return res.status(200).json({
      success: true,
      message: "Daily meal plan generated successfully using ingredient database",
      mealsByType: meals, // { breakfast: [3], lunch: [3], dinner: [3] }
      saved,
      ingredientsUsed: availableIngredients.length
    });
  } catch (error) {
    console.error("generateMealPlan error:", error);
    return res
      .status(500)
      .json({ success: false, error: error?.message || "Internal server error" });
  }
}