<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabase } from '@/utils/supabase'

// API base URL - change this for production
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// Generate day labels with actual dates
const generateDaysWithDates = () => {
  const days = []
  const today = new Date()
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(today)
    date.setDate(today.getDate() + i)
    const dateStr = date.toISOString().split('T')[0]
    const dayLabel = `Day ${i + 1}`
    days.push({ label: dayLabel, date: dateStr })
  }
  
  return days
}

const daysWithDates = ref(generateDaysWithDates())
const selectedDayIndex = ref(0)
const selectedDay = computed(() => daysWithDates.value[selectedDayIndex.value])

const loading = ref(false)
const errorMsg = ref('')
const mealPlansByDay = ref({})
const isExistingPlan = ref(false)

// Get meals for selected day
const currentDayMeals = computed(() => {
  const dateStr = selectedDay.value?.date
  if (!dateStr || !mealPlansByDay.value[dateStr]) {
    return { breakfast: [], lunch: [], dinner: [] }
  }
  return mealPlansByDay.value[dateStr]
})

// Fetch or generate meal plan
const fetchMealPlan = async (forceRegenerate = false) => {
  loading.value = true
  errorMsg.value = ''

  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw new Error('User not authenticated')

    // Fetch user row to get its id
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
      const getResp = await fetch(`${API_BASE_URL}/api/getMealPlan/${userRow.id}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
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

    // Generate new meal plan
    const resp = await fetch(`${API_BASE_URL}/api/generateMealPlan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        user_id: userRow.id,
        force_regenerate: forceRegenerate 
      })
    })

    if (!resp.ok) {
      console.error('Response status:', resp.status)
      const text = await resp.text()
      console.error('Response text:', text)
      
      try {
        const errorJson = JSON.parse(text)
        throw new Error(errorJson.error || `Server error: ${resp.status}`)
      } catch {
        throw new Error(`Server error: ${resp.status}`)
      }
    }

    const json = await resp.json()
    console.log('API response:', json)

    if (!json.success) {
      throw new Error(json.error || 'Failed to generate meal plan')
    }

    mealPlansByDay.value = json.mealPlansByDay || {}
    isExistingPlan.value = json.isExisting || false
    
    console.log('Meal plans loaded successfully:', mealPlansByDay.value)
  } catch (err) {
    console.error('Error fetching meal plan:', err)
    errorMsg.value = err.message || 'Something went wrong'
  } finally {
    loading.value = false
  }
}

