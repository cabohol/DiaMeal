<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { supabase } from '@/utils/supabase'

// API base URL - change this for production
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://meal-plan-api-gamma.vercel.app'


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

const daysWithDates = ref([])
const selectedDayIndex = ref(0)
const selectedDay = computed(() => {
  if (!daysWithDates.value || daysWithDates.value.length === 0) {
    return { label: 'Loading...', date: new Date().toISOString().split('T')[0] }
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
      'Accept': 'application/json',
      ...options.headers
    }
  }
  
  console.log('Making request to:', url)
  
  try {
    // For development, you might want to add a timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout
    
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    console.log('Response status:', response.status)
    console.log('Response headers:', Object.fromEntries(response.headers.entries()))
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Error response:', errorText)
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`)
    }
    
    return response
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - API took too long to respond')
    }
    console.error('Fetch error for URL:', url, 'Error:', error)
    throw error
  }
}

// Function to calculate nutrition when meal changes
const calculateNutrition = async () => {
  console.log('calculateNutrition called')
  
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
    if (Array.isArray(ingredients) && typeof ingredients[0] === 'string') {
      console.log('Fetching nutrition for ingredients:', ingredients)
      
      const { data: nutritionData, error } = await supabase
        .from('ingredients')
        .select(`
          name,
          calories_per_serving,
          carbs_grams,
          protein_grams,
          fat_grams,
          fiber_grams
        `)
        .in('name', ingredients)

      if (error) {
        console.error('Error fetching ingredients:', error)
        return
      }

      console.log('Nutrition data from Supabase:', nutritionData)

      // Calculate totals
      const totals = nutritionData.reduce((acc, ingredient) => {
        const calories = parseFloat(ingredient.calories_per_serving) || 0
        const carbs = parseFloat(ingredient.carbs_grams) || 0
        const protein = parseFloat(ingredient.protein_grams) || 0
        const fats = parseFloat(ingredient.fat_grams) || 0
        const fiber = parseFloat(ingredient.fiber_grams) || 0

        console.log(`${ingredient.name}: Calories: ${calories}, Carbs: ${carbs}, Protein: ${protein}, Fats: ${fats}, Fiber: ${fiber}`)

        return {
          calories: acc.calories + calories,
          carbs: acc.carbs + carbs,
          protein: acc.protein + protein,
          fats: acc.fats + fats,
          fiber: acc.fiber + fiber
        }
      }, {
        calories: 0,
        carbs: 0,
        protein: 0,
        fats: 0,
        fiber: 0
      })

      console.log('Calculated totals:', totals)

      nutritionTotals.value = {
        calories: Math.round(totals.calories),
        carbs: Math.round(totals.carbs * 10) / 10,
        protein: Math.round(totals.protein * 10) / 10,
        fats: Math.round(totals.fats * 10) / 10,
        fiber: Math.round(totals.fiber * 10) / 10
      }
    }
    // If ingredients already have nutrition data
    else if (Array.isArray(ingredients) && typeof ingredients[0] === 'object') {
      console.log('Processing ingredients with nutrition data')
      
      const totals = ingredients.reduce((acc, ingredient) => {
        return {
          calories: acc.calories + (parseFloat(ingredient.calories_per_serving) || 0),
          carbs: acc.carbs + (parseFloat(ingredient.carbs_grams) || 0),
          protein: acc.protein + (parseFloat(ingredient.protein_grams) || 0),
          fats: acc.fats + (parseFloat(ingredient.fat_grams || ingredient.fats_grams) || 0),
          fiber: acc.fiber + (parseFloat(ingredient.fiber_grams) || 0)
        }
      }, {
        calories: 0,
        carbs: 0,
        protein: 0,
        fats: 0,
        fiber: 0
      })

      nutritionTotals.value = {
        calories: Math.round(totals.calories),
        carbs: Math.round(totals.carbs * 10) / 10,
        protein: Math.round(totals.protein * 10) / 10,
        fats: Math.round(totals.fats * 10) / 10,
        fiber: Math.round(totals.fiber * 10) / 10
      }
    }
  } catch (err) {
    console.error('Error calculating nutrition:', err)
  }
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


// Fetch user's last_submission_date
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
      
      // Calculate which day should be selected based on today's date
      const today = new Date().toISOString().split('T')[0]
      const todayIndex = generatedDays.findIndex(day => day.date === today)
      
      // If today matches one of the generated days, select it; otherwise default to Day 1
      selectedDayIndex.value = todayIndex >= 0 ? todayIndex : 0
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

// Add this before your existing fetchMealPlan try block
console.log('Environment check:', {
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
      .single()
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
    console.log('🚀 Making API request with body:', JSON.stringify(requestBody, null, 2))
    console.log('🌐 API URL:', `${API_BASE_URL}/api/generateMealPlan`)

    // Generate new meal plan
    const resp = await fetchWithCors(`${API_BASE_URL}/api/generateMealPlan`, {
      method: 'POST',
      body: JSON.stringify(requestBody)
    })

    console.log('📡 Response received - Status:', resp.status)
    console.log('📡 Response headers:', Object.fromEntries(resp.headers.entries()))

    if (!resp.ok) {
      const text = await resp.text()
      console.error('❌ Error response body:', text)
      
      try {
        const errorJson = JSON.parse(text)
        console.error('❌ Parsed error:', errorJson)
        throw new Error(errorJson.error || `Server error: ${resp.status}`)
      } catch (parseError) {
        console.error('❌ Failed to parse error response:', parseError)
        throw new Error(`Server error: ${resp.status} - ${text}`)
      }
    }

    const json = await resp.json()
    console.log('✅ Success response:', JSON.stringify(json, null, 2))

    // Validate the response structure
    if (!json.success) {
      throw new Error(json.error || 'Failed to generate meal plan')
    }

    // Check if mealPlansByDay has the expected structure
    if (json.mealPlansByDay) {
      console.log('📋 Meal plans structure check:')
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
    
    console.log('✅ Meal plans loaded successfully')
  } catch (err) {
    console.error('💥 Error in fetchMealPlan:', err)
    console.error('💥 Error stack:', err.stack)
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

// Single onMounted function that handles everything
onMounted(async () => {
  console.log('Initializing WeeklyMeal component...')
  
  // Optional health check
  const healthOk = await testAPIConnection()
  if (healthOk) {
    console.log('API health check passed')
  } else {
    console.log('API health check failed, but continuing with meal plan fetch')
  }
  
  // Always try to fetch meal plan regardless of health check
  await fetchUserStartDate()
  if (!errorMsg.value) {
    await fetchMealPlan()
  }
})

const goBack = () => window.history.back()

const sections = computed(() => ([
  { key: 'breakfast', title: 'BREAKFAST', icon: 'mdi-coffee' },
  { key: 'lunch', title: 'LUNCH', icon: 'mdi-food' },
  { key: 'dinner', title: 'DINNER', icon: 'mdi-silverware-fork-knife' }
]))

// Updated Modal functions to include nutrition calculation
const viewMeal = async (meal) => {
  selectedMeal.value = meal
  selectedMealType.value = getCurrentMealType(meal)
  await calculateNutrition() // Calculate nutrition data
  mealDetailsDialog.value = true
}


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
</script>

<template>
  <v-app>
    <!-- Top App Bar -->
    <v-app-bar flat color="#A9C46C">
      <v-btn icon @click="goBack">
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
                  class="meal-card pa-4 pa-sm-5 d-flex flex-column"
                  :class="{
                    'ma-1': $vuetify.display.xs,
                    'ma-2': $vuetify.display.sm,
                    'ma-3': $vuetify.display.mdAndUp
                  }"
                  :width="$vuetify.display.xs ? 240 : $vuetify.display.sm ? 260 : 280"
                  :height="$vuetify.display.xs ? 280 : $vuetify.display.sm ? 300 : 320"
                  rounded="lg"
                  elevation="2"
                  hover
                  style="font-family: 'Syne', sans-serif;"
                >
                  <!-- Card body with better spacing -->
                  <div class="d-flex flex-column h-100">
                    <!-- Meal name with consistent height -->
                    <div class="meal-name-container mb-3">
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
                        class="text-white"
                        :disabled="new Date(selectedDay.date) > new Date()"
                        @click="viewMeal(meal)"
                        style="font-family: 'Syne', sans-serif;"
                      >
                        <span class="text-body-2 text-sm-body-1 font-weight-medium" style="font-family: 'Syne', sans-serif;">View Details</span>
                        <v-icon end :size="$vuetify.display.xs ? 'small' : 'default'">mdi-chevron-right</v-icon>
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
                    Ingredients
                  </h3>
                  <v-card class="pa-4" elevation="0" color="#F8FDF0" rounded="lg">
                    <v-row>
                      <v-col
                        v-for="(ingredient, index) in selectedMeal.ingredients"
                        :key="index"
                        cols="12"
                        sm="6"
                      >
                        <div class="d-flex justify-space-between align-center mb-2">
                          <!-- Ingredient name -->
                          <div class="d-flex align-center">
                            <v-icon color="#A9C46C" size="small" class="mr-3">mdi-circle-small</v-icon>
                            <span class="text-body-2" style="color: #2C3E50; font-family: 'Syne', sans-serif;">
                              {{ typeof ingredient === 'string' ? ingredient : ingredient.name }}
                            </span>
                          </div>

                          <!-- Ingredient price placeholder data -->
                          <span class="text-body-2 font-weight-bold" style="color: #5D8736; font-family: 'Syne', sans-serif;">
                            {{ ingredient.price ? '₱' + ingredient.price : '₱ --' }}
                          </span>
                        </div>
                      </v-col>
                    </v-row>
                  </v-card>
                </div>

                <!-- Instructions (Procedure) -->
                <div v-if="selectedMeal.procedures || (selectedMeal.instructions && selectedMeal.instructions.length > 0)" class="mb-6">
                  <h3 class="text-h6 font-weight-bold mb-3 d-flex align-center" style="color: #2C3E50; font-family: 'Syne', sans-serif;">
                    <v-icon color="#5D8736" class="mr-2">mdi-chef-hat</v-icon>
                    Procedure
                  </h3>
                  <v-card class="pa-4" elevation="0" color="#F8FDF0"rounded="lg">
                    <!-- Handle string-based procedures -->
                    <div v-if="selectedMeal.procedures && typeof selectedMeal.procedures === 'string'">
                      <p class="text-body-1 mb-0" style="line-height: 1.6; color: #2C3E50; font-family: 'Syne', sans-serif;">
                        {{ selectedMeal.procedures }}
                      </p>
                    </div>
                    <!-- Handle array-based instructions -->
                    <div v-else-if="selectedMeal.instructions && Array.isArray(selectedMeal.instructions)">
                      <div
                        v-for="(instruction, index) in selectedMeal.instructions"
                        :key="index"
                        class="mb-3"
                      >
                        <div class="d-flex align-start">
                          <v-chip
                            color="#A9C46C"
                            size="small"
                            class="mr-3 mt-1 text-white font-weight-bold"
                            style="min-width: 28px; font-family: 'Syne', sans-serif;"
                          >
                            {{ index + 1 }}
                          </v-chip>
                          <p class="text-body-2 mb-0 flex-grow-1" style="line-height: 1.6; color: #2C3E50; font-family: 'Syne', sans-serif;">
                            {{ instruction }}
                          </p>
                        </div>
                      </div>
                    </div>
                  </v-card>
                </div>
              </v-card-text>
            </v-card>
          </v-dialog>
    </v-app>
</template>



<style scoped>
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
}

.meal-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
}

.meal-name-container {
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.info-section {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  min-height: 80px;
}

@media (max-width: 480px) {
  .meal-name-container {
    min-height: 50px;
  }
  
  .info-section {
    min-height: 70px;
  }
}

@media (min-width: 481px) and (max-width: 768px) {
  .meal-name-container {
    min-height: 55px;
  }
  
  .info-section {
    min-height: 75px;
  }
}

.v-slide-group__prev,
.v-slide-group__next {
  min-width: 48px !important;
  background: rgba(169, 196, 108, 0.9) !important;
  color: white !important;
  border-radius: 50% !important;
}

.v-slide-group__prev:hover,
.v-slide-group__next:hover {
  background: rgba(169, 196, 108, 1) !important;
}

/* start nav bar */
.icon-wrapper {  
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;   
  height: 30px;
  border-radius: 50%;
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
  font-size: 12px;
  margin-top: 4px;
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
/* RoboLoading End */
</style>