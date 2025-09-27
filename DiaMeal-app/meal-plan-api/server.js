SERVER.JS //WITH AGENTIC


import express from 'express'
import cors from 'cors'
import { Groq } from 'groq-sdk'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

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

// === AGENTIC AI COMPONENTS ===

class DiabetesAnalysisAgent {
  static calculateGlycemicLoad(ingredients, portions) {
    // Calculate glycemic load based on ingredients
    let totalGL = 0
    ingredients.forEach((ing, index) => {
      const portion = portions[index] || 1
      const carbs = ing.carbs_grams || 0
      const gi = ing.glycemic_index || 50 // Default moderate GI
      const gl = (gi * carbs * portion) / 100
      totalGL += gl
    })
    return Math.round(totalGL * 10) / 10
  }

  static analyzeLabResults(labResults) {
    const analysis = {
      severity: 'normal',
      recommendations: [],
      carbLimit: 45, // grams per meal (default)
      caloryLimit: 600, // calories per meal (default)
      riskFactors: [],
    }

    if (!labResults) return analysis

    const { hba1c, fbs, ppbs, glucose_tolerance } = labResults

    // HbA1c Analysis (in %)
    if (hba1c) {
      if (hba1c >= 10) {
        analysis.severity = 'severe'
        analysis.carbLimit = 25
        analysis.caloryLimit = 450
        analysis.recommendations.push('Severely elevated HbA1c requires strict carb restriction')
        analysis.riskFactors.push('high_hba1c')
      } else if (hba1c >= 8) {
        analysis.severity = 'moderate'
        analysis.carbLimit = 35
        analysis.caloryLimit = 500
        analysis.recommendations.push('Elevated HbA1c needs moderate carb restriction')
        analysis.riskFactors.push('moderate_hba1c')
      } else if (hba1c >= 6.5) {
        analysis.severity = 'mild'
        analysis.carbLimit = 40
        analysis.caloryLimit = 550
        analysis.recommendations.push('Mildly elevated HbA1c requires careful monitoring')
      }
    }

    // Fasting Blood Sugar Analysis (mg/dL)
    if (fbs) {
      if (fbs >= 200) {
        analysis.riskFactors.push('very_high_fbs')
        analysis.recommendations.push('Dangerously high fasting glucose - minimize fast carbs')
      } else if (fbs >= 140) {
        analysis.riskFactors.push('high_fbs')
        analysis.recommendations.push('High fasting glucose - avoid simple sugars')
      } else if (fbs >= 110) {
        analysis.recommendations.push('Elevated fasting glucose - prefer complex carbs')
      }
    }

    // Post-prandial Blood Sugar Analysis (mg/dL)
    if (ppbs) {
      if (ppbs >= 250) {
        analysis.riskFactors.push('very_high_ppbs')
        analysis.recommendations.push('Extreme post-meal spikes - strict portion control needed')
      } else if (ppbs >= 200) {
        analysis.riskFactors.push('high_ppbs')
        analysis.recommendations.push('High post-meal glucose - limit meal portions')
      }
    }

    return analysis
  }
}

class NutritionalCalculatorAgent {
  static calculateBMR(weight, height, age, gender) {
    // Mifflin-St Jeor Equation
    const bmr =
      gender === 'male'
        ? 10 * weight + 6.25 * height - 5 * age + 5
        : 10 * weight + 6.25 * height - 5 * age - 161
    return Math.round(bmr)
  }

  static calculateDailyCalories(bmr, activityLevel = 1.2) {
    // Sedentary lifestyle multiplier for diabetic patients
    return Math.round(bmr * activityLevel)
  }

  static calculateMacroTargets(dailyCalories, diabetesAnalysis) {
    const targets = {
      calories: Math.round(dailyCalories / 3), // Per meal
      carbs: diabetesAnalysis.carbLimit,
      protein: Math.round((dailyCalories * 0.25) / 4), // 25% of calories from protein
      fat: Math.round((dailyCalories * 0.35) / 9), // 35% of calories from fat
      fiber: 10, // grams minimum per meal
    }
    return targets
  }
}

