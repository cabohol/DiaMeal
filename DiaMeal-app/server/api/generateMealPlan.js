// api/generateMealPlan.js - Vercel Serverless Function
import { Groq } from 'groq-sdk'
import { createClient } from '@supabase/supabase-js'

// Import your agents (you'll need to adjust paths)
import {
  DiabetesAnalysisAgent,
  NutritionalCalculatorAgent,
  IngredientScoringAgent,
  MealCompositionAgent
} from '../src/agents/index.js'

import { filterIngredientsByConstraints } from '../src/utils/filterIngredients.js'

// Initialize clients
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
})

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }
  
  // Health check for GET requests
  if (req.method === 'GET') {
    return res.status(200).json({ 
      success: true, 
      message: 'API is healthy',
      timestamp: new Date().toISOString()
    })
  }

  // Only allow POST for meal plan generation
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Your entire meal plan generation logic from server.js goes here
    const { user_id, force_regenerate = false } = req.body || {}
    
    if (!user_id) {
      return res.status(400).json({ success: false, error: 'Missing user_id' })
    }

    console.log('🚀 Starting meal plan generation for user:', user_id)

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

    // AI Analysis (your existing logic)
    console.log('🧠 Starting Agentic AI Analysis...')

    const diabetesAnalysis = DiabetesAnalysisAgent.analyzeLabResults(lab)
    console.log('📊 Diabetes Analysis:', {
      severity: diabetesAnalysis.severity,
      carbLimit: diabetesAnalysis.carbLimit,
      riskFactors: diabetesAnalysis.riskFactors
    })

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

    const availableIngredients = filterIngredientsByConstraints(
      ingredientsData || [],
      allergiesList,
      religiousList,
      user.diabetes_type,
    )

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

    // Create the AI prompt (your existing logic)
    const agenticSystemPrompt = `
You are an advanced diabetic meal planning AI with comprehensive health analysis capabilities.

HEALTH ANALYSIS RESULTS:
- Diabetes Severity: ${diabetesAnalysis.severity.toUpperCase()}
- Lab-Based Carb Limit: ${diabetesAnalysis.carbLimit}g per meal (STRICT)
- Calorie Target: ${macroTargets.calories} per meal

Generate a JSON response with 7 days of meal plans following these constraints.

Return ONLY valid JSON with this structure:
{
  "day1": {
    "breakfast": [{"name": "string", "meal_type": "breakfast", "calories": number, "carbohydrates": number, "protein": number, "fiber": number, "ingredients": ["string"], "procedures": "string", "preparation_time": "string"}],
    "lunch": [/* 3 lunch options */],
    "dinner": [/* 3 dinner options */]
  }
  // ... through day7
}
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

    console.log('🤖 Calling Groq API...')
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

    // Parse AI response
    let weekPlan
    try {
      weekPlan = JSON.parse(chat.choices?.[0]?.message?.content || '{}')
    } catch (e) {
      console.error('❌ AI response parse error:', e)
      throw new Error('AI response was not valid JSON.')
    }

    // Validation and database saving logic (abbreviated for space)
    const startDate = new Date()
    const mealPlansByDay = {}

    for (let dayNum = 1; dayNum <= 7; dayNum++) {
      const dayKey = `day${dayNum}`
      const dayMeals = weekPlan[dayKey]
      const currentDate = new Date(startDate)
      currentDate.setDate(startDate.getDate() + (dayNum - 1))
      const dateStr = currentDate.toISOString().split('T')[0]

      mealPlansByDay[dateStr] = { breakfast: [], lunch: [], dinner: [] }

      for (const mealType of ['breakfast', 'lunch', 'dinner']) {
        const mealsForType = dayMeals?.[mealType] || []

        for (const meal of mealsForType) {
          const mealPayload = {
            meal_type: meal.meal_type || mealType,
            calories: typeof meal.calories === 'number' ? meal.calories : null,
            carbohydrates: meal.carbohydrates || null,
            protein: meal.protein || null,
            fiber: meal.fiber || null,
            ingredients: Array.isArray(meal.ingredients) ? meal.ingredients : [],
            procedures: meal.procedures || '',
            preparation_time: meal.preparation_time || null,
            name: meal.name || `${mealType} option`,
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

    console.log('✅ Meal plan generated successfully!')

    return res.status(200).json({
      success: true,
      message: 'Meal plan generated successfully',
      mealPlansByDay,
      isExisting: false,
      healthAnalysis: {
        diabetesAnalysis,
        macroTargets,
        bmr,
        dailyCalories,
      },
    })

  } catch (error) {
    console.error('❌ generateMealPlan error:', error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error',
    })
  }
}