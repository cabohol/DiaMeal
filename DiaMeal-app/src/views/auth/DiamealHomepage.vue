<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabase } from '@/utils/supabase'
import { useRouter } from 'vue-router'
import H1 from "@/assets/h1.jpg"
import H2 from "@/assets/h2.jpg"
import H3 from "@/assets/h3.jpg"
import H4 from "@/assets/h4.jpg"
import H5 from "@/assets/h5.jpg"

const router = useRouter()
const userFirstName = ref('')

// Enhanced progress functionality - same as Progress page
const currentUserId = ref(null)
const dbCompletedMeals = ref([])
const dbProgressData = ref(null)
const calculatedTotalCalories = ref(0)
const userLastSubmissionDate = ref(null)
const currentDayInSequence = ref(1)
const generatedDays = ref([])

// Helper function to get local date string (YYYY-MM-DD format) - same as WeeklyMeal and Progress
const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Generate day labels with actual dates based on user's last_submission_date
const generateDaysWithDates = (startDate) => {
  const days = [];
  const baseDate = new Date(startDate);
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    const dayLabel = `Day ${i + 1}`;
    days.push({ label: dayLabel, date: dateStr, dayNumber: i + 1 });
  }
  
  return days;
};

// Calculate which day should be selected based on today - same logic as WeeklyMeal and Progress
const calculateSelectedDay = () => {
  if (!userLastSubmissionDate.value) return 1;
  
  const todayLocal = getLocalDateString();
  const todayIndex = generatedDays.value.findIndex(day => day.date === todayLocal);
  
  console.log('Homepage - Today (local):', todayLocal);
  console.log('Homepage - Generated days:', generatedDays.value.map(d => d.date));
  console.log('Homepage - Today index found:', todayIndex);
  
  return todayIndex >= 0 ? todayIndex + 1 : 1;
};

// Fetch user's last submission date and generate days
const fetchUserData = async () => {
  if (!currentUserId.value) return;
  
  try {
    const { data: userData, error } = await supabase
      .from('users')
      .select('last_submission_date')
      .eq('id', currentUserId.value)
      .single();

    if (error) {
      console.error('Homepage - Error fetching user data:', error);
      return;
    }

    userLastSubmissionDate.value = userData.last_submission_date;
    
    if (userData.last_submission_date) {
      generatedDays.value = generateDaysWithDates(userData.last_submission_date);
      currentDayInSequence.value = calculateSelectedDay();
    } else {
      const today = getLocalDateString();
      generatedDays.value = generateDaysWithDates(today);
      currentDayInSequence.value = 1;
    }
    
    console.log('Homepage - User last submission date:', userData.last_submission_date);
    console.log('Homepage - Generated days:', generatedDays.value);
    console.log('Homepage - Current day in sequence:', currentDayInSequence.value);
    
  } catch (err) {
    console.error('Homepage - Error fetching user data:', err);
  }
};

// Get the date for the current selected day
const getCurrentSelectedDate = () => {
  if (!generatedDays.value.length || !currentDayInSequence.value) {
    return getLocalDateString();
  }
  
  const selectedDay = generatedDays.value.find(day => day.dayNumber === currentDayInSequence.value);
  return selectedDay ? selectedDay.date : getLocalDateString();
};

