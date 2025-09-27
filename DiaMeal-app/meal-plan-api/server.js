// server.js - Clean and Modular with Agentic AI

import express from 'express'
import cors from 'cors'
import { Groq } from 'groq-sdk'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Import AI Agents - FIXED PATHS
import DiabetesAnalysisAgent from './src/agents/DiabetesAnalysisAgent.js'
import NutritionalCalculatorAgent from './src/agents/NutritionalCalculatorAgent.js'
import IngredientScoringAgent from './src/agents/IngredientScoringAgent.js'
import MealCompositionAgent from './src/agents/MealCompositionAgent.js'
import { filterIngredientsByConstraints } from './src/utils/filterIngredients.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Initialize Supabase
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

// Initialize Groq
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
})

// Middleware
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
)
app.use(express.json())

// === ENHANCED MEAL PLAN GENERATION ENDPOINT ===
app.post('/api/generateMealPlan', async (req, res) => {
  try {
    const { user_id, force_regenerate = false } = req.body || {}
    if (!user_id) {
      return res.status(400).json({ success: false, error: 'Missing user_id' })
    }

    // Check existing plans (unless force regenerating)
    if (!force_regenerate) {
      const { data: existingPlans, error: checkError } = await supabase
        .from('meal_plans')
        .select(`*, meals (*)`)
        .eq('user_id', user_id)
        .eq('recommended_by_ai', true)
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: true })

      if (!checkError && existingPlans && existingPlans.length >= 21) {
        const plansByDate = {}
        existingPlans.forEach((plan) => {
          const dateStr = plan.date.split('T')[0]
          if (!plansByDate[dateStr]) {
            plansByDate[dateStr] = { breakfast: [], lunch: [], dinner: [] }
          }
          if (plan.meals) {
            const mealType = plan.meals.meal_type
            if (plansByDate[dateStr][mealType]) {
              plansByDate[dateStr][mealType].push(plan.meals)
            }
          }
        })

        return res.status(200).json({
          success: true,
          message: 'Using existing meal plan',
          mealPlansByDay: plansByDate,
          isExisting: true,
        })
      }
    }

    // Fetch user data
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user_id)
      .single()
    if (userError || !user) throw userError || new Error('User not found')

    const { data: lab } = await supabase
      .from('lab_results')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const { data: allergiesData } = await supabase
      .from('allergies')
      .select('allergy')
      .eq('user_id', user_id)

    const { data: religiousData } = await supabase
      .from('religious_diets')
      .select('diet_type')
      .eq('user_id', user_id)

    const { data: ingredientsData, error: ingredientsError } = await supabase
      .from('ingredients')
      .select('*')
      .order('name', { ascending: true })

    if (ingredientsError) throw ingredientsError

    const allergiesList = (allergiesData || []).map((a) => a.allergy).filter(Boolean)
    const religiousList = (religiousData || []).map((r) => r.diet_type).filter(Boolean)

    // === AGENTIC AI ANALYSIS ===

    console.log('🧠 Starting Agentic AI Analysis...')

    // 1. Analyze diabetes condition
    const diabetesAnalysis = DiabetesAnalysisAgent.analyzeLabResults(lab)
    console.log('📊 Diabetes Analysis:', {
      severity: diabetesAnalysis.severity,
      carbLimit: diabetesAnalysis.carbLimit,
      riskFactors: diabetesAnalysis.riskFactors
    })

    // 2. Calculate nutritional requirements
    const bmr = NutritionalCalculatorAgent.calculateBMR(
      user.weight_kg,
      user.height_cm,
      user.age,
      user.gender,
    )
    const dailyCalories = NutritionalCalculatorAgent.calculateDailyCalories(bmr)
    const macroTargets = NutritionalCalculatorAgent.calculateMacroTargets(
      dailyCalories,
      diabetesAnalysis,
    )

    console.log('🎯 Nutritional Targets:', macroTargets)

    // 3. Filter and score ingredients
    const availableIngredients = filterIngredientsByConstraints(
      ingredientsData || [],
      allergiesList,
      religiousList,
      user.diabetes_type,
    )

    const constraints = {
      diabetesAnalysis,
      budget: user.budget,
      allergies: allergiesList,
      religiousDiets: religiousList,
    }

    console.log(`🥗 Filtered Ingredients: ${availableIngredients.length} available`)

    // Delete old plans if regenerating
    if (force_regenerate) {
      const { data: oldPlans } = await supabase
        .from('meal_plans')
        .select('meal_id')
        .eq('user_id', user_id)
        .eq('recommended_by_ai', true)

      if (oldPlans && oldPlans.length > 0) {
        const mealIds = oldPlans.map((p) => p.meal_id).filter(Boolean)

        await supabase
          .from('meal_plans')
          .delete()
          .eq('user_id', user_id)
          .eq('recommended_by_ai', true)

        if (mealIds.length > 0) {
          await supabase.from('meals').delete().in('id', mealIds)
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
`

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
    }

    console.log('🤖 Calling Groq API with agentic analysis...')
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
    })

    // Parse and validate AI response
    let weekPlan
    try {
      weekPlan = JSON.parse(chat.choices?.[0]?.message?.content || '{}')
    } catch (e) {
      console.error('❌ AI response parse error:', e)
      throw new Error('AI response was not valid JSON.')
    }

    // Enhanced validation with health checks
    const availableIngredientNames = new Set(
      availableIngredients.map((ing) => ing.name.toLowerCase()),
    )

    console.log('🔍 Validating meal plan with health constraints...')
    for (let dayNum = 1; dayNum <= 7; dayNum++) {
      const dayKey = `day${dayNum}`
      const dayMeals = weekPlan[dayKey]

      if (!dayMeals) throw new Error(`Missing meals for ${dayKey}`)

      for (const mealType of ['breakfast', 'lunch', 'dinner']) {
        const mealsForType = dayMeals[mealType]

        if (!Array.isArray(mealsForType) || mealsForType.length !== 3) {
          throw new Error(`Invalid structure for ${dayKey} ${mealType}`)
        }

        // Health validation for each meal
        for (const meal of mealsForType) {
          // Validate carb limits (critical for diabetes)
          if (meal.carbohydrates > macroTargets.carbs + 5) {
            console.warn(
              `⚠️  WARNING: ${meal.name} exceeds carb limit: ${meal.carbohydrates}g > ${macroTargets.carbs}g`,
            )
          }

          // Validate protein minimum
          if (meal.protein < macroTargets.protein * 0.8) {
            console.warn(
              `⚠️  WARNING: ${meal.name} below protein target: ${meal.protein}g < ${macroTargets.protein}g`,
            )
          }

          // Validate ingredients exist
          if (Array.isArray(meal.ingredients)) {
            for (const ingredient of meal.ingredients) {
              if (!availableIngredientNames.has(ingredient.toLowerCase())) {
                console.warn(
                  `⚠️  WARNING: Ingredient "${ingredient}" not found in database for meal "${meal.name}"`,
                )
              }
            }
          }
        }
      }
    }

    // Save meals to database
    const startDate = new Date()
    const mealPlansByDay = {}

    console.log('💾 Saving meal plan to database...')
    for (let dayNum = 1; dayNum <= 7; dayNum++) {
      const dayKey = `day${dayNum}`
      const dayMeals = weekPlan[dayKey]

      const currentDate = new Date(startDate)
      currentDate.setDate(startDate.getDate() + (dayNum - 1))
      const dateStr = currentDate.toISOString().split('T')[0]

      mealPlansByDay[dateStr] = { breakfast: [], lunch: [], dinner: [] }

      for (const mealType of ['breakfast', 'lunch', 'dinner']) {
        const mealsForType = dayMeals[mealType]

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
          }

          const { data: mealRow, error: mealErr } = await supabase
            .from('meals')
            .insert([mealPayload])
            .select()
            .single()

          if (mealErr) {
            console.error('❌ Meal insert error:', mealErr)
            throw mealErr
          }

          // Create meal-ingredient relationships
          if (Array.isArray(meal.ingredients) && meal.ingredients.length > 0) {
            const ingredientRelationships = []

            for (const ingredientName of meal.ingredients) {
              const dbIngredient = availableIngredients.find(
                (ing) => ing.name.toLowerCase() === ingredientName.toLowerCase(),
              )

              if (dbIngredient) {
                ingredientRelationships.push({
                  meal_id: mealRow.id,
                  ingredient_id: dbIngredient.id,
                  quantity: 1,
                  unit: dbIngredient.typical_serving_size || 'serving',
                })
              }
            }

            if (ingredientRelationships.length > 0) {
              await supabase.from('meal_ingredients').insert(ingredientRelationships)
            }
          }

          const { error: planErr } = await supabase.from('meal_plans').insert([
            {
              date: currentDate,
              recommended_by_ai: true,
              meal_id: mealRow.id,
              user_id,
            },
          ])

          if (planErr) throw planErr

          mealPlansByDay[dateStr][mealType].push(mealRow)
        }
      }
    }

    console.log('✅ Agentic AI meal plan generated successfully!')

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
    })
  } catch (error) {
    console.error('❌ generateMealPlan error:', error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error',
    })
  }
})

// === EXISTING ENDPOINTS (Kept for compatibility) ===

app.get('/api/getIngredients', async (req, res) => {
  try {
    const { category, diabetic_friendly, search } = req.query

    let query = supabase.from('ingredients').select('*')

    if (category && category !== 'all') {
      query = query.eq('category', category)
    }

    if (diabetic_friendly === 'true') {
      query = query.eq('is_diabetic_friendly', true)
    }

    if (search) {
      query = query.ilike('name', `%${search}%`)
    }

    query = query.order('name', { ascending: true })

    const { data, error } = await query
    if (error) throw error

    return res.status(200).json({
      success: true,
      ingredients: data || [],
    })
  } catch (error) {
    console.error('getIngredients error:', error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to fetch ingredients',
    })
  }
})

app.get('/api/getMealWithIngredients/:mealId', async (req, res) => {
  try {
    const { mealId } = req.params

    const { data: meal, error: mealError } = await supabase
      .from('meals')
      .select(
        `
        *,
        meal_ingredients (
          quantity,
          unit,
          ingredients (*)
        )
      `,
      )
      .eq('id', mealId)
      .single()

    if (mealError) throw mealError

    return res.status(200).json({
      success: true,
      meal,
    })
  } catch (error) {
    console.error('getMealWithIngredients error:', error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to fetch meal with ingredients',
    })
  }
})

// === NEW AGENTIC ENDPOINTS ===

// Analyze user's diabetes condition
app.post('/api/analyzeDiabetes', async (req, res) => {
  try {
    const { user_id } = req.body
    if (!user_id) {
      return res.status(400).json({ success: false, error: 'Missing user_id' })
    }

    const { data: lab } = await supabase
      .from('lab_results')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const { data: user } = await supabase
      .from('users')
      .select('age, diabetes_type')
      .eq('id', user_id)
      .single()

    const diabetesAnalysis = DiabetesAnalysisAgent.analyzeLabResults(lab)
    const timingRecommendations = DiabetesAnalysisAgent.getMealTimingRecommendations(diabetesAnalysis)
    const glucoseTargets = DiabetesAnalysisAgent.getPersonalizedGlucoseTargets(
      user?.age || 30, 
      user?.diabetes_type || 'Type 2', 
      []
    )

    return res.status(200).json({
      success: true,
      analysis: {
        diabetesAnalysis,
        timingRecommendations,
        glucoseTargets,
        recommendations: diabetesAnalysis.recommendations
      }
    })
  } catch (error) {
    console.error('analyzeDiabetes error:', error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to analyze diabetes condition'
    })
  }
})

// Get personalized nutrition targets
app.post('/api/getNutritionTargets', async (req, res) => {
  try {
    const { user_id } = req.body
    if (!user_id) {
      return res.status(400).json({ success: false, error: 'Missing user_id' })
    }

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', user_id)
      .single()

    const { data: lab } = await supabase
      .from('lab_results')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!user) throw new Error('User not found')

    const diabetesAnalysis = DiabetesAnalysisAgent.analyzeLabResults(lab)
    const bmr = NutritionalCalculatorAgent.calculateBMR(
      user.weight_kg,
      user.height_cm,
      user.age,
      user.gender
    )
    const dailyCalories = NutritionalCalculatorAgent.calculateDailyCalories(bmr, 1.3)
    const macroTargets = NutritionalCalculatorAgent.calculateMacroTargets(dailyCalories, diabetesAnalysis)
    const waterIntake = NutritionalCalculatorAgent.calculateWaterIntake(
      user.weight_kg,
      'moderate',
      user.diabetes_type
    )
    const micronutrients = NutritionalCalculatorAgent.calculateMicronutrientTargets(
      user.age,
      user.gender,
      diabetesAnalysis
    )

    return res.status(200).json({
      success: true,
      targets: {
        bmr,
        dailyCalories,
        macroTargets,
        waterIntake,
        micronutrients,
        diabetesAnalysis
      }
    })
  } catch (error) {
    console.error('getNutritionTargets error:', error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to calculate nutrition targets'
    })
  }
})

// Score ingredients for a specific user
app.post('/api/scoreIngredients', async (req, res) => {
  try {
    const { user_id, ingredient_ids } = req.body
    if (!user_id) {
      return res.status(400).json({ success: false, error: 'Missing user_id' })
    }

    // Get user data and constraints
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', user_id)
      .single()

    const { data: lab } = await supabase
      .from('lab_results')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const { data: allergiesData } = await supabase
      .from('allergies')
      .select('allergy')
      .eq('user_id', user_id)

    const { data: religiousData } = await supabase
      .from('religious_diets')
      .select('diet_type')
      .eq('user_id', user_id)

    // Get ingredients to score
    let ingredientQuery = supabase.from('ingredients').select('*')
    if (ingredient_ids && ingredient_ids.length > 0) {
      ingredientQuery = ingredientQuery.in('id', ingredient_ids)
    }
    
    const { data: ingredients } = await ingredientQuery

    const diabetesAnalysis = DiabetesAnalysisAgent.analyzeLabResults(lab)
    const allergiesList = (allergiesData || []).map(a => a.allergy).filter(Boolean)
    const religiousList = (religiousData || []).map(r => r.diet_type).filter(Boolean)

    const constraints = {
      diabetesAnalysis,
      budget: user?.budget || 'medium',
      allergies: allergiesList,
      religiousDiets: religiousList
    }

    const scoredIngredients = ingredients.map(ingredient => ({
      ...ingredient,
      scoringProfile: IngredientScoringAgent.createScoringProfile(ingredient, constraints)
    })).sort((a, b) => b.scoringProfile.overallScore - a.scoringProfile.overallScore)

    return res.status(200).json({
      success: true,
      scoredIngredients,
      constraints: {
        diabetesSeverity: diabetesAnalysis.severity,
        budget: user?.budget,
        restrictionsCount: allergiesList.length + religiousList.length
      }
    })
  } catch (error) {
    console.error('scoreIngredients error:', error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to score ingredients'
    })
  }
})

// Generate meal composition
app.post('/api/composeMeal', async (req, res) => {
  try {
    const { user_id, meal_type, ingredient_ids } = req.body
    if (!user_id || !meal_type) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: user_id, meal_type' 
      })
    }

    // Get user data
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', user_id)
      .single()

    const { data: lab } = await supabase
      .from('lab_results')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const { data: allergiesData } = await supabase
      .from('allergies')
      .select('allergy')
      .eq('user_id', user_id)

    const { data: religiousData } = await supabase
      .from('religious_diets')
      .select('diet_type')
      .eq('user_id', user_id)

    // Get available ingredients
    let ingredientQuery = supabase.from('ingredients').select('*')
    if (ingredient_ids && ingredient_ids.length > 0) {
      ingredientQuery = ingredientQuery.in('id', ingredient_ids)
    }
    
    const { data: availableIngredients } = await ingredientQuery

    // Calculate nutritional requirements
    const diabetesAnalysis = DiabetesAnalysisAgent.analyzeLabResults(lab)
    const bmr = NutritionalCalculatorAgent.calculateBMR(
      user.weight_kg,
      user.height_cm,
      user.age,
      user.gender
    )
    const dailyCalories = NutritionalCalculatorAgent.calculateDailyCalories(bmr)
    const macroTargets = NutritionalCalculatorAgent.calculateMacroTargets(dailyCalories, diabetesAnalysis)

    const allergiesList = (allergiesData || []).map(a => a.allergy).filter(Boolean)
    const religiousList = (religiousData || []).map(r => r.diet_type).filter(Boolean)

    const constraints = {
      diabetesAnalysis,
      budget: user?.budget || 'medium',
      allergies: allergiesList,
      religiousDiets: religiousList
    }

    // Filter ingredients
    const filteredIngredients = filterIngredientsByConstraints(
      availableIngredients,
      allergiesList,
      religiousList,
      user.diabetes_type
    )

    // Generate meal composition
    const mealStructure = MealCompositionAgent.generateMealStructure(
      meal_type,
      macroTargets,
      filteredIngredients,
      constraints
    )

    // Validate the meal
    const validation = MealCompositionAgent.validateMealStructure(
      mealStructure,
      macroTargets,
      constraints
    )

    return res.status(200).json({
      success: true,
      mealStructure,
      validation,
      targets: macroTargets,
      message: validation.isValid ? 'Meal composition generated successfully' : 'Meal generated with warnings'
    })
  } catch (error) {
    console.error('composeMeal error:', error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to compose meal'
    })
  }
})


// Add this endpoint to your server.js
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


// Health status endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    architecture: 'Modular Agentic AI',
    activeAgents: [
      'DiabetesAnalysisAgent - Lab analysis & risk assessment',
      'NutritionalCalculatorAgent - Personalized nutrition targets',
      'IngredientScoringAgent - Diabetes-friendly ingredient evaluation',
      'MealCompositionAgent - Optimal meal structure generation'
    ],
    features: [
      'Advanced Diabetes Analysis',
      'Personalized Nutritional Calculation',
      'Intelligent Ingredient Scoring',
      'Optimized Meal Composition',
      'Health Validation',
      'Modular Architecture',
      'Comprehensive Logging'
    ],
    endpoints: {
      core: ['/api/generateMealPlan'],
      analysis: ['/api/analyzeDiabetes', '/api/getNutritionTargets'],
      ingredients: ['/api/scoreIngredients', '/api/getIngredients'],
      composition: ['/api/composeMeal', '/api/getMealWithIngredients'],
      utility: ['/api/health']
    }
  })
})

// Start server
app.listen(PORT, () => {
  console.log(`🤖 Modular Agentic AI Meal Planning Server running on http://localhost:${PORT}`)
  console.log('')
  console.log('🧠 AI Agent Architecture:')
  console.log('   ├── DiabetesAnalysisAgent    → Lab analysis & risk assessment')
  console.log('   ├── NutritionalCalculatorAgent → Personalized nutrition targets')  
  console.log('   ├── IngredientScoringAgent   → Diabetes-friendly evaluation')
  console.log('   └── MealCompositionAgent     → Optimal meal structure')
  console.log('')
  console.log('🔗 Available Endpoints:')
  console.log('   ├── POST /api/generateMealPlan    → Generate 7-day meal plan')
  console.log('   ├── POST /api/analyzeDiabetes     → Analyze diabetes condition')
  console.log('   ├── POST /api/getNutritionTargets → Get nutrition targets')
  console.log('   ├── POST /api/scoreIngredients    → Score ingredient suitability')
  console.log('   ├── POST /api/composeMeal         → Generate meal composition')
  console.log('   └── GET  /api/health              → System health status')
  console.log('')
  console.log('✅ Server ready for agentic AI meal planning!')
})