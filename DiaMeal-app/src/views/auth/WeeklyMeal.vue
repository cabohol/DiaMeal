<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { supabase } from '@/utils/supabase'

// API base URL - change this for production
const isDev = import.meta.env.DEV
const API_BASE_URL = isDev 
  ? '' // Use relative URLs in development (requires proxy)
  : (import.meta.env.VITE_API_URL || 'https://meal-plan-rip62bwl0-claire-annes-projects.vercel.app')

// Generate day labels with actual dates based on user's last_submission_date
const generateDaysWithDates = (startDate) => {
  const days = []
  const baseDate = new Date(startDate)
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(baseDate)
    date.setDate(baseDate.getDate() + i)
    const dateStr = date.toISOString().split('T')[0]
    const dayLabel = `Day ${i + 1}`
    days.push({ label: dayLabel, date: dateStr })
  }
  
  return days
}

// Add this computed property
const formatProcedureSteps = computed(() => {
  if (!selectedMeal.value?.procedures || typeof selectedMeal.value.procedures !== 'string') {
    return []
  }
  
  let text = selectedMeal.value.procedures
  
  // Method 1: Try splitting by actual newlines first
  let steps = text.split(/\n\n|\n/).map(s => s.trim()).filter(s => s.length > 0)
  
  // Method 2: If no newlines, try splitting by "Step X:" pattern
  if (steps.length === 1 && text.includes('Step')) {
    const matches = text.match(/Step \d+:.*?(?=Step \d+:|$)/gs)
    if (matches && matches.length > 1) {
      steps = matches.map(s => s.trim())
    }
  }
  
  // Remove "Step X:" prefix ONLY (keep the actual instruction text)
  return steps.map(step => {
    // Remove "Step 1:", "Step 2:", etc. but keep everything else
    return step.replace(/^Step \d+:\s*/i, '').trim()
  })
})


const daysWithDates = ref([])
const selectedDayIndex = ref(0)
const selectedDay = computed(() => {
  if (!daysWithDates.value || daysWithDates.value.length === 0) {
    return { label: 'Loading', date: getLocalDateString() }
  }
  return daysWithDates.value[selectedDayIndex.value] || daysWithDates.value[0]
})

const loading = ref(false)
const errorMsg = ref('')
const mealPlansByDay = ref({})
const isExistingPlan = ref(false)
const userStartDate = ref(null)

// Modal variables
const mealDetailsDialog = ref(false)
const selectedMeal = ref(null)
const selectedMealType = ref('')


// Nutrition calculation variables
const nutritionTotals = ref({
  calories: 0,
  carbs: 0,
  protein: 0,
  fats: 0,
  fiber: 0
})

// Get meals for selected day
const currentDayMeals = computed(() => {
  const dateStr = selectedDay.value?.date
  if (!dateStr || !mealPlansByDay.value[dateStr]) {
    return { breakfast: [], lunch: [], dinner: [] }
  }
  return mealPlansByDay.value[dateStr]
})