// Fetch completed meals from Supabase - get calories from meals table
// Fetch completed meals from Supabase - get calories from meals table OR ingredients table
// Fixed fetchCompletedMeals for MyProgress.vue
const fetchCompletedMeals = async () => {
  if (!currentUserId.value) return;
  
  const selectedDate = getCurrentSelectedDate();
  
  try {
    console.log('Fetching completed meals for user:', currentUserId.value, 'date:', selectedDate);
    
    // Query ONLY the columns that exist in your meals table
    const { data: completedMeals, error } = await supabase
      .from('completed_meals')
      .select(`
        *,
        meals (
          calories,
          name
        )
      `)
      .eq('user_id', currentUserId.value)
      .eq('meal_date', selectedDate);

    if (error) {
      console.error('Error fetching completed meals:', error);
      return;
    }

    // Process the meals
    const processedMeals = await Promise.all(completedMeals?.map(async (meal) => {
      let calories = 0;
      let mealName = meal.meal_name || 'Unknown Meal';

      // First, check if we have data from meals table
      if (meal.meals && meal.meals.calories) {
        calories = meal.meals.calories;
        mealName = meal.meals.name || meal.meal_name || 'Unknown Meal';
      } else {
        // Final fallback to stored calories in completed_meals table
        calories = meal.calories || 0;
        console.log(`Using stored calories from completed_meals: ${calories}`);
      }

      return {
        ...meal,
        calories: calories,
        meal_name: mealName
      };
    }) || []);

    dbCompletedMeals.value = processedMeals;
    console.log('Fetched completed meals with accurate calories:', processedMeals);
    
    // Calculate total calories
    let totalCalories = 0;
    if (processedMeals && processedMeals.length > 0) {
      totalCalories = processedMeals.reduce((sum, meal) => {
        const mealCalories = meal.calories || 0;
        console.log(`Meal: ${meal.meal_name}, Calories: ${mealCalories}`);
        return sum + mealCalories;
      }, 0);
      
      console.log('Total calories from meals:', totalCalories);
    }
    
    // Update calculated calories
    calculatedTotalCalories.value = totalCalories;
    
    // Count unique meal types completed
    const completedMealTypes = new Set();
    dbCompletedMeals.value.forEach(meal => {
      if (meal.meal_type) {
        completedMealTypes.add(meal.meal_type.toLowerCase());
      }
    });
    
    console.log('Completed meal types:', Array.from(completedMealTypes));
    console.log('Total completed meals count:', completedMealTypes.size);
    
    await updateProgressInDB(totalCalories, completedMealTypes.size);
    
  } catch (err) {
    // console.error('Error fetching completed meals:', err);
  }
};

// Fetch progress data using the calculated day number
const fetchProgressFromDB = async () => {
  if (!currentUserId.value || !currentDayInSequence.value) return;
  
  try {
    console.log('Homepage - Fetching progress for user:', currentUserId.value, 'day:', currentDayInSequence.value);
    
    const { data: progressData, error } = await supabase
      .from('progress')
      .select('*')
      .eq('user_id', parseInt(currentUserId.value))
      .eq('day', parseInt(currentDayInSequence.value))
      .limit(1);

    if (error) {
      console.error('Homepage - Error fetching progress from DB:', error);
      return;
    }

    // Take the first result or null if no results
    dbProgressData.value = progressData && progressData.length > 0 ? progressData[0] : null;
    console.log('Homepage - Database progress data:', dbProgressData.value);
  } catch (err) {
    console.error('Homepage - Error fetching progress:', err);
  }
};

// LocalStorage meal completions (fallback)
const loadMealCompletions = () => {
  if (!currentUserId.value) return {}
  const key = `mealCompletions_${currentUserId.value}`
  const stored = localStorage.getItem(key)
  return stored ? JSON.parse(stored) : {}
}

// Get the current day number for display
const getCurrentDayDisplay = computed(() => {
  return `Day ${currentDayInSequence.value}`;
});

