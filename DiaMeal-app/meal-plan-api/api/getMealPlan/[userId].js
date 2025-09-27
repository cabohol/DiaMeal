import { createClient } from '@supabase/supabase-js'
import { DiabetesAnalysisAgent } from  '../../src/agents/DiabetesAnalysisAgent.js'
import { NutritionalCalculatorAgent } from '../../src/agents/NutritionalCalculatorAgent.js'

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

// CORS headers function
const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Max-Age', '86400')
}

export default async function handler(req, res) {
  // Set CORS headers for all requests
  setCorsHeaders(res)
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }
  
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }
  
  try {
    const { userId } = req.query
    
    if (!userId) {
      return res.status(400).json({ success: false, error: 'Missing userId' })
    }

    // Get existing meal plans for today and the next 6 days
    const startDate = new Date()
    const endDate = new Date()
    endDate.setDate(startDate.getDate() + 6)

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
      .order("date", { ascending: true })

    if (error) {
      console.error('Meal plans fetch error:', error)
      throw error
    }

    // Group meal plans by date
    const mealPlansByDay = {}
    ;(mealPlans || []).forEach(plan => {
      const dateStr = plan.date.split('T')[0]
      if (!mealPlansByDay[dateStr]) {
        mealPlansByDay[dateStr] = { breakfast: [], lunch: [], dinner: [] }
      }
      if (plan.meals) {
        const mealType = plan.meals.meal_type
        if (mealPlansByDay[dateStr][mealType]) {
          mealPlansByDay[dateStr][mealType].push(plan.meals)
        }
      }
    })

    return res.status(200).json({
      success: true,
      mealPlansByDay,
      hasPlans: Object.keys(mealPlansByDay).length > 0
    })

  } catch (error) {
    console.error("getMealPlan error:", error)
    return res.status(500).json({ 
      success: false, 
      error: error?.message || "Failed to fetch meal plans" 
    })
  }
}