// Enhanced fetchWithCors function with better error handling
const fetchWithCors = async (url, options = {}) => {
  const fetchOptions = {
    ...options,
    mode: 'cors',
    credentials: 'omit',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  }
  
  console.log('Making request to:', url, 'with options:', fetchOptions)
  
  try {
    const response = await fetch(url, fetchOptions)
    console.log('Response status:', response.status, 'URL:', url)
    
    if (!response.ok) {
      // Try to get error details from response
      const errorText = await response.text()
      console.error('Error response:', errorText)
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`)
    }
    
    return response
  } catch (error) {
    console.error('Fetch error for URL:', url, 'Error:', error)
    throw error
  }
}

// Replace the hardcoded weeklyBudget with this:
const weeklyBudget = ref(0);

// Add this function to fetch the user's budget
const fetchUserBudget = async () => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw new Error('User not authenticated')

    const { data: userRow, error: userRowErr } = await supabase
      .from('users')
      .select('budget')
      .eq('email', user.email)
      .single()
    
    if (userRowErr || !userRow) {
      console.error('Failed to fetch budget:', userRowErr)
      return
    }

    weeklyBudget.value = parseFloat(userRow.budget) || 0
    console.log('User weekly budget:', weeklyBudget.value)
    
  } catch (err) {
    console.error('Error fetching user budget:', err)
  }
}

// Calculate spent amount based on completed meals
const spentAmount = computed(() => {
  let total = 0;
  Object.entries(completedMeals.value).forEach(([key, completed]) => {
    if (completed) {
      const [date, mealType] = key.split('-');
      const meals = mealPlansByDay.value[date]?.[mealType] || [];
      
      // Get the completed meal option index
      const completedIndex = completedMealOptions.value[key];
      
      // Add cost of the completed meal
      if (completedIndex !== null && completedIndex !== undefined && meals[completedIndex]) {
        const completedMeal = meals[completedIndex];
        total += completedMeal.estimated_cost_per_serving || 0;
      }
    }
  });
  return total;
});

// Function to calculate nutrition when meal changes
const calculateNutrition = async () => {
  console.log('calculateNutrition called', { selectedMeal: selectedMeal.value })
  
  if (!selectedMeal.value || !selectedMeal.value.ingredients) {
    console.log('No selectedMeal or ingredients found')
    nutritionTotals.value = {
      calories: 0,
      carbs: 0,
      protein: 0,
      fats: 0,
      fiber: 0
    }
    return
  }

  let ingredients = selectedMeal.value.ingredients
  console.log('Selected meal ingredients:', ingredients)

  try {
    // If ingredients are strings, fetch nutrition data from Supabase
    if (Array.isArray(ingredients) && ingredients.length > 0 && typeof ingredients[0] === 'string') {
      console.log('Fetching nutrition for string ingredients:', ingredients)
      
      // Use .in() for exact match (case-sensitive)
      const { data: nutritionData, error } = await supabase
        .from('ingredients')
        .select('*')
        .in('name', ingredients)
      
      console.log('First query result:', { nutritionData, error })
      
      if (error || !nutritionData || nutritionData.length === 0) {
        console.warn('First query failed, trying case-insensitive search:', error)
        
        // Fallback: Try case-insensitive search one by one
        const promises = ingredients.map(async (ingredientName) => {
          const { data, error } = await supabase
            .from('ingredients')
            .select('*')
            .ilike('name', ingredientName)
            .limit(1)
            .single()
          
          if (error) {
            console.warn(`Ingredient not found: ${ingredientName}`, error)
            return null
          }
          console.log(`Found ingredient: ${ingredientName}`, data)
          return data
        })
        
        const results = await Promise.all(promises)
        const validResults = results.filter(r => r !== null)
        
        console.log('Valid results from fallback:', validResults)
        
        if (validResults.length === 0) {
          console.error('No ingredients found in database')
          nutritionTotals.value = {
            calories: 0,
            carbs: 0,
            protein: 0,
            fats: 0,
            fiber: 0
          }
          return
        }
        
        processNutritionData(validResults)
      } else {
        console.log('Processing nutrition data from first query')
        processNutritionData(nutritionData)
      }
    }
    // If ingredients already have nutrition data
    else if (Array.isArray(ingredients) && ingredients.length > 0 && typeof ingredients[0] === 'object') {
      console.log('Processing ingredients with nutrition data')
      processNutritionData(ingredients)
    }
  } catch (err) {
    console.error('Error calculating nutrition:', err)
    nutritionTotals.value = {
      calories: 0,
      carbs: 0,
      protein: 0,
      fats: 0,
      fiber: 0
    }
  }
}

// Helper function to process nutrition data
const processNutritionData = (nutritionData) => {
  console.log('Processing nutrition data:', nutritionData)

  // Get amounts from ingredient_amounts field
  const ingredientAmounts = selectedMeal.value.ingredient_amounts || {}

  // Transform ingredients with calculated costs
  selectedMeal.value.ingredients = nutritionData.map(ingredient => {
    // Get amount from ingredient_amounts object
    const amountData = ingredientAmounts[ingredient.name] || { amount: 100, unit: 'g' }
    const amount = amountData.amount
    const unit = amountData.unit
    
    const scaleFactor = amount / 1000 // Convert to kg for price calculation
    
    // Calculate price based on amount
    const pricePerKg = extractPrice(ingredient.estimated_price) || 0
    const calculatedPrice = pricePerKg * scaleFactor
    
    return {
      name: ingredient.name,
      amount: amount,
      unit: unit,
      pricePerKg: `₱${pricePerKg.toFixed(2)} per kg`,
      calculatedPrice: calculatedPrice,
      calories_per_100g: (ingredient.calories_per_100g || 0) * (amount / 100),
      carbs_per_100g: (ingredient.carbs_per_100g || 0) * (amount / 100),
      protein_per_100g: (ingredient.protein_per_100g || 0) * (amount / 100),
      fat_per_100g: (ingredient.fat_per_100g || 0) * (amount / 100),
      fiber_per_100g: (ingredient.fiber_per_100g || 0) * (amount / 100)
    }
  })

  // Calculate totals (same as before)
  const totals = selectedMeal.value.ingredients.reduce((acc, ingredient) => {
    return {
      calories: acc.calories + (parseFloat(ingredient.calories_per_100g) || 0),
      carbs: acc.carbs + (parseFloat(ingredient.carbs_per_100g) || 0),
      protein: acc.protein + (parseFloat(ingredient.protein_per_100g) || 0),
      fats: acc.fats + (parseFloat(ingredient.fat_per_100g) || 0),
      fiber: acc.fiber + (parseFloat(ingredient.fiber_per_100g) || 0),
      totalCost: acc.totalCost + (parseFloat(ingredient.calculatedPrice) || 0)
    }
  }, { calories: 0, carbs: 0, protein: 0, fats: 0, fiber: 0, totalCost: 0 })

  nutritionTotals.value = {
    calories: Math.round(totals.calories),
    carbs: Math.round(totals.carbs * 10) / 10,
    protein: Math.round(totals.protein * 10) / 10,
    fats: Math.round(totals.fats * 10) / 10,
    fiber: Math.round(totals.fiber * 10) / 10,
    totalCost: Math.round(totals.totalCost * 100) / 100
  }
}
// Helper function
const extractPrice = (priceRange) => {
  if (!priceRange) return null
  const match = priceRange.match(/₱?([\d.]+)/)
  if (match && match[1]) {
    return parseFloat(match[1])
  }
  return null
}

// Computed property to return the nutrition totals
const totalNutrition = computed(() => {
  return nutritionTotals.value
})

// Watch for changes in selectedMeal and recalculate nutrition
watch(selectedMeal, () => {
  if (selectedMeal.value) {
    calculateNutrition()
  }
})

// Helper function to get local date string (YYYY-MM-DD format)
const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Updated fetchUserStartDate function
const fetchUserStartDate = async () => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw new Error('User not authenticated')

    // Fetch user row to get last_submission_date
    const { data: userRow, error: userRowErr } = await supabase
      .from('users')
      .select('last_submission_date')
      .eq('email', user.email)
      .single()
    
    if (userRowErr || !userRow) {
      console.error('User row error:', userRowErr)
      throw userRowErr || new Error('User row not found')
    }

    if (!userRow.last_submission_date) {
      throw new Error('User has no submission date. Please complete your profile first.')
    }

    userStartDate.value = userRow.last_submission_date
    // Generate days based on user's submission date
    const generatedDays = generateDaysWithDates(userRow.last_submission_date)
    if (generatedDays && generatedDays.length > 0) {
      daysWithDates.value = generatedDays
      
      const todayLocal = getLocalDateString() // This gets local date correctly
      const todayIndex = generatedDays.findIndex(day => day.date === todayLocal)
      
      // If today matches one of the generated days, select it; otherwise default to Day 1
      selectedDayIndex.value = todayIndex >= 0 ? todayIndex : 0
      
      console.log('Today (local):', todayLocal)
      console.log('Generated days:', generatedDays.map(d => d.date))
      console.log('Today index found:', todayIndex)
      console.log('Selected day index:', selectedDayIndex.value)
    } else {
      throw new Error('Failed to generate days')
    }
    
    console.log('User start date:', userRow.last_submission_date)
    console.log('Generated days:', daysWithDates.value)
    console.log('Selected day index:', selectedDayIndex.value)
    
  } catch (err) {
    console.error('Error fetching user start date:', err)
    errorMsg.value = err.message || 'Failed to fetch user data'
    // Provide fallback data
    daysWithDates.value = []
  }
}

// Add this before existing fetchMealPlan try block
console.log('Environment check:', {
  isDev,
  API_BASE_URL,
  userStartDate: userStartDate.value,
  selectedDay: selectedDay.value
})

// Fetch or generate meal plan
const fetchMealPlan = async (forceRegenerate = false) => {
  loading.value = true
  errorMsg.value = ''

  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw new Error('User not authenticated')

    const { data: userRow, error: userRowErr } = await supabase
      .from('users')
      .select('id')
      .eq('email', user.email)
      .maybeSingle()
    if (userRowErr || !userRow) {
      console.error('User row error:', userRowErr)
      throw userRowErr || new Error('User row not found')
    }

    console.log('Fetching meal plan for user:', userRow.id)

    // First try to get existing meal plan
    if (!forceRegenerate) {
      const getResp = await fetchWithCors(`${API_BASE_URL}/api/getMealPlan/${userRow.id}`, {
        method: 'GET'
      })

      if (getResp.ok) {
        const getData = await getResp.json()
        if (getData.success && getData.mealPlansByDay && Object.keys(getData.mealPlansByDay).length >= 7) {
          console.log('Using existing meal plan:', getData.mealPlansByDay)
          mealPlansByDay.value = getData.mealPlansByDay
          isExistingPlan.value = true
          return
        }
      }
    }

    // Enhanced logging before making the API call
    const requestBody = { 
      user_id: userRow.id,
      force_regenerate: forceRegenerate 
    }
    console.log('Making API request with body:', JSON.stringify(requestBody, null, 2))
    console.log('API URL:', `${API_BASE_URL}/api/generateMealPlan`)

    // Generate new meal plan
    const resp = await fetchWithCors(`${API_BASE_URL}/api/generateMealPlan`, {
      method: 'POST',
      body: JSON.stringify(requestBody)
    })

    console.log('Response received - Status:', resp.status)
    console.log('Response headers:', Object.fromEntries(resp.headers.entries()))

    if (!resp.ok) {
      const text = await resp.text()
      console.error('Error response body:', text)
      
      try {
        const errorJson = JSON.parse(text)
        console.error('Parsed error:', errorJson)
        throw new Error(errorJson.error || `Server error: ${resp.status}`)
      } catch (parseError) {
        console.error('Failed to parse error response:', parseError)
        throw new Error(`Server error: ${resp.status} - ${text}`)
      }
    }

    const json = await resp.json()
    console.log('Success response:', JSON.stringify(json, null, 2))

    // Validate the response structure
    if (!json.success) {
      throw new Error(json.error || 'Failed to generate meal plan')
    }

    // Check if mealPlansByDay has the expected structure
    if (json.mealPlansByDay) {
      console.log('Meal plans structure check:')
      Object.keys(json.mealPlansByDay).forEach(day => {
        const dayPlan = json.mealPlansByDay[day]
        console.log(`  ${day}:`, {
          breakfast: Array.isArray(dayPlan.breakfast) ? dayPlan.breakfast.length : 'NOT ARRAY',
          lunch: Array.isArray(dayPlan.lunch) ? dayPlan.lunch.length : 'NOT ARRAY',
          dinner: Array.isArray(dayPlan.dinner) ? dayPlan.dinner.length : 'NOT ARRAY'
        })
        
        // Check first breakfast item structure if it exists
        if (dayPlan.breakfast && dayPlan.breakfast[0]) {
          console.log(`  ${day} breakfast[0] structure:`, Object.keys(dayPlan.breakfast[0]))
        }
      })
    }

    mealPlansByDay.value = json.mealPlansByDay || {}
    isExistingPlan.value = json.isExisting || false
    
    console.log('Meal plans loaded successfully')
  } catch (err) {
    console.error('Error in fetchMealPlan:', err)
    console.error('Error stack:', err.stack)
    errorMsg.value = err.message || 'Something went wrong'
  } finally {
    loading.value = false
  }
}

// Optional health check - doesn't fail the app if it fails
const testAPIConnection = async () => {
  try {
    console.log("Testing API at:", `${API_BASE_URL}/api/health`)
    const response = await fetchWithCors(`${API_BASE_URL}/api/health`)
    if (!response.ok) {
      console.warn(`Health check failed with ${response.status}, but continuing...`)
      return false
    }
    const data = await response.json()
    console.log("API Health Check:", data)
    return true
  } catch (error) {
    console.warn("Health check failed, but continuing:", error)
    return false
  }
}

const goBack = () => window.history.back()

const sections = computed(() => ([
  { key: 'breakfast', title: 'BREAKFAST', icon: 'mdi-egg-fried' },
  { key: 'lunch', title: 'LUNCH', icon: 'mdi-bowl-mix' },
  { key: 'dinner', title: 'DINNER', icon: 'mdi-pot-steam' }
]))

// Modal functions to include nutrition calculation
const viewMeal = async (meal) => {
  try {
    // Fetch the complete meal data with ingredient amounts
    const { data: fullMeal, error } = await supabase
      .from('meals')
      .select(`
        *,
        meal_ingredients (
          quantity,
          unit,
          ingredients (*)
        )
      `)
      .eq('id', meal.id)
      .single();

    if (error) {
      console.error('Error fetching meal details:', error);
      selectedMeal.value = JSON.parse(JSON.stringify(meal)); // Fallback to basic meal
    } else {
      // Use the full meal data with ingredient amounts
      selectedMeal.value = fullMeal;
      
      // If meal has ingredient_amounts in JSON, use it
      if (fullMeal.ingredient_amounts && Object.keys(fullMeal.ingredient_amounts).length > 0) {
        selectedMeal.value.ingredient_amounts = fullMeal.ingredient_amounts;
      } 
      // Otherwise, build from meal_ingredients relationship
      else if (fullMeal.meal_ingredients && fullMeal.meal_ingredients.length > 0) {
        const amounts = {};
        fullMeal.meal_ingredients.forEach(mi => {
          if (mi.ingredients) {
            amounts[mi.ingredients.name] = {
              amount: mi.quantity,
              unit: mi.unit
            };
          }
        });
        selectedMeal.value.ingredient_amounts = amounts;
      }
    }
    
    selectedMealType.value = getCurrentMealType(meal);
    await calculateNutrition(); // Calculate nutrition data
    mealDetailsDialog.value = true;
    
  } catch (err) {
    console.error('Error in viewMeal:', err);
    // Fallback to original meal data
    selectedMeal.value = JSON.parse(JSON.stringify(meal));
    selectedMealType.value = getCurrentMealType(meal);
    await calculateNutrition();
    mealDetailsDialog.value = true;
  }
};

const closeMealDetails = () => {
  mealDetailsDialog.value = false
  selectedMeal.value = null
  selectedMealType.value = ''
  // Reset nutrition totals
  nutritionTotals.value = {
    calories: 0,
    carbs: 0,
    protein: 0,
    fats: 0,
    fiber: 0
  }
}

const getMealTypeFromKey = (key) => {
  const types = {
    breakfast: 'Breakfast',
    lunch: 'Lunch', 
    dinner: 'Dinner',
    snack: 'Snack'
  }
  return types[key] || 'Meal'
}

const formatNutritionKey = (key) => {
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ')
}

const getCurrentMealType = (meal) => {
  for (const [key, meals] of Object.entries(currentDayMeals.value)) {
    if (meals.includes(meal)) {
      return key
    }
  }
  return 'meal'
}

// Regenerate entire week meal plan
const regenerateMealPlan = async () => {
  if (confirm('This will generate a new 7-day meal plan. Your current plan will be replaced. Continue?')) {
    await fetchMealPlan(true)
  }
}

// Format date for display
const formatDate = (dateStr) => {
  const date = new Date(dateStr + 'T00:00:00')
  const options = { month: 'short', day: 'numeric' }
  return date.toLocaleDateString('en-US', options)
}

// Alert message variables
const showSuccessAlert = ref(false)
const alertMessage = ref('')
const alertType = ref('success')

// Reactive variables
const completedMeals = ref({})
const currentUserId = ref(null)

// NEW: Track which specific meal option was completed (for enforcement)
const completedMealOptions = ref({})

// Helper functions for time checking and meal completion
const getCurrentTime = () => {
  const now = new Date()
  const hours = now.getHours()
  const minutes = now.getMinutes()
  return hours * 60 + minutes // Convert to minutes for easier comparison
}

const isTimeAllowedForMealType = (mealType) => {
  const currentTimeMinutes = getCurrentTime()
  
  const timeWindows = {
    breakfast: { start: 6 * 60, end: 8 * 60 }, // 6:00 AM - 8:00 AM
    lunch: { start: 11 * 60, end: 14 * 60 },   // 11:00 AM - 2:00 PM
    dinner: { start: 18 * 60, end: 23 * 60 }   // 6:00 PM - 8:00 PM
  }
  
  const window = timeWindows[mealType]
  if (!window) return false
  
  return currentTimeMinutes >= window.start && currentTimeMinutes <= window.end
}

// NEW: Get the completed meal option index for a specific meal type and date
const getCompletedMealIndex = (date, mealType) => {
  const key = `${date}-${mealType}`
  return completedMealOptions.value[key] !== undefined ? completedMealOptions.value[key] : null
}

// NEW: Check if a specific meal option is the one that was completed
const isMealOptionCompleted = (date, mealType, mealIndex) => {
  const completedIndex = getCompletedMealIndex(date, mealType)
  return completedIndex === mealIndex
}

// NEW: Check if View Details should be disabled for this meal
const isViewDetailsDisabled = (date, mealType, mealIndex) => {
  // If no meal has been completed yet for this type, all are viewable
  const completedIndex = getCompletedMealIndex(date, mealType)
  if (completedIndex === null) {
    return false
  }
  
  // If this specific meal was completed, it's viewable
  if (completedIndex === mealIndex) {
    return false
  }
  // Otherwise, disable it (another option was chosen)
  return true
}

const isMealCompleted = (date, mealType) => {
  const key = `${date}-${mealType}`
  return completedMeals.value[key] || false
}

const isMealTypeCompletedForDay = (date, mealType) => {
  const key = `${date}-${mealType}`
  return completedMeals.value[key] || false
}

const canMarkAsComplete = (date, mealType, mealIndex) => {
  const today = getLocalDateString()
  const mealDate = new Date(date)
  const todayDate = new Date(today)
  
  if (mealDate > todayDate) return false
  
  // NEW: Check if this meal type is completed
  if (isMealTypeCompletedForDay(date, mealType)) {
    // Only allow if THIS specific option was the one completed
    return isMealOptionCompleted(date, mealType, mealIndex)
  }
  
  if (mealDate < todayDate) return true
  
  return isTimeAllowedForMealType(mealType)
}

// NEW: Get button text based on completion status
const getButtonText = (date, mealType, mealIndex) => {
  if (isMealOptionCompleted(date, mealType, mealIndex)) {
    return 'Completed'
  }
  
  const completedIndex = getCompletedMealIndex(date, mealType)
  if (completedIndex !== null && completedIndex !== mealIndex) {
    return 'Not Chosen'
  }
  
  return 'Mark as Complete'
}

// Get button color based on completion status
const getButtonColor = (date, mealType, mealIndex) => {
  if (isMealOptionCompleted(date, mealType, mealIndex)) {
    return 'success' 
  }
  
  const completedIndex = getCompletedMealIndex(date, mealType)
  if (completedIndex !== null && completedIndex !== mealIndex) {
    return 'grey' 
  }
  
  return '#A9C46C' 
}

// Get button icon based on completion status
const getButtonIcon = (date, mealType, mealIndex) => {
  if (isMealOptionCompleted(date, mealType, mealIndex)) {
    return 'mdi-check-circle'
  }
  
  const completedIndex = getCompletedMealIndex(date, mealType)
  if (completedIndex !== null && completedIndex !== mealIndex) {
    return 'mdi-lock'
  }
  
  return 'mdi-check-circle'
}

// markMealAsCompleted function 
const markMealAsCompleted = async (meal, mealType, mealIndex) => {
  try {
    console.log('=== MARK MEAL COMPLETE START ===')
    console.log('Meal:', { mealName: meal.name, mealType, mealIndex })
    console.log('Selected day:', selectedDay.value)
    console.log('Days with dates:', daysWithDates.value)
    console.log('User ID:', currentUserId.value)

    // Strict enforcement - check if any meal of this type is already completed
    const existingIndex = getCompletedMealIndex(selectedDay.value.date, mealType)
    
    if (existingIndex !== null) {
      if (existingIndex === mealIndex) {
        alertMessage.value = "This meal is already marked as completed."
        alertType.value = 'info'
        showSuccessAlert.value = true
        setTimeout(() => { showSuccessAlert.value = false }, 3000)
        return false
      } else {
        alertMessage.value = `You can only mark one ${mealType} meal as complete per day. You already completed Option ${existingIndex + 1}.`
        alertType.value = 'warning'
        showSuccessAlert.value = true
        setTimeout(() => { showSuccessAlert.value = false }, 4000)
        return false
      }
    }

    const { data: mealData, error: calorieError } = await supabase
      .from("meals")
      .select("calories, id")
      .eq("id", meal.id)
      .single()

    if (calorieError) {
      console.error("Error fetching meal calories:", calorieError)
      alertMessage.value = "Failed to fetch meal information. Please try again."
      alertType.value = 'error'
      showSuccessAlert.value = true
      return false
    }

    const correctCalories = mealData?.calories || 0

    if (!currentUserId.value || !selectedDay.value) {
      alertMessage.value = "Unable to mark meal as complete. Please refresh the page."
      alertType.value = 'error'
      showSuccessAlert.value = true
      return false
    }

    // 1. Save to completed_meals table
    console.log('Saving to completed_meals...')
    const { error } = await supabase
      .from("completed_meals")
      .upsert({
        user_id: currentUserId.value,
        meal_id: mealData.id,
        meal_date: selectedDay.value.date,
        meal_type: mealType,
        meal_name: meal.name,
        completed_date: new Date().toISOString().split("T")[0],
        calories: correctCalories,
      }, {
        onConflict: 'user_id,meal_date,meal_type'
      })

    if (error) {
      console.error("Error saving meal completion:", error)
      alertMessage.value = "Failed to mark meal as complete. Please try again."
      alertType.value = 'error'
      showSuccessAlert.value = true
      return false
    }
    console.log('✓ Saved to completed_meals')

    // 2. Calculate day number from userStartDate
    console.log('Calculating day number...')
    console.log('Selected date:', selectedDay.value.date)
    console.log('User start date:', userStartDate.value)
    
    let dayNumber = 1
    if (userStartDate.value && selectedDay.value.date) {
      const startDate = new Date(userStartDate.value + 'T00:00:00')
      const selectedDate = new Date(selectedDay.value.date + 'T00:00:00')
      const diffTime = selectedDate - startDate
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
      dayNumber = diffDays + 1
      console.log('Difference in days:', diffDays, 'Day number:', dayNumber)
    }
    
    console.log('Calculated day number:', dayNumber)

    if (dayNumber < 1 || dayNumber > 7) {
      console.error('Invalid day number calculated:', dayNumber)
      alertMessage.value = `Error: Invalid day number (${dayNumber}). Progress not saved.`
      alertType.value = 'warning'
      showSuccessAlert.value = true
      return false
    }

    // 3. Fetch all completed meals for this date
    console.log('Fetching completed meals for date:', selectedDay.value.date)
    const { data: allCompletedForDate, error: fetchError } = await supabase
      .from("completed_meals")
      .select("calories")
      .eq("user_id", currentUserId.value)
      .eq("meal_date", selectedDay.value.date)

    if (fetchError) {
      console.error('Error fetching completed meals:', fetchError)
    }

    const totalCaloriesForDay = (allCompletedForDate || []).reduce((sum, m) => sum + (m.calories || 0), 0)
    console.log('Total calories for day:', totalCaloriesForDay, 'Meals:', allCompletedForDate)

    // 4. Count unique meal types completed
    console.log('Counting completed meal types...')
    const { data: completedMealsForDay, error: typeError } = await supabase
      .from("completed_meals")
      .select("meal_type")
      .eq("user_id", currentUserId.value)
      .eq("meal_date", selectedDay.value.date)

    if (typeError) {
      console.error('Error fetching meal types:', typeError)
    }

    const uniqueMealTypes = new Set((completedMealsForDay || []).map(m => m.meal_type?.toLowerCase()))
    const completedCount = uniqueMealTypes.size
    console.log('Completed meal types:', Array.from(uniqueMealTypes), 'Count:', completedCount)

    // 5. Update progress table with DETAILED LOGGING
    console.log('=== UPSERTING TO PROGRESS TABLE ===')
    const progressPayload = {
      user_id: currentUserId.value,
      day: dayNumber,
      calories_consumed: totalCaloriesForDay,
      status: completedCount >= 3 ? 'completed' : 'in_progress',
      updated_at: new Date().toISOString()
    }
    console.log('Progress payload:', JSON.stringify(progressPayload, null, 2))

    const { data: progressData, error: progressError } = await supabase
      .from("progress")
      .upsert(progressPayload, {
        onConflict: 'user_id,day'
      })
      .select()

    console.log('Progress response:', { data: progressData, error: progressError })

    if (progressError) {
      console.error("Error updating progress:", progressError)
      alertMessage.value = `Meal completed but progress update failed: ${progressError.message}`
      alertType.value = 'warning'
      showSuccessAlert.value = true
    } else {
      console.log('✓ Progress updated successfully')
    }

    // Update local state
    const key = `${selectedDay.value.date}-${mealType}`
    completedMeals.value[key] = true
    completedMealOptions.value[key] = mealIndex
    
    alertMessage.value = `${meal.name} marked as complete!`
    alertType.value = 'success'
    showSuccessAlert.value = true
    
    setTimeout(() => {
      showSuccessAlert.value = false
    }, 4000)
    
    console.log('=== MARK MEAL COMPLETE END ===')
    return true
    
  } catch (err) {
    console.error("Error in markMealAsCompleted:", err)
    console.error('Error stack:', err.stack)
    alertMessage.value = "An unexpected error occurred. Please try again."
    alertType.value = 'error'
    showSuccessAlert.value = true
    return false
  }
}

// Add this computed property
// Add this computed property
const estimatedDayBudget = computed(() => {
  const dateStr = selectedDay.value?.date
  if (!dateStr || !mealPlansByDay.value[dateStr]) {
    return {
      breakfast: 0,
      lunch: 0,
      dinner: 0,
      total: 0,
      dailyTarget: weeklyBudget.value / 7,
      difference: 0,
      percentage: 0
    }
  }
  
  const dayMeals = mealPlansByDay.value[dateStr]
  
  // Calculate average cost for each meal type (3 options each)
  const calculateAverage = (meals) => {
    if (!meals || meals.length === 0) return 0
    const total = meals.reduce((sum, m) => sum + (m.estimated_cost_per_serving || 0), 0)
    return total / meals.length
  }
  
  const breakfast = calculateAverage(dayMeals.breakfast)
  const lunch = calculateAverage(dayMeals.lunch)
  const dinner = calculateAverage(dayMeals.dinner)
  const total = breakfast + lunch + dinner
  const dailyTarget = weeklyBudget.value / 7
  
  return {
    breakfast,
    lunch,
    dinner,
    total,
    dailyTarget,
    difference: dailyTarget - total,
    percentage: (total / dailyTarget) * 100
  }
})


// UPDATED: Fetch completed meals from database
const fetchCompletedMeals = async () => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return

    const { data: userRow, error: userRowErr } = await supabase
      .from("users")
      .select("id")
      .eq("email", user.email)
      .single()

    if (userRowErr || !userRow) return

    currentUserId.value = userRow.id

    const { data: completed, error: fetchError } = await supabase
      .from("completed_meals")
      .select("meal_date, meal_type, meal_id")
      .eq("user_id", userRow.id)

    if (fetchError) {
      console.error("Error fetching completed meals:", fetchError)
      return
    }

    const completedLookup = {}
    const completedOptionsLookup = {}
    
    // NEW: Build lookup for completed meals and their option indices
    for (const item of completed) {
      const key = `${item.meal_date}-${item.meal_type}`
      completedLookup[key] = true
      
      // Find which option index this meal is
      const date = item.meal_date
      if (mealPlansByDay.value[date] && mealPlansByDay.value[date][item.meal_type]) {
        const meals = mealPlansByDay.value[date][item.meal_type]
        const mealIndex = meals.findIndex(m => m.id === item.meal_id)
        if (mealIndex !== -1) {
          completedOptionsLookup[key] = mealIndex
        }
      }
    }
    
    completedMeals.value = completedLookup
    completedMealOptions.value = completedOptionsLookup
    
    console.log("Loaded completed meals:", completedLookup)
    console.log("Loaded completed meal options:", completedOptionsLookup)
  } catch (err) {
    console.error("Error fetching completed meals:", err)
  }
}

// Update onMounted
onMounted(async () => {
  console.log("Initializing WeeklyMeal component...")

  const healthOk = await testAPIConnection()
  if (healthOk) {
    console.log("API health check passed")
  } else {
    console.log("API health check failed, but continuing with meal plan fetch")
  }

  await fetchUserStartDate()
  await fetchUserBudget() 
  if (!errorMsg.value) {
    await fetchMealPlan()
    await fetchCompletedMeals()
  }
})
</script>


<template>
  <v-app>
    <!-- Top App Bar -->
    <v-app-bar flat color="#A9C46C">
      <v-btn icon @click="goBack" style="color: white;">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="flex items-center gap-2 text-white" style="font-family: 'Syne', sans-serif; margin-left: 2px;">
        <span>Weekly Menu</span>
        <v-icon size="30" color="white" style="margin-left: 5px;">mdi-book-open-page-variant</v-icon>
      </v-toolbar-title>

      <v-spacer></v-spacer>
    </v-app-bar>

    <br><br><br><br>

    <!--Day selection buttons (Day 1–7 with corresponding dates)-->
    <div class="day-scroll">
      <div class="day-buttons">
        <v-btn
          v-for="(day, index) in daysWithDates"
          :key="day.date"
          :color="selectedDayIndex === index ? '#A9C46C' : 'white'"
          :class="selectedDayIndex === index ? 'text-white active-day-btn' : 'text-black day-btn'"
          rounded
          @click="selectedDayIndex = index"
        >
          <div class="day-content">
            <span class="day-label">Day {{ index + 1 }}</span>
            <span class="day-date">{{ formatDate(day.date) }}</span>
          </div>
        </v-btn>
      </div>
    </div>

    <v-container>
      <!-- Error Alert -->
      <v-alert
        v-if="errorMsg"
        type="error"
        variant="tonal"
        closable
        @click:close="errorMsg = ''"
        class="mb-4"
      >
        {{ errorMsg }}
      </v-alert>

     
      <!-- RoboLoading -->
      <div v-if="loading" class="loading-wrapper text-center py-10">
        <div class="video-container">
          <video
            autoplay
            muted
            loop
            playsinline
            class="loading-video"
            src="/src/assets/roboloading.mp4"
          >
            <!-- Fallback if video doesn't load -->
            <div class="video-fallback">
              <div class="pot">
                <div class="bubble"></div>
                <div class="bubble"></div>
                <div class="bubble"></div>
                <div class="lid"></div>
              </div>
            </div>
          </video>
        </div>
        
        <p class="mt-5 text-lg" style="font-family: 'Syne', sans-serif; font-size: 20px; color: #5B913B; font-weight: 400;">
          Preparing your personalized meal plan!
        </p>
      </div>

      

      <!-- Meal Sections -->
      <template v-if="!loading && !errorMsg">
        <!-- Date Header -->
        <v-card class="mb-4 text-center" flat color="transparent">
          <v-card-text>
            <!-- Day label -->
            <h2 class="meal-day-title text-h4 text-sm-h3 text-md-h2" style="font-family: 'Syne', sans-serif;">
              {{ selectedDay?.label || 'Loading...' }}
            </h2>

            <!-- Date -->
            <p class="meal-day-date text-body-1 text-sm-h6" style="font-family: 'Syne', sans-serif;">
              {{ selectedDay?.date ? formatDate(selectedDay.date) : '' }}
            </p>
          </v-card-text>
          </v-card>  

            <!-- Time Window Information Alert -->
            <v-alert
              variant="tonal"
              prominent
              class="mb-4 mx-2 mx-sm-4"
              color="#5D8736"
              rounded="lg"
            >
              <div class="d-flex flex-column align-center text-center">
                <span class="font-weight-bold mb-3" style="font-family: 'Syne', sans-serif; font-size: 16px;">
                  Meal Completion Time Windows
                </span>
                <div class="text-body-2" style="font-family: 'Syne', sans-serif;">
                  <div class="mb-2 d-flex align-center justify-center">
                    <v-icon size="small" class="mr-2" color="#FF9800">mdi-egg-fried</v-icon>
                    <strong>Breakfast:</strong> <span class="ml-1">6:00 AM - 8:00 AM</span>
                  </div>
                  <div class="mb-2 d-flex align-center justify-center">
                    <v-icon size="small" class="mr-2" color="#FFC107">mdi-bowl-mix</v-icon>
                    <strong>Lunch:</strong> <span class="ml-1">11:00 AM - 2:00 PM</span>
                  </div>
                  <div class="d-flex align-center justify-center">
                    <v-icon size="small" class="mr-2" color="#FF9800">mdi-pot-steam</v-icon>
                    <strong>Dinner:</strong> <span class="ml-1">6:00 PM - 11:00 PM</span>
                  </div>
                </div>
              </div>
            </v-alert>
            
          <!-- Daily Budget Estimate Card -->
    <v-card 
      class="mb-6 mx-2 mx-sm-4" 
      rounded="lg" 
      elevation="3"
    >
      <!-- Header -->
      <div class="pa-4" style="background: linear-gradient(135deg, #5D8736 0%, #7BAF4A 100%);">
        <div class="d-flex align-items-center justify-space-between">
          <div class="d-flex align-items-center">
            <v-icon color="white" size="large" class="mr-2">mdi-calendar-today</v-icon>
            <div>
              <h3 class="text-h6 font-weight-bold text-white" style="font-family: 'Syne', sans-serif;">
                {{ selectedDay?.label }} Budget Estimate
              </h3>
              <p class="text-caption text-white" style="font-family: 'Syne', sans-serif;">
                {{ selectedDay?.date ? formatDate(selectedDay.date) : '' }} • Per Serving
              </p>
            </div>
          </div>
          <v-chip 
            :color="estimatedDayBudget.difference >= 0 ? 'success' : 'error'"
            size="small"
            class="font-weight-bold"
          >
            {{ estimatedDayBudget.percentage.toFixed(0) }}%
          </v-chip>
        </div>
      </div>

      <v-card-text class="pa-4">
        <!-- Budget Overview -->
        <v-row class="mb-4">
          <v-col cols="6">
            <v-card class="pa-3 text-center" elevation="0" color="#7BAF4B" rounded="lg">
              <p class="text-caption mb-1" style="font-family: 'Syne', sans-serif; color: #FFFF;">
                Daily Target
              </p>
              <p class="text-h6 font-weight-bold" style="font-family: 'Syne', sans-serif; color: #FFFF;">
                ₱{{ estimatedDayBudget.dailyTarget.toFixed(2) }}
              </p>
              <p class="text-caption" style="font-family: 'Syne', sans-serif; color: #FFFF;">
                per day
              </p>
            </v-card>
          </v-col>
          <v-col cols="6">
            <v-card 
              class="pa-3 text-center" 
              elevation="0" 
              rounded="lg"
              :color="estimatedDayBudget.difference >= 0 ? '#E8F5E9' : '#FFEBEE'"
            >
              <p 
                class="text-caption mb-1" 
                style="font-family: 'Syne', sans-serif;"
                :style="{ color: estimatedDayBudget.difference >= 0 ? '#388E3C' : '#C62828' }"
              >
                Estimated Total
              </p>
              <p 
                class="text-h6 font-weight-bold" 
                style="font-family: 'Syne', sans-serif;"
                :style="{ color: estimatedDayBudget.difference >= 0 ? '#1B5E20' : '#B71C1C' }"
              >
                ₱{{ estimatedDayBudget.total.toFixed(2) }}
              </p>
              <p 
                class="text-caption" 
                style="font-family: 'Syne', sans-serif;"
                :style="{ color: estimatedDayBudget.difference >= 0 ? '#388E3C' : '#C62828' }"
              >
                per serving
              </p>
            </v-card>
          </v-col>
        </v-row>

        <!-- Meal Type Breakdown -->
        <div class="mb-4">
          <h4 class="text-body-2 font-weight-bold mb-3 d-flex align-items-center" 
              style="font-family: 'Syne', sans-serif; color: #2C3E50;">
            Average Cost per Meal Type (3 options each)
          </h4>

          <!-- Breakfast -->
          <v-card class="mb-2 pa-3" elevation="0" color="#E8F5E9" rounded="lg">
            <div class="d-flex justify-space-between align-items-center">
              <div class="d-flex align-items-center">
                <v-icon color="#388E3C" size="small" class="mr-2">mdi-egg-fried</v-icon>
                <span class="text-body-2 font-weight-medium" style="font-family: 'Syne', sans-serif;">
                  Breakfast
                </span>
              </div>
              <div class="text-right">
                <span class="text-body-2 font-weight-bold d-block" style="font-family: 'Syne', sans-serif; color: #388E3C;">
                  ₱{{ estimatedDayBudget.breakfast.toFixed(2) }}
                </span>
                <span class="text-caption" style="font-family: 'Syne', sans-serif; color: #757575;">
                  per serving
                </span>
              </div>
            </div>
          </v-card>

          <!-- Lunch -->
          <v-card class="mb-2 pa-3" elevation="0" color="#E8F5E9" rounded="lg">
            <div class="d-flex justify-space-between align-items-center">
              <div class="d-flex align-items-center">
                <v-icon color="#388E3C" size="small" class="mr-2">mdi-bowl-mix</v-icon>
                <span class="text-body-2 font-weight-medium" style="font-family: 'Syne', sans-serif;">
                  Lunch
                </span>
              </div>
              <div class="text-right">
                <span class="text-body-2 font-weight-bold d-block" style="font-family: 'Syne', sans-serif; color: #388E3C;">
                  ₱{{ estimatedDayBudget.lunch.toFixed(2) }}
                </span>
                <span class="text-caption" style="font-family: 'Syne', sans-serif; color: #757575;">
                  per serving
                </span>
              </div>
            </div>
          </v-card>

          <!-- Dinner -->
          <v-card class="pa-3" elevation="0" color="#E8F5E9" rounded="lg">
            <div class="d-flex justify-space-between align-items-center">
              <div class="d-flex align-items-center">
                <v-icon color="#388E3C" size="small" class="mr-2">mdi-pot-steam</v-icon>
                <span class="text-body-2 font-weight-medium" style="font-family: 'Syne', sans-serif;">
                  Dinner
                </span>
              </div>
              <div class="text-right">
                <span class="text-body-2 font-weight-bold d-block" style="font-family: 'Syne', sans-serif; color: #388E3C;">
                  ₱{{ estimatedDayBudget.dinner.toFixed(2) }}
                </span>
                <span class="text-caption" style="font-family: 'Syne', sans-serif; color: #757575;">
                  per serving
                </span>
              </div>
            </div>
          </v-card>
        </div>

        <!-- Budget Status -->
        <v-alert
          :type="estimatedDayBudget.difference >= 0 ? 'success' : 'error'"
          variant="tonal"
          rounded="lg"
          class="mb-3"
        >
          <div class="d-flex align-items-start">
           
            <div>
              <p class="text-body-2 font-weight-bold mb-1" style="font-family: 'Syne', sans-serif;">
                {{ estimatedDayBudget.difference >= 0 ? 'Within Budget' : 'Over Budget' }}
              </p>
              <p class="text-caption" style="font-family: 'Syne', sans-serif;">
                {{ estimatedDayBudget.difference >= 0 
                  ? `You'll save ₱${estimatedDayBudget.difference.toFixed(2)} under daily target.`
                  : `Estimated ₱${Math.abs(estimatedDayBudget.difference).toFixed(2)} over daily target.`
                }}
              </p>
            </div>
          </div>
        </v-alert>

        <!-- Info Note -->
        <v-alert
          type="info"
          variant="tonal"
          rounded="lg"
          density="compact"
        >
          <p class="text-caption" style="font-family: 'Syne', sans-serif;">
            <strong>Note:</strong> All costs are <strong>per serving</strong> and show averages of 3 meal options. 
            Actual cost depends on your meal choice.
          </p>
        </v-alert>
      </v-card-text>
    </v-card>
    <!-- End of Budget Card -->

    <!-- success/error/warning alert for meal completion -->
    <v-alert
      v-if="showSuccessAlert"
      :type="alertType"
      variant="tonal"
      closable
      @click:close="showSuccessAlert = false"
      class="custom-alert"
      :class="{
        'ma-2': $vuetify.display.xs,
        'ma-3': $vuetify.display.sm,
        'ma-4': $vuetify.display.mdAndUp
      }"
      rounded="lg"
    >
      <div class="d-flex align-center">
        <v-icon 
          :color="alertType === 'success' ? 'success' : 
                alertType === 'warning' ? 'warning' : 
                alertType === 'error' ? 'error' : 'info'"
          :size="$vuetify.display.xs ? 'default' : 'large'"
          class="mr-3"
        >
        </v-icon>
        
        <span 
          class="alert-message" 
          :class="{
            'text-body-2': $vuetify.display.xs,
            'text-body-1': $vuetify.display.smAndUp
          }"
        >
          {{ alertMessage }}
        </span>
      </div>
    </v-alert>

        <!-- Meal Type Sections -->
        <v-card
          v-for="sec in sections"
          :key="sec.key"
          class="pa-2 pa-sm-4 my-4 my-sm-6"
          rounded="lg"
          elevation="0"
          style="background-color: #E8F5C8; font-family: 'Syne', sans-serif;"
        >
          <div class="d-flex align-center justify-center mb-2 mb-sm-3">
            <v-icon :icon="sec.icon" class="mr-2" :size="$vuetify.display.xs ? 'default' : 'large'" />
            <h3 class="font-weight-bold text-h6 text-sm-h5" style="font-family: 'Syne', sans-serif;">{{ sec.title }}</h3>
          </div>
          
          <!-- Meals Carousel -->
          <div v-if="currentDayMeals[sec.key]?.length > 0" class="d-flex justify-center">
            <v-slide-group
              show-arrows
              :class="{
                'px-1': $vuetify.display.xs,
                'px-2': $vuetify.display.smAndUp
              }"
            >
             <v-slide-group-item
                v-for="(meal, idx) in currentDayMeals[sec.key]"
                :key="`${selectedDay.date}-${sec.key}-${idx}`"
              >
                <v-card
                  class="meal-card pa-3 pa-sm-4 pa-md-5 d-flex flex-column"
                  :class="{
                    'ma-1': $vuetify.display.xs,
                    'ma-2': $vuetify.display.sm,
                    'ma-3': $vuetify.display.mdAndUp,
                    'meal-card-disabled': isViewDetailsDisabled(selectedDay.date, sec.key, idx)
                  }"
                  rounded="lg"
                  elevation="2"
                  :hover="!isViewDetailsDisabled(selectedDay.date, sec.key, idx)"
                  style="font-family: 'Syne', sans-serif;"
                  :style="isViewDetailsDisabled(selectedDay.date, sec.key, idx) ? 'opacity: 0.6;' : ''"
                >
                  <!-- Card body with better spacing -->
                  <div class="d-flex flex-column h-100">
                    <!-- Meal name with consistent height -->
                    <div class="meal-name-container">
                      <div class="font-weight-bold text-h6 text-sm-h5 text-center" 
                          style="line-height: 1.2; font-family: 'Syne', sans-serif; min-height: 48px; display: flex; align-items: center; justify-content: center;">
                        {{ meal.name }}
                      </div>
                    </div>

                    <!-- Option chip -->
                    <div class="d-flex justify-center mb-4">
                      <v-chip 
                        :size="$vuetify.display.xs ? 'small' : 'default'" 
                        color="#A9C46C" 
                        class="text-white"
                        style="font-family: 'Syne', sans-serif;"
                      >
                        Option {{ idx + 1 }}
                      </v-chip>
                    </div>

                    <!-- Info section with consistent spacing -->
                    <div class="info-section mb-4 flex-grow-1">
                      <div class="text-body-2 text-sm-body-1 mb-3 d-flex align-center justify-center">
                        <v-icon size="small" class="mr-2" color="#124170">mdi-clock-outline</v-icon>
                        <span class="text-grey-darken-2" style="font-family: 'Syne', sans-serif;">
                          {{ meal.preparation_time || 'Quick prep' }}
                        </span>
                      </div>

                      <div class="text-body-2 text-sm-body-1 d-flex align-center justify-center">
                        <v-icon size="small" class="mr-2" color="#EF7722">mdi-fire</v-icon>
                        <span class="text-grey-darken-2" style="font-family: 'Syne', sans-serif;">
                          {{ typeof meal.calories === 'number' ? meal.calories + ' kcal' : 'Calories N/A' }}
                        </span>
                      </div>
                    </div>

                    <!-- Button always at bottom -->
                    <div class="mt-auto">
                      <v-btn
                        color="#5D8736"
                        rounded
                        :size="$vuetify.display.xs ? 'small' : 'default'"
                        block
                        class="text-white mb-2"
                        :disabled="selectedDay.date > getLocalDateString() || isViewDetailsDisabled(selectedDay.date, sec.key, idx)"
                        @click="viewMeal(meal)"
                        style="font-family: 'Syne', sans-serif;"
                      >
                        <span class="text-body-2 text-sm-body-1 font-weight-medium" style="font-family: 'Syne', sans-serif;">View Details</span>
                        <v-icon end :size="$vuetify.display.xs ? 'small' : 'default'">mdi-chevron-right</v-icon>
                      </v-btn>
                      
                      <!-- Mark as Complete Button with Enforcement -->
                      <v-btn
                        :color="getButtonColor(selectedDay.date, sec.key, idx)"
                        rounded
                        :size="$vuetify.display.xs ? 'small' : 'default'"
                        block
                        class="text-white"
                        :disabled="!canMarkAsComplete(selectedDay.date, sec.key, idx)"
                        @click.stop="markMealAsCompleted(meal, sec.key, idx)"
                        style="font-family: 'Syne', sans-serif;"
                      >
                        <v-icon start :size="$vuetify.display.xs ? 'small' : 'default'">
                          {{ getButtonIcon(selectedDay.date, sec.key, idx) }}
                        </v-icon>
                        <span class="text-body-2 text-sm-body-1 font-weight-medium" style="font-family: 'Syne', sans-serif;">
                          {{ getButtonText(selectedDay.date, sec.key, idx) }}
                        </span>
                      </v-btn>
                    </div>
                  </div>
                </v-card>
              </v-slide-group-item>
            </v-slide-group>
          </div>

          <!-- Empty State -->
          <div v-else class="text-center py-4 py-sm-6">
            <v-icon :size="$vuetify.display.xs ? '36' : '48'" color="grey-lighten-1">mdi-food-off</v-icon>
            <p class="mt-2 text-grey text-body-2 text-sm-body-1" style="font-family: 'Syne', sans-serif;">
              No {{ sec.title.toLowerCase() }} options available for this day.
            </p>
          </div>
        </v-card>
      </template>

      <br><br>
    </v-container>

    <!-- Bottom Navigation -->
    <v-bottom-navigation grow class="mt-8 nav-bar" style="background-color: #5B913B; margin-bottom: -1px;">
      <v-btn @click="$router.push('/home')" class="nav-tab" :class="{ active: $route.path === '/home' }">
        <span class="icon-wrapper" :class="{ active: $route.path === '/home' }">
          <v-icon>mdi-home</v-icon>
        </span>
        <span>Home</span>
      </v-btn>

      <v-btn @click="$router.push('/meal-plan')" class="nav-tab" :class="{ active: $route.path === '/meal-plan' }">
        <span class="icon-wrapper"  :class="{ active: $route.path === '/meal-plan' || $route.path === '/weekly-meal' }">
          <v-icon>mdi-heart-pulse</v-icon>
        </span>
        <span>Meal Plan</span>
      </v-btn>

      <v-btn @click="$router.push('/profile')" class="nav-tab" :class="{ active: $route.path === '/profile' }">
        <span class="icon-wrapper" :class="{ active: $route.path === '/profile' }">
          <v-icon>mdi-account</v-icon>
        </span>
        <span>Profile</span>
      </v-btn>

      <v-btn @click="$router.push('/myprogress')" class="nav-tab" :class="{ active: $route.path === '/myprogress' }">
        <span class="icon-wrapper" :class="{ active: $route.path === '/myprogress' }">
          <v-icon>mdi-chart-line</v-icon>
        </span>
        <span>Progress</span>
      </v-btn>
    </v-bottom-navigation>

      <!-- Meal Details Dialog -->
      <v-dialog
        v-model="mealDetailsDialog"
        max-width="900"
        persistent
        :fullscreen="$vuetify.display.xs">
        
        <v-card class="meal-details-card" :class="{ 'h-100': $vuetify.display.xs }"style="font-family: 'Syne', sans-serif;">
          <!-- Header with close button -->
          <v-card-title class="d-flex align-center justify-space-between pa-4 pa-sm-4" style="background: linear-gradient(135deg, #E8F5C8 0%, #D4E8A3 100%);">
            <div class="d-flex align-center">
              <v-icon color="#5D8736" size="large" class="mr-3">mdi-food</v-icon>
              <span class="text-h5 text-sm-h4 font-weight-bold" style="color: #2C3E50; font-family: 'Syne', sans-serif;">
                Meal Details
              </span>
            </div>
            <v-btn icon variant="text" color="#5D8736" @click="closeMealDetails">
              <v-icon>mdi-close</v-icon>
            </v-btn>
          </v-card-title>

          <!-- Content -->
          <v-card-text class="pa-4 pa-sm-6" v-if="selectedMeal">
            <!-- Meal Name -->
            <div class="text-center mb-6">
              <h2 class="text-h4 text-sm-h3 font-weight-bold mb-2" style="color: #2C3E50; line-height: 1.2; font-family: 'Syne', sans-serif;">
                {{ selectedMeal.name }}
              </h2>
              <v-chip
                color="#A9C46C"
                size="large"
                class="text-white font-weight-medium"
                style="font-family: 'Syne', sans-serif;"
              >
                {{ getMealTypeFromKey(selectedMealType) }} Option
              </v-chip>
            </div>
             
            <!-- COST & SERVING INFO -->
            <v-row class="mb-7 justify-center">
              <v-col cols="12" sm="10" md="12" lg="10" xl="8">
                <v-card class="pa-4 text-center nutrition-card" elevation="1" rounded="lg" color="#F8FDF0">
                  <v-row class="nutrition-grid">
                    <!-- Serving size -->
                    <v-col class="nutrition-item">
                      <v-icon color="#FF9800" size="28" class="mb-2">mdi-silverware-fork-knife</v-icon>
                      <div class="label">Serving</div>
                      <div class="value">
                        {{ selectedMeal.serving_size || '1 serving' }}
                      </div>
                    </v-col>

                    <!-- Servings count -->
                    <v-col class="nutrition-item">
                      <v-icon color="#2196F3" size="28" class="mb-2">mdi-bowl-mix</v-icon>
                      <div class="label">Count</div>
                      <div class="value">
                        {{ selectedMeal.servings_count || 1 }}
                      </div>
                    </v-col>
                  </v-row>
                </v-card>
              </v-col>
            </v-row>

            <!-- Quick Info Card - Calories and Nutrition -->
            <v-row class="mb-7 justify-center">
              <v-col cols="12" sm="10" md="12" lg="10" xl="8">
                <v-card class="pa-4 text-center nutrition-card" elevation="1" rounded="lg" color="#F8FDF0">
                  <v-row class="nutrition-grid">
                    <!-- Calories -->
                    <v-col class="nutrition-item">
                      <v-icon color="#EF7722" size="32" class="mb-2">mdi-fire</v-icon>
                      <div class="label">Calories</div>
                      <div class="value">
                        {{ typeof selectedMeal.calories === 'number' ? selectedMeal.calories : 'N/A' }}
                      </div>
                    </v-col>

                    <!-- Carbs -->
                    <v-col class="nutrition-item">
                      <v-icon color="#B87C4C" size="28" class="mb-2">mdi-barley</v-icon>
                      <div class="label">Carbs</div>
                      <div class="value">{{ totalNutrition.carbs }}g</div>
                    </v-col>

                    <!-- Protein -->
                    <v-col class="nutrition-item">
                      <v-icon color="#1C6EA4" size="28" class="mb-2">mdi-dumbbell</v-icon>
                      <div class="label">Protein</div>
                      <div class="value">{{ totalNutrition.protein }}g</div>
                    </v-col>

                    <!-- Fats -->
                    <v-col class="nutrition-item">
                      <v-icon color="#FFC107" size="28" class="mb-2">mdi-water-circle</v-icon>
                      <div class="label">Fats</div>
                      <div class="value">{{ totalNutrition.fats }}g</div>
                    </v-col>

                    <!-- Fiber -->
                    <v-col class="nutrition-item">
                      <v-icon color="#8C1007" size="28" class="mb-2">mdi-leaf</v-icon>
                      <div class="label">Fiber</div>
                      <div class="value">{{ totalNutrition.fiber }}g</div>
                    </v-col>
                  </v-row>
                </v-card>
              </v-col>
            </v-row>

            <!-- Ingredients -->
            <div v-if="selectedMeal.ingredients && selectedMeal.ingredients.length > 0" class="mb-6">
              <h3 class="text-h6 font-weight-bold mb-3 d-flex align-center"
                  style="color: #2C3E50; font-family: 'Syne', sans-serif;">
                <v-icon color="#5D8736" class="mr-2">mdi-format-list-bulleted</v-icon>
                Ingredients (Per Serving)
              </h3>
              
              <v-card class="pa-4" elevation="0" color="#F8FDF0" rounded="lg">
                <!-- Ingredient List -->
                <div 
                  v-for="(ingredient, index) in selectedMeal.ingredients"
                  :key="index"
                  class="ingredient-item mb-3 pb-3"
                  :class="{ 'border-bottom': index !== selectedMeal.ingredients.length - 1 }"
                >
                  <!-- Ingredient Name & Amount -->
                  <div class="d-flex justify-space-between align-center mb-2">
                    <div class="d-flex align-center">
                      <v-icon color="#A9C46C" size="small" class="mr-2">mdi-circle-small</v-icon>
                      <span class="text-body-1 font-weight-medium" style="color: #2C3E50; font-family: 'Syne', sans-serif;">
                        {{ typeof ingredient === 'string' ? ingredient : ingredient.name }}
                      </span>
                    </div>
                    
                    <span class="text-body-2 font-weight-bold" style="color: #5D8736; font-family: 'Syne', sans-serif;">
                      {{ typeof ingredient === 'object' ? `${ingredient.amount}${ingredient.unit}` : '100g' }}
                    </span>
                  </div>

                  <!-- Price Info -->
                  <div class="d-flex justify-space-between align-center ml-6">
                    <span class="text-caption" style="color: #7A7A7A; font-family: 'Syne', sans-serif;">
                      {{ typeof ingredient === 'object' ? ingredient.pricePerKg : '₱-- per kg' }}
                    </span>
                    
                    <div class="d-flex align-center">
                      <v-icon size="x-small" color="#5D8736" class="mr-1">mdi-arrow-right</v-icon>
                      <span class="text-body-2 font-weight-bold" style="color: #5D8736; font-family: 'Syne', sans-serif;">
                        ₱{{ typeof ingredient === 'object' ? ingredient.calculatedPrice.toFixed(2) : '0.00' }}
                      </span>
                    </div>
                  </div>
                </div>

                  <!-- Total Cost -->
                <v-divider class="my-3"></v-divider>
                <div class="d-flex justify-space-between align-center">
                  <span class="text-h6 font-weight-bold" style="color: #2C3E50; font-family: 'Syne', sans-serif;">
                    Ingredients Total:
                  </span>
                  <span class="text-h6 font-weight-bold" style="color: #5D8736; font-family: 'Syne', sans-serif;">
                    ₱{{ nutritionTotals.totalCost ? nutritionTotals.totalCost.toFixed(2) : '0.00' }}/serving
                  </span>
                </div>

                <!-- Before the Total -->
              <v-divider class="my-3"></v-divider>
              <div class="d-flex justify-space-between align-center mt-2">
                 <span class="text-h6 font-weight-bold" style="color: #2C3E50; font-family: 'Syne', sans-serif;"> Estimated Meal Cost:</span>
                <span class="text-h6 font-weight-bold" style="color:#5D8736; font-family: 'Syne', sans-serif;">
                  ₱{{ selectedMeal.estimated_cost_per_serving.toFixed(2) }}/serving
                </span>
              </div>


                <br>
            
            <v-alert 
              variant="tonal" 
              density="compact" 
              class="mb-3"
              color="#E8F5E9"
              rounded="lg"
            >
              <div class="d-flex">
                <v-icon color="#5D8736" size="small" class="mr-2 mt-1">mdi-information</v-icon>
                <p class="text-caption mb-0" style="font-family: 'Syne', sans-serif; color: #2C3E50;">
                  <strong style="color: #2C3E50;">Ingredient Cost Only:</strong> This total reflects raw ingredient 
                  prices. The estimated meal cost <strong>(₱{{ selectedMeal.estimated_cost_per_serving }})</strong>
                  includes preparation, cooking, and other expenses.
                </p>
              </div>
            </v-alert>

              </v-card>
            </div>

            <!-- Procedure -->
            <div v-if="selectedMeal.procedures && typeof selectedMeal.procedures === 'string' && formatProcedureSteps.length > 0">
              <h3 class="text-h6 font-weight-bold mb-3 d-flex align-center" style="color: #2C3E50; font-family: 'Syne', sans-serif;">
                  <v-icon color="#5D8736" class="mr-2">mdi-chef-hat</v-icon>
                  Procedure
                </h3>
                <br></br>

                <div 
                  v-for="(step, index) in formatProcedureSteps" 
                  :key="`step-${index}`"
                  class="mb-4 mt-1 last:mb-0"
                >
                  <div class="d-flex align-start">
                    <div 
                      class="mr-3 flex-shrink-0 d-flex align-center justify-center"
                      style="
                        min-width: 70px;
                        height: 36px; 
                        background: linear-gradient(135deg, #5D8736 0%, #4A6B2B 100%);
                        border-radius: 8px; 
                        color: white; 
                        font-size: 13px;
                        font-family: 'Syne', sans-serif;
                        padding: 0 12px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.15);
                      "
                    >
                      Step  {{ index + 1 }} :
                    </div>
                    
                    <p class="text-body-2 mb-0 flex-grow-1" style="line-height: 1.8; color: #2C3E50; font-family: 'Syne', sans-serif; margin-top: 4px;">
                      {{ step }}
                    </p>
                  </div>
                </div>
            </div>

            <!-- Handle array-based instructions -->
            <div v-else-if="selectedMeal.instructions && Array.isArray(selectedMeal.instructions)">
              <div
                v-for="(instruction, index) in selectedMeal.instructions"
                :key="`instruction-${index}`"
                class="mb-4 last:mb-0"
              >
                <div class="d-flex align-start">
                  <div 
                    class="mr-3 mt-1 flex-shrink-0 d-flex align-center justify-center"
                    style="
                      width: 32px; 
                      height: 32px; 
                      background: #5D8736; 
                      border-radius: 50%; 
                      color: white; 
                      font-weight: bold; 
                      font-size: 14px;
                      font-family: 'Syne', sans-serif;
                    "
                  >
                    {{ index + 1 }}
                  </div>
                  
                  <p class="text-body-2 mb-0 flex-grow-1" style="line-height: 1.6; color: #2C3E50; font-family: 'Syne', sans-serif;">
                    {{ instruction }}
                  </p>
                </div>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-dialog>
  </v-app>