// Enhanced total calories with same logic as Progress page
const totalCalories = computed(() => {
  // PRIORITY 1: Use freshly calculated calories from completed meals
  if (calculatedTotalCalories.value > 0) {
    return calculatedTotalCalories.value;
  }
  
  // PRIORITY 2: Use database progress data as fallback
  if (dbProgressData.value && dbProgressData.value.calories_consumed !== null) {
    return dbProgressData.value.calories_consumed;
  }

  // PRIORITY 3: Calculate from localStorage
  const completions = loadMealCompletions();
  let total = 0;
  const selectedDate = getCurrentSelectedDate();

  Object.keys(completions).forEach(key => {
    const completion = completions[key];
    if (
      completion &&
      completion.completed &&
      completion.date === selectedDate &&
      typeof completion.calories === 'number'
    ) {
      total += completion.calories;
    }
  });

  return total;
});
// Enhanced progress calculation with same logic as Progress page
const todayProgress = computed(() => {
  // Primary: Use database data
  if (dbCompletedMeals.value && dbCompletedMeals.value.length > 0) {
    const mealTypes = new Set();
    dbCompletedMeals.value.forEach(meal => {
      if (meal.meal_type) {
        mealTypes.add(meal.meal_type.toLowerCase());
      }
    });

    const totalMeals = 3; // breakfast, lunch, dinner
    const completedMeals = mealTypes.size;
    const percentage = totalMeals > 0 ? Math.round((completedMeals / totalMeals) * 100) : 0;

    return {
      completed: completedMeals,
      total: totalMeals,
      percentage: percentage
    };
  }

  // Fallback: Use localStorage data
  const completions = loadMealCompletions()
  const selectedDate = getCurrentSelectedDate();
  
  const selectedDateMealTypes = new Set()
  
  Object.keys(completions).forEach(key => {
    const completion = completions[key]
    if (completion && 
        completion.completed && 
        completion.date === selectedDate) {
      
      const mealType = completion.mealType?.toLowerCase() || ''
      if (mealType === 'breakfast' || mealType === 'lunch' || mealType === 'dinner') {
        selectedDateMealTypes.add(mealType)
      }
    }
  })
  
  const totalMeals = 3
  const completedMeals = selectedDateMealTypes.size
  const percentage = totalMeals > 0 ? Math.round((completedMeals / totalMeals) * 100) : 0
  
  return {
    completed: completedMeals,
    total: totalMeals,
    percentage: percentage
  }
})

// Enhanced onMounted function
onMounted(async () => {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    router.push('/login')
    return
  }

  const fullName = data.user.user_metadata.full_name || 'User'
  userFirstName.value = fullName.split(' ')[0]

  // Fetch corresponding user row
  const { data: userRow } = await supabase
    .from('users')
    .select('id')
    .eq('email', data.user.email)
    .maybeSingle()

  if (userRow) {
    currentUserId.value = userRow.id
    console.log('Homepage - User ID set for progress tracking:', userRow.id);

    // Fetch user data to get last_submission_date and calculate current day
    await fetchUserData();
    
    // Fetch progress data from existing table
    await fetchProgressFromDB();
    
    // Fetch completed meals (calories are now fetched from meals table)
    await fetchCompletedMeals();
  }
})
</script>