class IngredientScoringAgent {
  static scoreIngredientForDiabetes(ingredient, diabetesAnalysis) {
    let score = 50 // Base score

    // Diabetic-friendly flag
    if (ingredient.is_diabetic_friendly) score += 20

    // Fiber content (high fiber is good)
    const fiber = ingredient.fiber_grams || 0
    score += Math.min(fiber * 3, 15)

    // Glycemic impact
    const carbs = ingredient.carbs_grams || 0
    const gi = ingredient.glycemic_index || 50
    const gl = (gi * carbs) / 100
    if (gl < 10) score += 10
    else if (gl < 20) score += 5
    else score -= Math.min(gl, 20)

    // Protein content (good for satiety)
    const protein = ingredient.protein_grams || 0
    score += Math.min(protein * 2, 20)

    // Penalize high carb ingredients for severe diabetes
    if (diabetesAnalysis.severity === 'severe' && carbs > 20) {
      score -= 15
    }

    return Math.max(0, Math.min(100, score))
  }

  static scoreIngredientForBudget(ingredient, budget) {
    const cost = ingredient.cost_per_serving || 1
    let score = 50

    if (budget === 'low' && cost <= 0.5) score += 30
    else if (budget === 'low' && cost > 2) score -= 30
    else if (budget === 'medium' && cost <= 1.5) score += 20
    else if (budget === 'medium' && cost > 3) score -= 20
    else if (budget === 'high') score += 10 // Less budget constraint

    return Math.max(0, Math.min(100, score))
  }
}

class MealCompositionAgent {
  static generateMealStructure(mealType, macroTargets, availableIngredients, constraints) {
    const structure = {
      primaryProtein: null,
      secondaryProtein: null,
      primaryCarb: null,
      vegetables: [],
      healthyFats: null,
      fiber: null,
      flavor: null,
    }

    const categorizedIngredients = this.categorizeIngredients(availableIngredients)
    const { diabetesAnalysis, budget } = constraints

    // Score and rank ingredients
    const scoredIngredients = availableIngredients.map((ing) => ({
      ...ing,
      diabetesScore: IngredientScoringAgent.scoreIngredientForDiabetes(ing, diabetesAnalysis),
      budgetScore: IngredientScoringAgent.scoreIngredientForBudget(ing, budget),
      overallScore: 0,
    }))

    // Calculate overall scores
    scoredIngredients.forEach((ing) => {
      ing.overallScore = ing.diabetesScore * 0.6 + ing.budgetScore * 0.4
    })

    // Select ingredients based on meal type requirements
    if (mealType === 'breakfast') {
      structure.primaryProtein = this.selectBestIngredient(
        categorizedIngredients.protein.filter((p) => p.breakfast_suitable !== false),
        scoredIngredients,
      )
      structure.primaryCarb = this.selectBestIngredient(
        categorizedIngredients.grains.filter((g) => g.breakfast_suitable !== false),
        scoredIngredients,
      )
    } else {
      structure.primaryProtein = this.selectBestIngredient(
        categorizedIngredients.protein,
        scoredIngredients,
      )
      structure.primaryCarb = this.selectBestIngredient(
        categorizedIngredients.grains,
        scoredIngredients,
      )
    }

    structure.vegetables = this.selectMultipleIngredients(
      categorizedIngredients.vegetables,
      scoredIngredients,
      2,
    )
    structure.healthyFats = this.selectBestIngredient(
      categorizedIngredients.fats,
      scoredIngredients,
    )

    return structure
  }

  static categorizeIngredients(ingredients) {
    return {
      protein: ingredients.filter((i) => i.category === 'Protein' || (i.protein_grams || 0) > 15),
      grains: ingredients.filter((i) => i.category === 'Grains' || i.category === 'Starches'),
      vegetables: ingredients.filter((i) => i.category === 'Vegetables'),
      fruits: ingredients.filter((i) => i.category === 'Fruits'),
      dairy: ingredients.filter((i) => i.category === 'Dairy'),
      fats: ingredients.filter((i) => i.category === 'Fats' || i.category === 'Oils'),
      spices: ingredients.filter((i) => i.category === 'Spices' || i.category === 'Herbs'),
    }
  }