// Test API connection
async function testAPIConnection() {
  try {
    console.log("Testing API at:", `${API_BASE_URL}/api/health`)
    const response = await fetch(`${API_BASE_URL}/api/health`)
    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`)
    }
    const data = await response.json()
    console.log("API Health Check:", data)
  } catch (error) {
    console.error("Cannot connect to API server:", error)
    errorMsg.value = "Cannot connect to API server. Please ensure the server is running."
  }
}

onMounted(async () => {
  await testAPIConnection()
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

const viewMeal = (meal) => {
  // You could navigate to a detailed meal view or show a dialog
  const details = [
    `Name: ${meal.name}`,
    `Time: ${meal.preparation_time || 'N/A'}`,
    `Calories: ${typeof meal.calories === 'number' ? `${meal.calories} kcal` : 'N/A'}`,
    `\nIngredients:`,
    ...(meal.ingredients || []).map(ing => `  • ${ing}`),
    `\nProcedure:`,
    meal.procedures || 'N/A'
  ].join('\n')
  
  // For now using alert, but you should implement a proper modal/dialog
  alert(details)
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

// Get meal image placeholder (you can customize this)
const getMealImage = (meal, mealType) => {
  // You could generate different placeholders based on meal type or name
  const images = {
    breakfast: 'https://via.placeholder.com/280x180/FFF3E0/FF9800?text=Breakfast',
    lunch: 'https://via.placeholder.com/280x180/E8F5E9/4CAF50?text=Lunch',
    dinner: 'https://via.placeholder.com/280x180/F3E5F5/9C27B0?text=Dinner'
  }
  return images[mealType] || 'https://via.placeholder.com/280x180'
}
</script>

<template>
  <v-app>
    <!-- Top App Bar -->
    <v-app-bar flat color="#A9C46C">
      <v-btn icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="text-white">Weekly Menu</v-toolbar-title>
      <v-spacer></v-spacer>
      <v-chip 
        v-if="isExistingPlan" 
        size="small" 
        color="white"
        class="mr-2"
      >
        <v-icon start size="small">mdi-check-circle</v-icon>
        Saved Plan
      </v-chip>
      <v-btn
        icon
        @click="regenerateMealPlan"
        :loading="loading"
        title="Generate new meal plan"
      >
        <v-icon>mdi-refresh</v-icon>
      </v-btn>
    </v-app-bar>

    <br><br><br><br>

    <!-- Day Selector -->
    <div class="day-scroll">
      <div class="day-buttons">
        <v-btn
          v-for="(day, index) in daysWithDates"
          :key="day.date"
          :color="selectedDayIndex === index ? '#A9C46C' : 'white'"
          :class="selectedDayIndex === index ? 'text-white' : 'text-black'"
          rounded
          @click="selectedDayIndex = index"
          style="min-width: 90px; border: 1px solid #A9C46C; flex-shrink: 0;"
          class="ma-1"
        >
          <div class="d-flex flex-column">
            <span class="text-caption">{{ day.label }}</span>
            <span class="text-caption" style="font-size: 10px;">{{ formatDate(day.date) }}</span>
          </div>
        </v-btn>
      </div>
      <br>
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

      <!-- Loading State -->
      <div v-if="loading" class="text-center py-8">
        <v-progress-circular
          indeterminate
          color="#A9C46C"
          size="64"
        />
        <p class="mt-4 text-grey">Preparing your personalized meal plan...</p>
      </div>

      <!-- Meal Sections -->
      <template v-if="!loading && !errorMsg">
        <!-- Date Header -->
        <v-card
          class="mb-4 text-center"
          flat
          color="transparent"
        >
          <v-card-text>
            <h2 class="text-h5 font-weight-bold">{{ selectedDay.label }}</h2>
            <p class="text-subtitle-2 text-grey">{{ formatDate(selectedDay.date) }}</p>
          </v-card-text>
        </v-card>

        <!-- Meal Type Sections -->
        <v-card
          v-for="sec in sections"
          :key="sec.key"
          class="pa-4 my-6"
          rounded="lg"
          elevation="0"
          style="background-color: #E8F5C8;"
        >
          <div class="d-flex align-center justify-center mb-3">
            <v-icon :icon="sec.icon" class="mr-2" />
            <h3 class="font-weight-bold">{{ sec.title }}</h3>
          </div>

          <!-- Meals Carousel -->
          <v-slide-group
            v-if="currentDayMeals[sec.key]?.length > 0"
            show-arrows
            class="px-2"
          >
            <v-slide-group-item
              v-for="(meal, idx) in currentDayMeals[sec.key]"
              :key="`${selectedDay.date}-${sec.key}-${idx}`"
            >
              <v-card
                class="ma-3 pa-4 d-flex flex-column align-center meal-card"
                max-width="280"
                rounded="lg"
                elevation="2"
                hover
              >
                <v-img
                  :src="getMealImage(meal, sec.key)"
                  width="100%"
                  height="180"
                  cover
                  class="rounded-lg mb-3"
                />
                <div class="text-center flex-grow-1 d-flex flex-column">
                  <div class="font-weight-bold mb-1">{{ meal.name }}</div>
                  <v-chip size="small" color="#A9C46C" class="mb-2 text-white">
                    Option {{ idx + 1 }}
                  </v-chip>
                  <div class="text-caption text-grey-darken-1 mb-1">
                    <v-icon size="x-small">mdi-clock-outline</v-icon>
                    {{ meal.preparation_time || 'Quick' }}
                  </div>
                  <div class="text-caption text-grey-darken-1 mb-2">
                    <v-icon size="x-small">mdi-fire</v-icon>
                    {{ typeof meal.calories === 'number' ? meal.calories + ' kcal' : 'N/A' }}
                  </div>
                  <v-spacer />
                  <v-btn
                    color="#5D8736"
                    rounded
                    size="small"
                    class="mt-2 text-white"
                    @click="viewMeal(meal)"
                  >
                    View Details
                    <v-icon end size="small">mdi-chevron-right</v-icon>
                  </v-btn>
                </div>
              </v-card>
            </v-slide-group-item>
          </v-slide-group>

          <!-- Empty State -->
          <div v-else class="text-center py-6">
            <v-icon size="48" color="grey-lighten-1">mdi-food-off</v-icon>
            <p class="mt-2 text-grey">No {{ sec.title.toLowerCase() }} options available for this day.</p>
          </div>
        </v-card>
      </template>

      <br><br>
    </v-container>

    <!-- Bottom Navigation -->
    <v-bottom-navigation grow class="mt-8 nav-bar" style="background-color: #5B913B;">
      <v-btn @click="$router.push('/home')" class="nav-tab">
        <v-icon>mdi-home</v-icon><span>Home</span>
      </v-btn>

      <v-btn @click="$router.push('/meal-plan')" class="nav-tab">
        <v-icon>mdi-heart-pulse</v-icon><span>Meal Plan</span>
      </v-btn>

      <v-btn @click="$router.push('/profile')" class="nav-tab">
        <v-icon>mdi-account</v-icon><span>Profile</span>
      </v-btn>

      <v-btn @click="$router.push('/myprogress')" class="nav-tab">
        <v-icon>mdi-chart-line</v-icon><span>Progress</span>
      </v-btn>
    </v-bottom-navigation>
  </v-app>
</template>

<style scoped>
.day-scroll {
  padding: 0 16px;
  overflow-x: auto;
  white-space: nowrap;
}

.day-buttons {
  display: inline-flex;
  gap: 8px;
  padding: 8px 0;
}

.meal-card {
  transition: transform 0.2s;
}

.meal-card:hover {
  transform: translateY(-4px);
}

.nav-tab {
  display: flex;
  flex-direction: column;
  color: white !important;
}

.nav-tab span {
  font-size: 10px;
  margin-top: 2px;
}
</style>