<template>
  <v-app>
    <v-main >
      <v-container fluid class="pa-0" style="position: relative; overflow: hidden;">
      <div class="py-8 rounded-bottom animated-bg"
          style="z-index: 1; position: relative;">
          <v-container class="d-flex justify-space-between align-center">
              <div>
                <p
                  class="text-left"
                  style="font-family: 'Syne', sans-serif; font-size: clamp(22px, 2.5vw, 30px); color: white; font-size: 35px;"
                >
                  Hi, <span style="font-family: 'Syne', sans-serif;">{{ userFirstName }}</span>!
                </p>
              </div>

              <!-- GIF -->
              <div style="margin-top: -50px;">
                <img
                  src="/src/assets/giphy.gif"
                  alt="Food Mascot"
                  class="gif"
                />
              </div>
          </v-container>

          <!-- Welcome Message -->
          <v-container>
            <p
              class="text-center"
              style="font-size: clamp(16px, 2vw, 18px); font-family: 'Syne', sans-serif; color: white; margin-top: -35px;"
            >
              “ Welcome to DiaMeal - an AI meal planner for healthier living.
              Get personalized meal plans tailored to your health, preferences, and budget! ”
            </p>
          </v-container>
      </div>

          <!-- Food Images -->
          <br>
          <div class="infinite-scroll-wrapper">
            <div class="infinite-scroll-track">
              <!-- First Set of Images -->
              <v-img :src="H1" class="scroll-img" cover />
              <v-img :src="H2" class="scroll-img" cover />
              <v-img :src="H3" class="scroll-img" cover />
              <v-img :src="H4"class="scroll-img" cover />
              <v-img :src="H5"class="scroll-img" cover />

              <!-- Duplicate Set for seamless loop -->
              <v-img :src="H1" class="scroll-img" cover />
              <v-img :src="H2" class="scroll-img" cover />
              <v-img :src="H3" class="scroll-img" cover />
              <v-img :src="H4"class="scroll-img" cover />
              <v-img :src="H5"class="scroll-img" cover />
            </div>
          </div>

          <!-- Meal Plan Progress -->
          <br>
          <v-card
            class="mx-4 mt-4 pa-4 text-center progress-card floating-card"
            elevation="4"
            rounded="xl"
          >
            
            <p
              class="text-h6 mb-1"
              style="font-family:'Syne', sans-serif; font-weight: 600;"
            > 
              Meal Plan Progress
            </p>

            <!-- Calories Line -->
            <div class="d-flex align-center justify-center mb-2">
              <v-icon color="red" class="mr-2">mdi-fire</v-icon>
              <p class="mb-0 text-lg" style="font-family: 'Syne', sans-serif; font-size: larger;">
                {{ totalCalories }} Calories Consumed Today!
              </p>
            </div>

            <!-- Meals Completed -->
            <p class="text-body-1 mb-2" style="font-family:'Syne', sans-serif;">
              {{ todayProgress.completed }} out of {{ todayProgress.total }} meals completed
            </p>

            <!-- Progress Bar -->
            <v-progress-linear
              color="#66BB6A"
              height="10"
              :model-value="todayProgress.percentage"
              striped
            ></v-progress-linear>

            <div
              class="text-subtitle-1 mt-1"
              style="font-family:'Syne', sans-serif;"
            >
              {{ todayProgress.percentage }}%
            </div>

            <v-btn
              color="#5D8736"
              class="mt-3"
              rounded="lg"
              variant="flat"
              @click="$router.push('/myprogress')"
              style="font-family: 'Syne', sans-serif;"
            >
              <v-icon start class="mr-2">mdi-eye</v-icon> View Progress
            </v-btn>
          </v-card>



         <!-- Why It Matters Section -->
        <div class="px-4 mt-6">
          <div class="d-flex align-center justify-center my-6">
            <div style="flex: 1; height: 1px; background-color: #5D8736; margin-right: 12px;"></div>
            <p class="text-h6 mb-0" style="font-family:'Syne', sans-serif; white-space: nowrap;">
              Why Living a Healthy Lifestyle Matters
            </p>
            <div style="flex: 1; height: 1px; background-color: #5D8736; margin-left: 12px;"></div>
          </div>

          <!-- Card 1 -->
          <v-row dense>
            <v-col cols="12" md="6">
              <v-card class="mt-4 pa-4 d-flex align-center" color="#e9f8ec" rounded="xl" elevation="2">
                <v-icon color="#ff6b6b" size="40" class="mr-4">mdi-food-apple</v-icon>
                <div>
                  <p class="card-title">Manages Blood Sugar</p>
                  <p class="card-description">Balanced meals help stabilize your glucose levels and prevent dangerous spikes or crashes.</p>
                </div>
              </v-card>
            </v-col>
            
            <!-- Card 2 -->
            <v-col cols="12" md="6">
              <v-card class="mt-4 pa-4 d-flex align-center" color="#f0f9e5" rounded="xl" elevation="2">
                <v-icon color="#ab47bc" size="40" class="mr-4">mdi-emoticon-happy</v-icon>
                <div>
                  <p class="card-title">Supports Mental Well-being</p>
                  <p class="card-description">A healthy diet contributes to better mood and helps manage stress and anxiety linked to diabetes.</p>
                </div>
              </v-card>
            </v-col>

            <!-- Card 3 -->
            <v-col cols="12" md="6">
              <v-card class="mt-4 pa-4 d-flex align-center" color="#def5dc" rounded="xl" elevation="2">
                <v-icon color="#f9a825" size="40" class="mr-4">mdi-eye-check</v-icon>
                <div>
                  <p class="card-title">Protects Vision</p>
                  <p class="card-description">Proper nutrition reduces the risk of diabetic retinopathy and supports eye health.</p>
                </div>
              </v-card>
            </v-col>

            <!-- Card 4 -->
            <v-col cols="12" md="6">
              <v-card class="mt-4 pa-4 d-flex align-center" color="#e3f4e0" rounded="xl" elevation="2">
                <v-icon color="#26a69a" size="40" class="mr-4">mdi-shield-check</v-icon>
                <div>
                  <p class="card-title">Boosts Immunity</p>
                  <p class="card-description">Nutritious meals enhance your immune system, helping fight infections more effectively.</p>
                </div>
              </v-card>
            </v-col>

            <!-- Card 5 -->
            <v-col cols="12" md="6">
              <v-card class="mt-4 pa-4 d-flex align-center" color="#d3f1df" rounded="xl" elevation="2">
                <v-icon color="#42a5f5" size="40" class="mr-4">mdi-foot-print</v-icon>
                <div>
                  <p class="card-title">Improves Circulation</p>
                  <p class="card-description">Healthy food helps blood flow, lowering the risk of nerve damage and foot complications.</p>
                </div>
              </v-card>
            </v-col>

            <!-- Card 6 -->
            <v-col cols="12" md="6">
            <v-card class="mt-4 pa-4 d-flex align-center" color="#def5dc" rounded="xl" elevation="2">
              <v-icon color="#320A6B" size="40" class="mr-4">mdi-heart-pulse</v-icon>
              <div>
                <p class="card-title">Promotes Heart Health</p>
                <p class="card-description">Nutritious meals lower cholesterol and blood pressure, reducing the risk of heart disease.</p>
              </div>
            </v-card>
            </v-col>
          </v-row>
        </div>

          <br>
        <!-- Bottom Navigation -->
        <v-bottom-navigation grow class="mt-8 nav-bar" style="background-color: #5B913B; margin-bottom: -1px;">
          <v-btn @click="$router.push('/home')" class="nav-tab" :class="{ active: $route.path === '/home' }">
            <span class="icon-wrapper" :class="{ active: $route.path === '/home' }">
              <v-icon>mdi-home</v-icon>
            </span>
            <span>Home</span>
          </v-btn>

          <v-btn @click="$router.push('/meal-plan')" class="nav-tab" :class="{ active: $route.path === '/meal-plan' }">
            <span class="icon-wrapper" :class="{ active: $route.path === '/meal-plan' }">
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

      </v-container>
    </v-main>
  </v-app>