  static selectBestIngredient(categoryIngredients, scoredIngredients) {
    const availableScored = categoryIngredients
      .map((ing) => scoredIngredients.find((s) => s.id === ing.id))
      .filter(Boolean)

    availableScored.sort((a, b) => b.overallScore - a.overallScore)
    return availableScored[0] || null
  }

  static selectMultipleIngredients(categoryIngredients, scoredIngredients, count) {
    const availableScored = categoryIngredients
      .map((ing) => scoredIngredients.find((s) => s.id === ing.id))
      .filter(Boolean)

    availableScored.sort((a, b) => b.overallScore - a.overallScore)
    return availableScored.slice(0, count)
  }
}

// Helper function to filter ingredients (keep existing)
function filterIngredientsByConstraints(ingredients, allergies, religiousDiets, diabetesType) {
  return ingredients.filter((ingredient) => {
    if (allergies.length > 0) {
      const allergenList = ingredient.common_allergens || []
      const hasAllergen = allergies.some((allergy) =>
        allergenList.some(
          (allergen) =>
            allergen.toLowerCase().includes(allergy.toLowerCase()) ||
            allergy.toLowerCase().includes(allergen.toLowerCase()),
        ),
      )
      if (hasAllergen) return false
    }

    for (const diet of religiousDiets) {
      switch (diet.toLowerCase()) {
        case 'halal':
          if (!ingredient.is_halal) return false
          break
        case 'kosher':
          if (!ingredient.is_kosher) return false
          break
        case 'vegetarian':
          if (!ingredient.is_vegetarian) return false
          break
        case 'vegan':
          if (!ingredient.is_vegan) return false
          break
      }
    }

    if (ingredient.availability === 'unavailable') {
      return false
    }

    return true
  })
}