</template>


<style scoped>
.text-body-2 {
  white-space: normal !important;
  word-wrap: break-word !important;
  overflow-wrap: break-word !important;
  text-overflow: clip !important;
  max-width: none !important;
}

/* Or more specifically target the procedure text */
.text-body-2.flex-grow-1 {
  overflow: visible !important;
  text-overflow: clip !important;
  white-space: normal !important;
  word-break: break-word !important;
}

.custom-alert {
  font-family: 'Syne', sans-serif !important;
}

.alert-message {
  font-family: 'Syne', sans-serif;
  font-weight: 500;
  line-height: 1.5;
  margin-left: -30px;
}

/* Ensure proper spacing on all devices */
@media (max-width: 599px) {
  .custom-alert {
    padding: 12px !important;
  }
  
  .alert-message {
    font-size: 14px;
  }
}

@media (min-width: 600px) {
  .alert-message {
    font-size: 16px;
  }
}

.meal-card-disabled {
  pointer-events: none;
}

.day-scroll {
  overflow-x: auto;
  padding: 15px 10px;
  display: flex;
  justify-content: center;
  border-radius: 12px;
}

.day-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
}

.day-btn {
  min-width: 140px;  
  padding: 14px 20px;
  border: 1px solid #A9C46C;
  font-size: 15px;
  transition: all 0.3s ease;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
  text-align: center;
  border-radius: 28px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  line-height: 1.4;
}