</template>


<style scoped>
.animated-bg {
  position: relative;
  height: auto;
  border-bottom-left-radius: 100% 40px;
  border-bottom-right-radius: 100% 40px;
  overflow: hidden;
  background: linear-gradient(-45deg, #5D8736, #A9C46C, #7BAA4B, #5D8736);
  background-size: 400% 400%;
  animation: gradientMove 10s ease infinite;
}

@keyframes gradientMove {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

.rounded-bottom {
  border-bottom-left-radius: 40px;
  border-bottom-right-radius: 40px;
}

.gif {
  width: 120px; 
  animation: floatBounce 2.5s ease-in-out infinite;
}

@keyframes floatBounce {
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-10px);
  }
}

.infinite-scroll-wrapper {
  overflow: hidden;
  width: 100%;
  background-color: transparent;
}

.infinite-scroll-track {
  display: flex;
  width: max-content;
  animation: scroll-left 20s linear infinite;
}

.scroll-img {
  width: 180px;
  height: 180px;
  border-radius: 12px;
  margin: 0 8px;
  flex-shrink: 0;
}

@keyframes scroll-left {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-30%);
  }
}

.progress-card {
  border: 3px #5D8736;
  background-color: #f9fff2;
  transition: transform 0.3s ease-in-out;
}

.floating-card {
  animation: floatUpDown 4s ease-in-out infinite;
}

@keyframes floatUpDown {
  0% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-6px);
  }
  100% {
    transform: translateY(0px);
  }
}

.card-title {
  font-size: 18px;
  font-family: 'Syne', sans-serif;
  font-weight: 500;
  margin-bottom: 3px;
}

.card-description {
  font-size: 15px;
  font-family: 'Syne', sans-serif;
  line-height: 1.5;
  color: #444;
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
</style>