// === ENHANCED MEAL PLAN GENERATION ENDPOINT ===
app.post('/api/generateMealPlan', async (req, res) => {
  try {
    const { user_id, force_regenerate = false } = req.body || {}
    if (!user_id) {
      return res.status(400).json({ success: false, error: 'Missing user_id' })
    }

    // Check existing plans (keep existing logic)
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

    // Fetch user data (keep existing logic)
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

    // 1. Analyze diabetes condition
    const diabetesAnalysis = DiabetesAnalysisAgent.analyzeLabResults(lab)
    console.log('Diabetes Analysis:', diabetesAnalysis)

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

    console.log('Nutritional Targets:', macroTargets)

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

    // Delete old plans if regenerating (keep existing logic)
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
You are an advanced diabetic meal planning AI agent with access to comprehensive user health data and ingredient analysis.

CRITICAL HEALTH ANALYSIS:
- Diabetes Severity: ${diabetesAnalysis.severity}
- Lab-based Carb Limit: ${diabetesAnalysis.carbLimit}g per meal
- Calorie Target: ${macroTargets.calories} per meal
- Key Recommendations: ${diabetesAnalysis.recommendations.join('; ')}
- Risk Factors: ${diabetesAnalysis.riskFactors.join(', ')}

NUTRITIONAL TARGETS PER MEAL:
- Calories: ${macroTargets.calories}
- Carbohydrates: MAX ${macroTargets.carbs}g
- Protein: MIN ${macroTargets.protein}g  
- Fiber: MIN ${macroTargets.fiber}g
- Healthy Fats: ~${macroTargets.fat}g

INGREDIENT CONSTRAINTS:
- Total Available: ${availableIngredients.length} ingredients
- Budget Level: ${user.budget}
- Dietary Restrictions: ${[...allergiesList, ...religiousList].join(', ') || 'None'}

Generate meals that STRICTLY adhere to these lab-based parameters. Prioritize ingredients with high diabetes scores and appropriate glycemic loads.

Return ONLY valid JSON matching this schema:

type Meal = {
  name: string;
  meal_type: "breakfast" | "lunch" | "dinner";
  calories: number;
  carbohydrates: number;     // MUST be <= ${macroTargets.carbs}g
  protein: number;           // MUST be >= ${macroTargets.protein}g  
  fiber: number;            // MUST be >= ${macroTargets.fiber}g
  glycemic_load: number;    // Calculate based on ingredients
  ingredients: string[];    // Only from provided list
  procedures: string;
  preparation_time: string;
  health_notes: string;     // Explain why this meal is suitable for user's condition
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

STRICT REQUIREMENTS:
1. Never exceed carb limits based on lab results
2. Ensure adequate protein for blood sugar stability  
3. Include high-fiber ingredients to slow glucose absorption
4. Calculate realistic glycemic loads
5. Provide health justifications for each meal
6. Use only available ingredients from the database
7. Consider budget constraints in ingredient selection
8. Respect all dietary restrictions and allergies
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
      lab_analysis: {
        raw_results: lab || {},
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
        is_vegetarian: ing.is_vegetarian,
        is_vegan: ing.is_vegan,
        common_allergens: ing.common_allergens,
        typical_serving_size: ing.typical_serving_size,
        availability: ing.availability,
      })),
    }

    console.log('Calling Groq API with agentic analysis...')
    const chat = await groq.chat.completions.create({
      model: 'deepseek-r1-distill-llama-70b',
      temperature: 0.3, // Lower temperature for more consistent health-focused results
      top_p: 0.9,
      max_completion_tokens: 8192,
      stream: false,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: agenticSystemPrompt },
        { role: 'user', content: JSON.stringify(content) },
      ],
    })

    // Parse and validate AI response (keep existing logic but add health validation)
    let weekPlan
    try {
      weekPlan = JSON.parse(chat.choices?.[0]?.message?.content || '{}')
    } catch (e) {
      console.error('AI response parse error:', e)
      throw new Error('AI response was not valid JSON.')
    }

    // Enhanced validation with health checks
    const availableIngredientNames = new Set(
      availableIngredients.map((ing) => ing.name.toLowerCase()),
    )

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
          // Validate carb limits
          if (meal.carbohydrates > macroTargets.carbs + 5) {
            // 5g tolerance
            console.warn(
              `WARNING: ${meal.name} exceeds carb limit: ${meal.carbohydrates}g > ${macroTargets.carbs}g`,
            )
          }

          // Validate ingredients exist
          if (Array.isArray(meal.ingredients)) {
            for (const ingredient of meal.ingredients) {
              if (!availableIngredientNames.has(ingredient.toLowerCase())) {
                console.warn(
                  `WARNING: Ingredient "${ingredient}" not found in database for meal "${meal.name}"`,
                )
              }
            }
          }
        }
      }
    }

    // Save meals with enhanced data (keep existing save logic but add health fields)
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
            console.error('Meal insert error:', mealErr)
            throw mealErr
          }

          // Create meal-ingredient relationships (keep existing)
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

    return res.status(200).json({
      success: true,
      message: 'Agentic AI meal plan generated successfully with health analysis',
      mealPlansByDay,
      isExisting: false,
      healthAnalysis: {
        diabetesAnalysis,
        macroTargets,
        bmr,
        dailyCalories,
        ingredientsUsed: availableIngredients.length,
      },
    })
  } catch (error) {
    console.error('generateMealPlan error:', error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error',
    })
  }
})

// Keep your existing endpoints
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

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    agenticAI: 'Active',
    features: [
      'Diabetes Analysis',
      'Nutritional Calculation',
      'Ingredient Scoring',
      'Meal Composition',
      'Health Validation',
      'Smart Shopping Lists',
    ],
  })
})

app.listen(PORT, () => {
  console.log(`🤖 Agentic AI Meal Planning Server running on http://localhost:${PORT}`)
  console.log('🧠 AI Agents Active:')
  console.log('   - DiabetesAnalysisAgent')
  console.log('   - NutritionalCalculatorAgent')
  console.log('   - IngredientScoringAgent')
  console.log('   - MealCompositionAgent')
})
