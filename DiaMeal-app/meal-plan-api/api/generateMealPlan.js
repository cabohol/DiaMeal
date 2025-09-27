// api/generateMealPlan.js
import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';

// Initialize clients
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Import your agent modules - you'll need to adapt these paths
// These should be in your utils or agents folder and properly exported
import { DiabetesAnalysisAgent } from '../utils/agents/DiabetesAnalysisAgent.js';
import { NutritionalCalculatorAgent } from '../utils/agents/NutritionalCalculatorAgent.js';
import { filterIngredientsByConstraints } from '../utils/filterIngredients.js';

export default async function handler(req, res) {
  // CRITICAL: Set CORS headers FIRST
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  console.log(`${req.method} /api/generateMealPlan`);

  if (req.method === 'POST') {
    try {
      const { user_id, force_regenerate = false } = req.body || {};
      
      if (!user_id) {
        return res.status(400).json({ 
          success: false, 
          error: 'Missing user_id' 
        });
      }

      // Check existing plans (unless force regenerating)
      if (!force_regenerate) {
        const { data: existingPlans, error: checkError } = await supabase
          .from('meal_plans')
          .select(`*, meals (*)`)
          .eq('user_id', user_id)
          .eq('recommended_by_ai', true)
          .gte('date', new Date().toISOString().split('T')[0])
          .order('date', { ascending: true });

        if (!checkError && existingPlans && existingPlans.length >= 21) {
          const plansByDate = {};
          existingPlans.forEach((plan) => {
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
            message: 'Using existing meal plan',
            mealPlansByDay: plansByDate,
            isExisting: true,
          });
        }
      }

      // Fetch user data
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user_id)
        .single();
      
      if (userError || !user) throw userError || new Error('User not found');

      const { data: lab } = await supabase
        .from('lab_results')
        .select('*')
        .eq('user_id', user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const { data: allergiesData } = await supabase
        .from('allergies')
        .select('allergy')
        .eq('user_id', user_id);

      const { data: religiousData } = await supabase
        .from('religious_diets')
        .select('diet_type')
        .eq('user_id', user_id);

      const { data: ingredientsData, error: ingredientsError } = await supabase
        .from('ingredients')
        .select('*')
        .order('name', { ascending: true });

      if (ingredientsError) throw ingredientsError;

      const allergiesList = (allergiesData || []).map((a) => a.allergy).filter(Boolean);
      const religiousList = (religiousData || []).map((r) => r.diet_type).filter(Boolean);

      // === AGENTIC AI ANALYSIS ===
      console.log('Starting Agentic AI Analysis...');

      // 1. Analyze diabetes condition
      const diabetesAnalysis = DiabetesAnalysisAgent.analyzeLabResults(lab);
      console.log('Diabetes Analysis:', {
        severity: diabetesAnalysis.severity,
        carbLimit: diabetesAnalysis.carbLimit,
        riskFactors: diabetesAnalysis.riskFactors
      });

      // 2. Calculate nutritional requirements
      const bmr = NutritionalCalculatorAgent.calculateBMR(
        user.weight_kg,
        user.height_cm,
        user.age,
        user.gender,
      );
      const dailyCalories = NutritionalCalculatorAgent.calculateDailyCalories(bmr);
      const macroTargets = NutritionalCalculatorAgent.calculateMacroTargets(
        dailyCalories,
        diabetesAnalysis,
      );

      console.log('Nutritional Targets:', macroTargets);

      // 3. Filter and score ingredients
      const availableIngredients = filterIngredientsByConstraints(
        ingredientsData || [],
        allergiesList,
        religiousList,
        user.diabetes_type,
      );

      console.log(`Filtered Ingredients: ${availableIngredients.length} available`);

      // Delete old plans if regenerating
      if (force_regenerate) {
        const { data: oldPlans } = await supabase
          .from('meal_plans')
          .select('meal_id')
          .eq('user_id', user_id)
          .eq('recommended_by_ai', true);

        if (oldPlans && oldPlans.length > 0) {
          const mealIds = oldPlans.map((p) => p.meal_id).filter(Boolean);

          await supabase
            .from('meal_plans')
            .delete()
            .eq('user_id', user_id)
            .eq('recommended_by_ai', true);

          if (mealIds.length > 0) {
            await supabase.from('meals').delete().in('id', mealIds);
          }
        }
      }

      // === ENHANCED AI PROMPT WITH AGENTIC ANALYSIS ===
      const agenticSystemPrompt = `
You are an advanced diabetic meal planning AI with comprehensive health analysis capabilities.

HEALTH ANALYSIS RESULTS:
- Diabetes Severity: ${diabetesAnalysis.severity.toUpperCase()}
- Lab-Based Carb Limit: ${diabetesAnalysis.carbLimit}g per meal (STRICT)
- Calorie Target: ${macroTargets.calories} per meal
- Fiber Minimum: ${macroTargets.fiber}g per meal
- Protein Target: ${macroTargets.protein}g per meal

CRITICAL RECOMMENDATIONS:
${diabetesAnalysis.recommendations.map(rec => `- ${rec}`).join('\n')}

RISK FACTORS IDENTIFIED:
${diabetesAnalysis.riskFactors.length > 0 ? diabetesAnalysis.riskFactors.map(risk => `- ${risk}`).join('\n') : '- None detected'}

NUTRITIONAL PARAMETERS (Per Meal):
- Calories: ${macroTargets.calories}
- Max Carbohydrates: ${macroTargets.carbs}g (NEVER EXCEED)
- Min Protein: ${macroTargets.protein}g (for blood sugar stability)
- Min Fiber: ${macroTargets.fiber}g (to slow glucose absorption)
- Healthy Fats: ~${macroTargets.fat}g

CONSTRAINTS:
- Available Ingredients: ${availableIngredients.length} (pre-filtered)
- Budget Level: ${user.budget}
- Dietary Restrictions: ${[...allergiesList, ...religiousList].join(', ') || 'None'}
- User Profile: ${user.gender}, ${user.age}y, ${user.weight_kg}kg, ${user.diabetes_type}

MEAL GENERATION RULES:
1. NEVER exceed carb limits - this is based on actual lab results
2. Prioritize low-glycemic ingredients (GI < 55 when possible)
3. Include high-fiber ingredients in every meal
4. Balance meals with adequate protein for satiety
5. Calculate realistic glycemic loads for each meal
6. Provide health justifications for ingredient choices
7. Consider budget constraints in selections
8. Ensure all ingredients are from the approved list

Return ONLY valid JSON with this exact structure:

{
  "day1": {
    "breakfast": [
      {
        "name": "string",
        "meal_type": "breakfast",
        "calories": number,
        "carbohydrates": number,    // <= ${macroTargets.carbs}
        "protein": number,          // >= ${macroTargets.protein}
        "fiber": number,           // >= ${macroTargets.fiber}
        "glycemic_load": number,
        "ingredients": ["string"], // Only from provided list
        "procedures": "string",
        "preparation_time": "string",
        "health_notes": "string"
      },
      // 2 more breakfast options
    ],
    "lunch": [
      // 3 lunch options with same structure
    ],
    "dinner": [
      // 3 dinner options with same structure
    ]
  },
  // Continue for day2 through day7
}

Generate meals that STRICTLY respect the health analysis and provide variety across the 7 days.
`;

      const content = {
        user_profile: {
          id: user.id,
          full_name: user.full_name,
          gender: user.gender,
          age: user.age,
          height_cm: user.height_cm,
          weight_kg: user.weight_kg,
          diabetes_type: user.diabetes_type,
          budget: user.budget,
          bmr: bmr,
          daily_calories: dailyCalories,
        },
        health_analysis: {
          lab_results: lab || {},
          diabetes_analysis: diabetesAnalysis,
          macro_targets: macroTargets,
        },
        constraints: {
          allergies: allergiesList,
          religious_diets: religiousList,
          available_ingredients_count: availableIngredients.length,
        },
        available_ingredients: availableIngredients.map((ing) => ({
          name: ing.name,
          category: ing.category,
          calories_per_serving: ing.calories_per_serving,
          protein_grams: ing.protein_grams,
          carbs_grams: ing.carbs_grams,
          fat_grams: ing.fat_grams,
          fiber_grams: ing.fiber_grams,
          is_diabetic_friendly: ing.is_diabetic_friendly,
          glycemic_index: ing.glycemic_index || 50,
          cost_per_serving: ing.cost_per_serving || 1,
          is_halal: ing.is_halal,
          is_kosher: ing.is_kosher,
          is_catholic: ing.is_catholic,
          is_vegetarian: ing.is_vegetarian,
          is_vegan: ing.is_vegan,
          common_allergens: ing.common_allergens,
          typical_serving_size: ing.typical_serving_size,
          availability: ing.availability,
        })),
      };

      console.log('Calling Groq API with agentic analysis...');
      const chat = await groq.chat.completions.create({
        model: 'deepseek-r1-distill-llama-70b',
        temperature: 0.3,
        top_p: 0.9,
        max_completion_tokens: 8192,
        stream: false,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: agenticSystemPrompt },
          { role: 'user', content: JSON.stringify(content) },
        ],
      });

      // Parse and validate AI response
      let weekPlan;
      try {
        weekPlan = JSON.parse(chat.choices?.[0]?.message?.content || '{}');
      } catch (e) {
        console.error('AI response parse error:', e);
        throw new Error('AI response was not valid JSON.');
      }

      // Enhanced validation with health checks
      const availableIngredientNames = new Set(
        availableIngredients.map((ing) => ing.name.toLowerCase()),
      );

      console.log('Validating meal plan with health constraints...');
      for (let dayNum = 1; dayNum <= 7; dayNum++) {
        const dayKey = `day${dayNum}`;
        const dayMeals = weekPlan[dayKey];

        if (!dayMeals) throw new Error(`Missing meals for ${dayKey}`);

        for (const mealType of ['breakfast', 'lunch', 'dinner']) {
          const mealsForType = dayMeals[mealType];

          if (!Array.isArray(mealsForType) || mealsForType.length !== 3) {
            throw new Error(`Invalid structure for ${dayKey} ${mealType}`);
          }

          // Health validation for each meal
          for (const meal of mealsForType) {
            // Validate carb limits (critical for diabetes)
            if (meal.carbohydrates > macroTargets.carbs + 5) {
              console.warn(
                `WARNING: ${meal.name} exceeds carb limit: ${meal.carbohydrates}g > ${macroTargets.carbs}g`,
              );
            }

            // Validate protein minimum
            if (meal.protein < macroTargets.protein * 0.8) {
              console.warn(
                `WARNING: ${meal.name} below protein target: ${meal.protein}g < ${macroTargets.protein}g`,
              );
            }

            // Validate ingredients exist
            if (Array.isArray(meal.ingredients)) {
              for (const ingredient of meal.ingredients) {
                if (!availableIngredientNames.has(ingredient.toLowerCase())) {
                  console.warn(
                    `WARNING: Ingredient "${ingredient}" not found in database for meal "${meal.name}"`,
                  );
                }
              }
            }
          }
        }
      }

      // Save meals to database
      const startDate = new Date();
      const mealPlansByDay = {};

      console.log('Saving meal plan to database...');
      for (let dayNum = 1; dayNum <= 7; dayNum++) {
        const dayKey = `day${dayNum}`;
        const dayMeals = weekPlan[dayKey];

        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + (dayNum - 1));
        const dateStr = currentDate.toISOString().split('T')[0];

        mealPlansByDay[dateStr] = { breakfast: [], lunch: [], dinner: [] };

        for (const mealType of ['breakfast', 'lunch', 'dinner']) {
          const mealsForType = dayMeals[mealType];

          for (const meal of mealsForType) {
            const mealPayload = {
              meal_type: meal.meal_type || mealType,
              calories: typeof meal.calories === 'number' ? meal.calories : null,
              carbohydrates: meal.carbohydrates || null,
              protein: meal.protein || null,
              fiber: meal.fiber || null,
              glycemic_load: meal.glycemic_load || null,
              ingredients: Array.isArray(meal.ingredients) ? meal.ingredients : [],
              procedures: meal.procedures || '',
              preparation_time: meal.preparation_time || null,
              name: meal.name || `${mealType} option`,
              health_notes: meal.health_notes || '',
              user_id,
            };

            const { data: mealRow, error: mealErr } = await supabase
              .from('meals')
              .insert([mealPayload])
              .select()
              .single();

            if (mealErr) {
              console.error('Meal insert error:', mealErr);
              throw mealErr;
            }

            // Create meal-ingredient relationships
            if (Array.isArray(meal.ingredients) && meal.ingredients.length > 0) {
              const ingredientRelationships = [];

              for (const ingredientName of meal.ingredients) {
                const dbIngredient = availableIngredients.find(
                  (ing) => ing.name.toLowerCase() === ingredientName.toLowerCase(),
                );

                if (dbIngredient) {
                  ingredientRelationships.push({
                    meal_id: mealRow.id,
                    ingredient_id: dbIngredient.id,
                    quantity: 1,
                    unit: dbIngredient.typical_serving_size || 'serving',
                  });
                }
              }

              if (ingredientRelationships.length > 0) {
                await supabase.from('meal_ingredients').insert(ingredientRelationships);
              }
            }

            const { error: planErr } = await supabase.from('meal_plans').insert([
              {
                date: currentDate,
                recommended_by_ai: true,
                meal_id: mealRow.id,
                user_id,
              },
            ]);

            if (planErr) throw planErr;

            mealPlansByDay[dateStr][mealType].push(mealRow);
          }
        }
      }

      console.log('Agentic AI meal plan generated successfully!');

      return res.status(200).json({
        success: true,
        message: 'Agentic AI meal plan generated successfully with comprehensive health analysis',
        mealPlansByDay,
        isExisting: false,
        healthAnalysis: {
          diabetesAnalysis,
          macroTargets,
          bmr,
          dailyCalories,
          ingredientsUsed: availableIngredients.length,
          agentAnalysis: {
            diabetesAgent: 'Analyzed lab results and risk factors',
            nutritionAgent: 'Calculated personalized macro targets',
            scoringAgent: 'Evaluated ingredients for diabetes suitability',
            compositionAgent: 'Generated balanced meal structures'
          }
        },
      });

    } catch (error) {
      console.error('generateMealPlan error:', error);
      return res.status(500).json({
        success: false,
        error: error?.message || 'Internal server error',
      });
    }
  }

  return res.status(405).json({ 
    success: false, 
    error: `Method ${req.method} not allowed` 
  });
}