.day-btn:hover {
  background-color: #A9C46C !important;
  color: #fff !important;
  transform: scale(1.05);
}

/* For the two-line layout */
.day-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.3;
}

.day-label {
  font-weight: bold;
  text-transform: uppercase;
  font-size: 15px;
}

.day-date {
  font-size: 13px;
  text-transform: uppercase;
  color: #555;
}

/* Tablet */
@media (max-width: 768px) {
  .day-buttons {
    gap: 10px;
  }
  .day-btn {
    min-width: 85px;
    font-size: 14px;
    padding: 8px 14px;
  }
  .day-label {
    font-size: 13px;
  }
  .day-date {
    font-size: 12px;
  }
}

/* Mobile */
@media (max-width: 480px) {
  .day-buttons {
    flex-wrap: nowrap;
    overflow-x: auto;
    justify-content: flex-start;
    gap: 8px;
    padding-bottom: 8px;
    scrollbar-width: none; 
  }
  .day-buttons::-webkit-scrollbar {
    display: none; 
  }
  .day-btn {
    min-width: 75px;
    font-size: 13px;
    padding: 6px 12px;
    border-radius: 20px;
  }
  .day-label {
    font-size: 12px;
  }
  .day-date {
    font-size: 11px;
  }
}

/* Keep active button same size as others */
.day-btn,
.active-day-btn {
  min-width: 140px !important;
  padding: 14px 20px !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
  align-items: center !important;
  border-radius: 28px !important;
}

/* Active button style */
.active-day-btn {
  background-color: #A9C46C !important;
  color: #fff !important;
  border: 1px solid #A9C46C !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08) !important;
  transform: none !important; 
}


.meal-day-title {
  font-family: 'Syne', sans-serif;
  font-size: 35px;
  font-weight: 300; 
}

.meal-day-date {
  font-family: 'Syne', sans-serif;
  font-size: 20px;  
  color: #666; 
}

.meal-card {
  transition: transform 0.2s;
  background-color: #fff;
  border: 1px solid rgba(169, 196, 108, 0.2);
  width: 100%;
  min-width: 220px;
  max-width: 280px;
  height: auto;
  min-height: 280px;
}

/* Very small phones (320px - 360px) */
@media (max-width: 360px) {
  .meal-card {
    min-width: 200px;
    max-width: 240px;
    min-height: 260px;
  }
}

/* Small phones (361px - 480px) */
@media (min-width: 361px) and (max-width: 480px) {
  .meal-card {
    min-width: 220px;
    max-width: 260px;
    min-height: 280px;
  }
}

/* Larger phones and small tablets (481px - 768px) */
@media (min-width: 481px) and (max-width: 768px) {
  .meal-card {
    min-width: 240px;
    max-width: 270px;
    min-height: 300px;
  }
}

/* Tablets and up (769px+) */
@media (min-width: 769px) {
  .meal-card {
    min-width: 260px;
    max-width: 280px;
    min-height: 320px;
  }
}


.meal-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
}

.meal-name-container {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 8px;
}

/* Very small phones */
@media (max-width: 360px) {
  .meal-name-container {
    min-height: 44px;
  }
  
  .meal-name-container .font-weight-bold {
    font-size: 1.1rem !important;
  }
}

/* Small to medium phones */
@media (min-width: 361px) and (max-width: 480px) {
  .meal-name-container {
    min-height: 48px;
  }
  
  .meal-name-container .font-weight-bold {
    font-size: 1.2rem !important;
  }
}

.info-section {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  min-height: 70px;
  padding: 0 4px;
}

/* Very small phones */
@media (max-width: 370px) {
  .info-section {
    min-height: 65px;
  }
  
  .info-section .text-body-2 {
    font-size: 0.8rem !important;
  }
}

/* Small to medium phones */
@media (min-width: 361px) and (max-width: 480px) {
  .info-section {
    min-height: 70px;
  }
}

/* Tablets */
@media (min-width: 481px) and (max-width: 768px) {
  .info-section {
    min-height: 75px;
  }
}

/* Desktop and up */
@media (min-width: 769px) {
  .info-section {
    min-height: 80px;
  }
}

.v-slide-group__container {
  display: flex;
  gap: 8px;
}

/* Ensure proper spacing for slide group items */
.v-slide-group-item {
  flex-shrink: 0;
}

/* Adjust meal card margins within slide group */
.v-slide-group .meal-card {
  margin: 8px !important;
}

/* Very small phones - reduce card size and spacing */
@media (max-width: 360px) {
  .v-slide-group__container {
    gap: 6px;
  }
  
  .v-slide-group .meal-card {
    margin: 4px !important;
    min-width: 180px !important;
    max-width: 200px !important;
  }
}

/* Small phones - optimize spacing */
@media (min-width: 361px) and (max-width: 480px) {
  .v-slide-group__container {
    gap: 8px;
  }
  
  .v-slide-group .meal-card {
    margin: 6px !important;
    min-width: 200px !important;
    max-width: 230px !important;
  }
}

/* Tablets - better spacing */
@media (min-width: 481px) and (max-width: 768px) {
  .v-slide-group__container {
    gap: 10px;
  }
  
  .v-slide-group .meal-card {
    margin: 8px !important;
  }
}

/* Ensure arrows don't overlap cards */
.v-slide-group__prev,
.v-slide-group__next {
  flex-shrink: 0 !important;
  margin: 0 4px !important;
}

@media (max-width: 480px) {
  .v-slide-group__prev,
  .v-slide-group__next {
    min-width: 40px !important;
    margin: 0 2px !important;
  }
}

/* start nav bar */
.nav-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  height: auto;
  min-height: 56px;
  padding: 4px 0;
}

.icon-wrapper {  
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;   
  height: 32px;
  border-radius: 50%;
  transition: all 0.2s ease;
}

.icon-wrapper.active {
  background-color: white;
  color: #5B913B;
}

.nav-bar .v-btn {
  flex-direction: column;
  color: white;
  font-family: 'Syne', sans-serif;
  transition: transform 0.15s ease, background-color 0.15s ease;
  min-width: 64px;
  padding: 8px 12px;
  height: auto;
}

.nav-bar .v-btn:hover {
  background-color: rgba(255, 255, 255, 0.08);
}

.nav-bar .v-btn:active {
  transform: scale(0.96);
}

.nav-bar .v-icon {
  font-size: 24px;
}

.nav-bar span { 
  font-size: 11px;
  margin-top: 4px;
  white-space: nowrap;
}

/* Mobile responsive nav */
@media (max-width: 360px) {
  .nav-bar {
    min-height: 52px;
    padding: 2px 0;
  }
  
  .nav-bar .v-btn {
    min-width: 56px;
    padding: 6px 8px;
  }
  
  .icon-wrapper {
    width: 28px;
    height: 28px;
  }
  
  .nav-bar .v-icon {
    font-size: 20px;
  }
  
  .nav-bar span {
    font-size: 10px;
    margin-top: 2px;
  }
}

@media (min-width: 361px) and (max-width: 480px) {
  .nav-bar {
    min-height: 56px;
  }
  
  .nav-bar .v-btn {
    min-width: 60px;
    padding: 6px 10px;
  }
  
  .icon-wrapper {
    width: 30px;
    height: 30px;
  }
  
  .nav-bar .v-icon {
    font-size: 22px;
  }
  
  .nav-bar span {
    font-size: 10px;
  }
}

@media (min-width: 481px) {
  .nav-bar {
    min-height: 60px;
  }
  
  .nav-bar .v-btn {
    padding: 8px 16px;
  }
  
  .nav-bar span {
    font-size: 12px;
  }
}
/* end nav bar */

/* RoboLoading Start */
.loading-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

/* Small responsive video sizing */
@media (max-width: 480px) {
  /* Mobile phones */
  .loading-video {
    width: 250px;
    height: 250px;
  }
}

@media (min-width: 481px) and (max-width: 768px) {
  /* Tablets */
  .loading-video {
    width: 250px;
    height: 250px;
  }
}

@media (min-width: 769px) {
  /* Desktop and up */
  .loading-video {
    width: 300px;
    height: 300px;
  }
}

.video-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 90px;
}

.video-fallback .pot {
  position: relative;
  width: 40px;
  height: 30px;
  background: #A9C46C;
  border-radius: 0 0 10px 10px;
  overflow: hidden;
  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
}

.video-fallback .lid {
  position: absolute;
  top: -10px;
  left: 0;
  width: 40px;
  height: 10px;
  background: #7a9b40;
  border-radius: 5px 5px 0 0;
}

.video-fallback .bubble {
  position: absolute;
  bottom: 2px;
  left: 50%;
  width: 6px;
  height: 6px;
  margin-left: -3px;
  background: #fff;
  border-radius: 50%;
  opacity: 0.7;
  animation: bubble 1.5s infinite ease-in-out;
}

.video-fallback .bubble:nth-child(1) {
  animation-delay: 0s;
  left: 25%;
}

.video-fallback .bubble:nth-child(2) {
  animation-delay: 0.4s;
  left: 50%;
}

.video-fallback .bubble:nth-child(3) {
  animation-delay: 0.8s;
  left: 75%;
}

.video-container:hover {
  transform: scale(1.05);
  transition: transform 0.3s ease;
}

.loading-wrapper p {
  max-width: 90%;
  text-align: center;
  line-height: 1.3;
  margin-top: 10px !important;
}

@media (max-width: 480px) {
  .loading-wrapper p {
    font-size: 16px !important;
  }
}

.loading-wrapper {
  animation: fadeIn 0.4s ease-in-out;
}

@keyframes fadeIn {
  from { 
    opacity: 0; 
    transform: translateY(10px); 
  }
  to { 
    opacity: 1; 
    transform: translateY(0); 
  }
}


.nutrition-card {
  font-family: 'Syne', sans-serif;
}

.nutrition-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  text-align: center;
}

.nutrition-item {
  flex: 1 1 50%; 
  max-width: 50%;
  padding: 10px;
}

.nutrition-item .label {
  font-size: 1rem;
  color: #666;
  margin-bottom: 4px;
}

.nutrition-item .value {
  font-weight: 300;
  color: #2C3E50;
  font-size: 1.1rem;
}

/* Desktop */
@media (min-width: 768px) {
  .nutrition-item {
    flex: 1 1 20%; 
    max-width: 20%;
  }
}


.ingredient-item {
  transition: all 0.2s ease;
}

.ingredient-item:hover {
  background-color: rgba(169, 196, 108, 0.1);
  border-radius: 8px;
  padding: 8px;
  margin-left: -8px;
  margin-right: -8px;
}

.border-bottom {
  border-bottom: 1px solid #E0E0E0;
}
/* RoboLoading End */
</style>