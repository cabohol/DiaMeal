<script setup>
import { ref, onMounted, computed } from 'vue';
import { supabase } from '@/utils/supabase';
import { useRouter } from 'vue-router';

const router = useRouter();
const userFirstName = ref('User');
const avatarUrl = ref(null); 
const currentUserId = ref(null);
const dbCompletedMeals = ref([]);
const dbProgressData = ref(null);
const calculatedTotalCalories = ref(0);
const userLastSubmissionDate = ref(null);
const currentDayInSequence = ref(1);
const generatedDays = ref([]);

// Weekly data
const currentWeekSummary = ref(null);
const weeklyCaloriesData = ref([]);
const weeklyCarbsData = ref([]);
const activeTab = ref('daily');

// Time windows for meals (in minutes from midnight)
const timeWindows = {
  breakfast: { start: 6 * 60, end: 8 * 60 },   // 6:00 AM - 8:00 AM
  lunch: { start: 12 * 60, end: 14 * 60 },     // 11:00 AM - 2:00 PM
  dinner: { start: 18 * 60, end: 20 * 60 }     // 6:00 PM - 8:00 PM
};

// Helper: Get current time in minutes from midnight
const getCurrentTimeInMinutes = () => {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
};

// Helper: Check if a meal time window has passed
const hasMealWindowPassed = (mealType) => {
  const currentMinutes = getCurrentTimeInMinutes();
  const window = timeWindows[mealType.toLowerCase()];
  return window ? currentMinutes > window.end : false;
};

// Helper: Check if currently within meal window
const isWithinMealWindow = (mealType) => {
  const currentMinutes = getCurrentTimeInMinutes();
  const window = timeWindows[mealType.toLowerCase()];
  return window ? (currentMinutes >= window.start && currentMinutes <= window.end) : false;
};

// Helper function to get local date string (YYYY-MM-DD format)
const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Get week boundaries (Monday to Sunday)
const getWeekBoundaries = (baseDate = null) => {
  let startDate;
  if (baseDate) {
    startDate = new Date(baseDate);
  } else if (userLastSubmissionDate.value) {
    startDate = new Date(userLastSubmissionDate.value);
  } else {
    startDate = new Date();
  }
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  endDate.setHours(23, 59, 59, 999);
  return { 
    start: getLocalDateString(startDate), 
    end: getLocalDateString(endDate)
  };
};

// Calculate skipped meals based on time windows
const calculateSkippedMeals = (completedMeals, weekBounds) => {
  const today = getLocalDateString();
  const currentMinutes = getCurrentTimeInMinutes();
  let skipped = 0;
  
  // Loop through each day in the week
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekBounds.start);
    date.setDate(date.getDate() + i);
    const dateStr = getLocalDateString(date);
    
    // Skip future days
    if (dateStr > today) continue;
    
    const dayMeals = completedMeals.filter(m => m.meal_date === dateStr);
    const completedTypes = dayMeals.map(m => m.meal_type?.toLowerCase());
    
    ['breakfast', 'lunch', 'dinner'].forEach(mealType => {
      const isCompleted = completedTypes.includes(mealType);
      
      if (!isCompleted) {
        if (dateStr < today) {
          // Past day - meal is skipped
          skipped++;
        } else if (dateStr === today) {
          // Today - check if time window has passed
          if (hasMealWindowPassed(mealType)) {
            skipped++;
          }
        }
      }
    });
  }
  
  return skipped;
};

// Fetch weekly summary
const fetchWeeklySummary = async () => {
  if (!currentUserId.value || !userLastSubmissionDate.value) return;
  
  try {
    const currentWeek = getWeekBoundaries();
    
    const { data: currentWeekMeals, error: currentError } = await supabase
      .from('completed_meals')
      .select(`*, meals (calories, carbs, protein, fiber, fat)`)
      .eq('user_id', currentUserId.value)
      .gte('meal_date', currentWeek.start)
      .lte('meal_date', currentWeek.end);
    
    if (currentError) {
      console.error('Error fetching current week meals:', currentError);
      return;
    }
    
    const currentSummary = processWeekData(currentWeekMeals || [], currentWeek);
    currentWeekSummary.value = currentSummary;
    prepareChartData(currentWeekMeals || [], currentWeek);
    await saveWeeklySummary(currentSummary, currentWeek);
    
  } catch (err) {
    console.error('Error fetching weekly summary:', err);
  }
};

const mealTypeBreakdown = computed(() => {
  if (!currentWeekSummary.value || !currentWeekSummary.value.mealsByType) {
    return { breakfast: 0, lunch: 0, dinner: 0 };
  }
  return currentWeekSummary.value.mealsByType;
});

// WEEKLY SUMMARY
//Avg Daily Calories & Avg Daily Carbs
const processWeekData = (meals, weekBounds) => {
  const dailyData = {};
  const mealsByType = { breakfast: 0, lunch: 0, dinner: 0 };
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekBounds.start);
    date.setDate(date.getDate() + i);
    const dateStr = getLocalDateString(date);
    const dayLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    dailyData[dateStr] = {
      day: dayLabel,
      dayNumber: i + 1,
      calories: 0, carbs: 0, protein: 0, fiber: 0, fat: 0,
      mealsCompleted: 0
    };
  }
  
  meals.forEach(meal => {
    const date = meal.meal_date;
    if (dailyData[date] && meal.meals) {
      dailyData[date].calories += meal.meals.calories || 0;
      dailyData[date].carbs += meal.meals.carbs || 0;
      dailyData[date].protein += meal.meals.protein || 0;
      dailyData[date].fiber += meal.meals.fiber || 0;
      dailyData[date].fat += meal.meals.fat || 0;
      dailyData[date].mealsCompleted += 1;
      
      if (meal.meal_type) {
        const mealType = meal.meal_type.toLowerCase();
        if (mealsByType.hasOwnProperty(mealType)) {
          mealsByType[mealType]++;
        }
      }
    }
  });
  
  let totalCalories = 0, totalCarbs = 0, totalMealsCompleted = 0;
  
  Object.values(dailyData).forEach(day => {
    totalCalories += day.calories;
    totalCarbs += day.carbs;
    totalMealsCompleted += day.mealsCompleted;
  });
  
  // Calculate skipped meals based on time windows
  const skippedMeals = calculateSkippedMeals(meals, weekBounds);
  const totalPossibleMeals = 21;
  const mealCompletionRate = totalPossibleMeals > 0 ? (totalMealsCompleted / totalPossibleMeals) : 0;
  
  return {
    totalCalories: Math.round(totalCalories),
    avgDailyCalories: Math.round(totalCalories / 7),
    totalCarbs: Math.round(totalCarbs),
    avgDailyCarbs: Math.round(totalCarbs / 7),
    mealCompletionRate: Math.round(mealCompletionRate * 100),
    totalMealsCompleted,
    skippedMeals,
    mealsByType,
    dailyData
  };
};

// Prepare chart data
const prepareChartData = (meals, weekBounds) => {
  const caloriesData = [], carbsData = [];
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekBounds.start);
    date.setDate(date.getDate() + i);
    const dateStr = getLocalDateString(date);
    const dayLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dayMeals = meals.filter(m => m.meal_date === dateStr);
    
    let dayCalories = 0, dayCarbs = 0;
    dayMeals.forEach(meal => {
      if (meal.meals) {
        dayCalories += meal.meals.calories || 0;
        dayCarbs += meal.meals.carbs || 0;
      }
    });
    
    caloriesData.push({ day: dayLabel, calories: Math.round(dayCalories) });
    carbsData.push({ day: dayLabel, carbs: Math.round(dayCarbs), target: 165 });
  }
  
  weeklyCaloriesData.value = caloriesData;
  weeklyCarbsData.value = carbsData;
};

// Save weekly summary to database
const saveWeeklySummary = async (summary, weekBounds) => {
  if (!currentUserId.value || !summary) return;
  
  try {
    const { error } = await supabase
      .from('weekly_nutrition_summary')
      .upsert({
        user_id: currentUserId.value,
        week_start_date: weekBounds.start,
        week_end_date: weekBounds.end,
        total_calories: summary.totalCalories,
        total_carbs: summary.totalCarbs,
        meal_completion_rate: summary.mealCompletionRate / 100,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,week_start_date,week_end_date' });
    
    if (error) console.error('Error saving weekly summary:', error);
  } catch (err) {
    console.error('Error saving weekly summary:', err);
  }
};

// Generate day labels with actual dates
const generateDaysWithDates = (startDate) => {
  const days = [];
  const baseDate = new Date(startDate);
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    days.push({ label: `Day ${i + 1}`, date: dateStr, dayNumber: i + 1 });
  }
  return days;
};

// Calculate which day should be selected
const calculateSelectedDay = () => {
  if (!userLastSubmissionDate.value) return 1;
  const todayLocal = getLocalDateString();
  const todayIndex = generatedDays.value.findIndex(day => day.date === todayLocal);
  return todayIndex >= 0 ? todayIndex + 1 : 1;
};

// Fetch user's last submission date
const fetchUserData = async () => {
  if (!currentUserId.value) return;
  
  try {
    const { data: userData, error } = await supabase
      .from('users')
      .select('last_submission_date')
      .eq('id', currentUserId.value)
      .single();

    if (error) {
      console.error('Error fetching user data:', error);
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
  } catch (err) {
    console.error('Error fetching user data:', err);
  }
};

// Get the date for current selected day
const getCurrentSelectedDate = () => {
  if (!generatedDays.value.length || !currentDayInSequence.value) {
    return getLocalDateString();
  }
  const selectedDay = generatedDays.value.find(day => day.dayNumber === currentDayInSequence.value);
  return selectedDay ? selectedDay.date : getLocalDateString();
};

// Fetch completed meals
// DAILY VIEW
const fetchCompletedMeals = async () => {
  if (!currentUserId.value) return;
  const selectedDate = getCurrentSelectedDate();
  
  try {
    const { data: completedMeals, error } = await supabase
      .from('completed_meals')
      .select(`*, meals (calories, name)`)
      .eq('user_id', currentUserId.value)
      .eq('meal_date', selectedDate);

    if (error) {
      console.error('Error fetching completed meals:', error);
      return;
    }

    const processedMeals = await Promise.all(completedMeals?.map(async (meal) => {
      let calories = meal.meals?.calories || meal.calories || 0;
      let mealName = meal.meals?.name || meal.meal_name || 'Unknown Meal';
      return { ...meal, calories, meal_name: mealName };
    }) || []);

    dbCompletedMeals.value = processedMeals;
    
    const totalCalories = processedMeals.reduce((sum, meal) => sum + (meal.calories || 0), 0);
    calculatedTotalCalories.value = totalCalories;
    
    const completedMealTypes = new Set();
    dbCompletedMeals.value.forEach(meal => {
      if (meal.meal_type) completedMealTypes.add(meal.meal_type.toLowerCase());
    });
    
    await updateProgressInDB(totalCalories, completedMealTypes.size);
  } catch (err) {
    console.error('Error fetching completed meals:', err);
  }
};

// Update progress in database
const updateProgressInDB = async (accurateCalories, completedMealsCount) => {
  if (!currentUserId.value || !currentDayInSequence.value) return;

  try {
    const { error } = await supabase
      .from('progress')
      .upsert({
        user_id: currentUserId.value,
        day: currentDayInSequence.value,
        calories_consumed: accurateCalories,
        status: completedMealsCount >= 1 ? 'completed' : 'in_progress',
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error updating progress:', error);
      return;
    }
    await fetchProgressFromDB();
  } catch (err) {
    console.error('Error updating progress:', err);
  }
};

// Computed total calories
const totalCalories = computed(() => {
  if (calculatedTotalCalories.value > 0) return calculatedTotalCalories.value;
  if (dbProgressData.value && dbProgressData.value.calories_consumed !== null) {
    return dbProgressData.value.calories_consumed;
  }
  return 0;
});

// Computed progress
const todayProgress = computed(() => {
  if (dbCompletedMeals.value?.length > 0) {
    const mealTypes = new Set();
    dbCompletedMeals.value.forEach(meal => {
      if (meal.meal_type) mealTypes.add(meal.meal_type.toLowerCase());
    });
    const totalMeals = 3, completedMeals = mealTypes.size;
    return {
      completed: completedMeals,
      total: totalMeals,
      percentage: Math.round((completedMeals / totalMeals) * 100)
    };
  }
  return { completed: 0, total: 3, percentage: 0 };
});

// Generate meal status array with time window logic
const completedMeals = computed(() => {
  const mealTypes = ['breakfast', 'lunch', 'dinner'];
  const mealNames = ['BREAKFAST', 'LUNCH', 'DINNER'];
  const colors = ['#e7f5d9', '#fff7d9', '#e7f5d9'];
  const today = getLocalDateString();
  const selectedDate = getCurrentSelectedDate();
  
  return mealTypes.map((type, index) => {
    const dbCompletion = dbCompletedMeals.value.find(meal => 
      meal.meal_type?.toLowerCase() === type
    );
    
    if (dbCompletion) {
      let timeString = '---';
      const timestamp = dbCompletion.completed_at || dbCompletion.created_at || dbCompletion.updated_at;
      
      if (timestamp) {
        try {
          const completedDateTime = new Date(timestamp);
          if (!isNaN(completedDateTime.getTime())) {
            const dateStr = completedDateTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const timeStr = completedDateTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            timeString = `${dateStr} at ${timeStr}`;
          }
        } catch (e) {
          console.error('Error parsing date:', e);
        }
      }
      
      return {
        name: mealNames[index],
        status: 'Completed',
        time: timeString,
        color: colors[index],
        mealName: dbCompletion.meal_name,
        calories: dbCompletion.calories || 0
      };
    }
    
    // Check if meal should be marked as skipped
    let status = 'Not Started';
    let statusColor = 'orange';
    
    if (selectedDate < today) {
      // Past day - meal is skipped
      status = 'Skipped';
      statusColor = 'red';
    } else if (selectedDate === today && hasMealWindowPassed(type)) {
      // Today and time window has passed
      status = 'Skipped';
      statusColor = 'red';
    } else if (selectedDate === today && isWithinMealWindow(type)) {
      // Currently within meal window
      status = 'Available Now';
      statusColor = 'blue';
    }
    
    return {
      name: mealNames[index],
      status: status,
      statusColor: statusColor,
      time: null,
      color: colors[index],
      mealName: null,
      calories: 0
    };
  });
});

// Fetch progress data
const fetchProgressFromDB = async () => {
  if (!currentUserId.value || !currentDayInSequence.value) return;
  
  try {
    const { data: progressData, error } = await supabase
      .from('progress')
      .select('*')
      .eq('user_id', parseInt(currentUserId.value))
      .eq('day', parseInt(currentDayInSequence.value))
      .limit(1);

    if (error) {
      console.error('Error fetching progress from DB:', error);
      return;
    }
    dbProgressData.value = progressData?.length > 0 ? progressData[0] : null;
  } catch (err) {
    console.error('Error fetching progress:', err);
  }
};

// Get current date display
const getCurrentDateDisplay = computed(() => {
  const selectedDate = getCurrentSelectedDate();
  const date = new Date(selectedDate + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
});

// Get current day display
const getCurrentDayDisplay = computed(() => `Day ${currentDayInSequence.value}`);

// Format date range for display
const formatDateRange = (start, end) => {
  if (!start || !end) return '';
  const startDate = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  const options = { month: 'short', day: 'numeric' };
  return `${startDate.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}`;
};

// Format time window for display
const formatTimeWindow = (mealType) => {
  const window = timeWindows[mealType.toLowerCase()];
  if (!window) return '';
  const formatTime = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
  };
  return `${formatTime(window.start)} - ${formatTime(window.end)}`;
};

onMounted(async () => {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) {
      router.push('/login');
      return;
    }

    const meta = data.user.user_metadata;
    userFirstName.value = (meta.full_name || 'User').split(' ')[0];
    avatarUrl.value = meta.avatar_url || null;

    const { data: userRow, error: userRowErr } = await supabase
      .from('users')
      .select('id')
      .eq('email', data.user.email)
      .single();

    if (userRowErr || !userRow) {
      console.error('Error fetching user ID:', userRowErr);
      return;
    }

    currentUserId.value = userRow.id;
    await fetchUserData();
    await fetchProgressFromDB();
    await fetchCompletedMeals();
    await fetchWeeklySummary();
  } catch (err) {
    console.error('Error in onMounted:', err);
    router.push('/login');
  }
});
</script>

<template>
  <v-app>
    <v-main>
      <v-container fluid class="pa-0">
        <!-- Header -->
        <div class="d-flex align-center px-4 py-3" style="background-color: #5D8736; height: 130px;">
          <v-avatar size="100" class="mr-3">
            <v-img v-if="avatarUrl" :src="avatarUrl" alt="User Avatar" />
            <v-icon v-else size="85" color="white">mdi-account-circle</v-icon>
          </v-avatar>
          <div>
            <p class="mb-0" style="color: white; font-size: 20px; font-family: 'Syne', sans-serif;">
              {{ userFirstName }}! Here's your progress update.
            </p>
          </div>
        </div>

        <!-- Tab Selector -->
        <v-container class="mt-4 px-2">
          <v-btn-toggle v-model="activeTab" mandatory rounded="lg" color="#5D8736" class="mb-4 d-flex"
            style="width: 100%; border: 1px solid #5D8736; border-radius: 10px;">
            <v-btn value="daily" class="flex-grow-1 text-none" style="font-family: 'Syne', sans-serif;">
              <v-icon start>mdi-calendar-today</v-icon>Daily View
            </v-btn>
            <v-btn value="weekly" class="flex-grow-1 text-none" style="font-family: 'Syne', sans-serif;">
              <v-icon start>mdi-chart-line</v-icon>Weekly Summary
            </v-btn>
          </v-btn-toggle>
        </v-container>

        <!-- DAILY VIEW -->
        <div v-if="activeTab === 'daily'">
          <div class="progress-container">
            <div class="image-wrapper">
              <img src="/src/assets/veg.png" alt="Broccoli" class="progress-image" />
            </div>
            <v-card class="progress-card" rounded="lg" elevation="3">
              <div class="d-flex align-center justify-center mb-2">
                <v-icon color="red" class="mr-2">mdi-fire</v-icon>
                <h3 class="mb-0 text-lg font-semibold" style="font-family: 'Syne', sans-serif;">
                  {{ totalCalories }} Calories Consumed for {{ getCurrentDayDisplay }}
                </h3>
              </div>
              <p class="mb-2 text-lg" style="font-family: 'Syne', sans-serif;">
                {{ todayProgress.completed }} out of {{ todayProgress.total }} meals completed!
              </p>
              <v-progress-linear color="#66BB6A" height="10" :model-value="todayProgress.percentage" striped />
              <div class="mt-2 font-weight-bold" style="font-family: 'Syne', sans-serif;">
                {{ todayProgress.percentage }}%
              </div>
            </v-card>
          </div>

          <!-- Meal Cards -->
          <v-container class="mt-4">
            <v-row>
              <v-col v-for="meal in completedMeals" :key="meal.name" cols="12" sm="4" md="4" lg="4">
                <v-card class="meal-progress-card px-4 py-4 d-flex flex-column h-100 text-center"
                  :color="meal.color" rounded="lg" elevation="2">
                  <p class="mb-3 font-weight-bold text-h6" style="font-family: 'Syne', sans-serif;">
                    {{ meal.name }}
                  </p>
                  
                  <!-- Time Window Info -->
                  <p class="text-caption text-grey-darken-1 mb-2" style="font-family: 'Syne', sans-serif;">
                    {{ formatTimeWindow(meal.name) }}
                  </p>
                  
                  <div class="d-flex align-center justify-center mb-2">
                    <v-icon small 
                      :color="meal.status === 'Completed' ? 'green' : meal.status === 'Skipped' ? 'red' : meal.status === 'Available Now' ? 'blue' : 'orange'" 
                      class="mr-2">
                      {{ meal.status === 'Completed' ? 'mdi-check-circle' : meal.status === 'Skipped' ? 'mdi-close-circle' : meal.status === 'Available Now' ? 'mdi-clock-check' : 'mdi-progress-clock' }}
                    </v-icon>
                    <span class="font-weight-medium" 
                      :class="meal.status === 'Completed' ? 'text-green' : meal.status === 'Skipped' ? 'text-red' : meal.status === 'Available Now' ? 'text-blue' : 'text-orange'" 
                      style="font-family: 'Syne', sans-serif;">
                      {{ meal.status }}
                    </span>
                  </div>
                  
                  <div v-if="meal.mealName" class="mb-2">
                    <p class="text-sm font-weight-medium" style="font-family: 'Syne', sans-serif;">{{ meal.mealName }}</p>
                    <p v-if="meal.calories > 0" class="text-xs text-grey-darken-1">
                      <v-icon size="x-small" color="#EF7722" class="mr-1">mdi-fire</v-icon>
                      {{ meal.calories }} cal
                    </p>
                  </div>
                  
                  <p class="text-xl mb-0 mt-auto" style="font-family: 'Syne', sans-serif;">
                    {{ meal.time || '---' }}
                  </p>
                </v-card>
              </v-col>
            </v-row>
          </v-container>
        </div>

        <!-- WEEKLY VIEW -->
        <div v-else-if="activeTab === 'weekly'" class="weekly-view">
          <v-container>
            <!-- Week Date Range -->
            <v-card class="mb-4 pa-4" elevation="2" rounded="lg">
              <div class="d-flex align-items-center justify-space-between">
                <div class="d-flex align-items-center">
                  <v-icon color="#5D8736" size="large" class="mr-2">mdi-calendar-week</v-icon>
                  <div>
                    <h3 class="text-h6 font-weight-bold" style="font-family: 'Syne', sans-serif; color: #2C3E50;">
                      Current Week
                    </h3>
                    <p class="text-body-2 text-grey-darken-1 mb-0" style="font-family: 'Syne', sans-serif;">
                      {{ currentWeekSummary ? formatDateRange(getWeekBoundaries().start, getWeekBoundaries().end) : 'Loading...' }}
                    </p>
                  </div>
                </div>
              </div>
            </v-card>

            <!-- Weekly Meal Activity Card -->
            <v-row class="mb-4">
              <v-col cols="12">
                <v-card class="pa-4" elevation="2" rounded="lg">
                  <div class="mb-4">
                    <div class="d-flex justify-space-between align-center mb-2">
                      <span class="text-body-1" style="font-family: 'Syne', sans-serif;">Meals Completed This Week</span>
                      <span class="text-h5 font-weight-bold" style="color: #5D8736; font-family: 'Syne', sans-serif;">
                        {{ currentWeekSummary?.totalMealsCompleted || 0 }} / 21
                      </span>
                    </div>
                    <v-progress-linear
                      :model-value="((currentWeekSummary?.totalMealsCompleted || 0) / 21) * 100"
                      color="#5D8736" bg-color="#E8F5E9" height="16" rounded />
                    <div class="text-caption text-grey-darken-1 mt-1" style="font-family: 'Syne', sans-serif;">
                      21 total meals (Breakfast, Lunch, Dinner × 7 days)
                    </div>
                  </div>
                  
                  <v-row>
                    <v-col cols="6">
                      <div class="d-flex align-center pa-3 rounded-lg" style="background-color: #E8F5E9;">
                        <div class="w-100">
                          <div class="text-h6 font-weight-bold text-center" style="color: #2E7D32; font-family: 'Syne', sans-serif;">
                            {{ currentWeekSummary?.totalMealsCompleted || 0 }}
                          </div>
                          <div class="text-caption text-center" style="font-family: 'Syne', sans-serif;">Marked as Completed</div>
                        </div>
                      </div>
                    </v-col>
                    <v-col cols="6">
                      <div class="d-flex align-center pa-3 rounded-lg" style="background-color: #FFEBEE;">
                        <div class="w-100">
                          <div class="text-h6 font-weight-bold text-center" style="color: #C62828; font-family: 'Syne', sans-serif;">
                            {{ currentWeekSummary?.skippedMeals || 0 }}
                          </div>
                          <div class="text-caption text-center" style="font-family: 'Syne', sans-serif;">Not Marked / Skipped</div>
                        </div>
                      </div>
                    </v-col>
                  </v-row>
                </v-card>
              </v-col>
            </v-row>

            <!-- Summary Stats Cards -->
            <v-row class="mb-4">
              <v-col cols="12" sm="4">
                <v-card class="pa-4" elevation="2" rounded="lg">
                  <span class="text-body-2 text-grey-darken-1" style="font-family: 'Syne', sans-serif;">Avg Daily Calories</span>
                  <div class="text-h5 font-weight-bold mt-2" style="color: #2C3E50; font-family: 'Syne', sans-serif;">
                    {{ currentWeekSummary?.avgDailyCalories || 0 }}
                  </div>
                  <div class="text-caption text-grey" style="font-family: 'Syne', sans-serif;">kcal/day</div>
                </v-card>
              </v-col>
              <v-col cols="12" sm="4">
                <v-card class="pa-4" elevation="2" rounded="lg">
                  <span class="text-body-2 text-grey-darken-1" style="font-family: 'Syne', sans-serif;">Avg Daily Carbs</span>
                  <div class="text-h5 font-weight-bold mt-2" style="color: #2C3E50; font-family: 'Syne', sans-serif;">
                    {{ currentWeekSummary?.avgDailyCarbs || 0 }}g
                  </div>
                  <div class="text-caption text-grey" style="font-family: 'Syne', sans-serif;">Target: 165g</div>
                </v-card>
              </v-col>
              <v-col cols="12" sm="4">
                <v-card class="pa-4" elevation="2" rounded="lg">
                  <span class="text-body-2 text-grey-darken-1" style="font-family: 'Syne', sans-serif;">Completion Rate</span>
                  <div class="text-h5 font-weight-bold mt-2" style="color: #2C3E50; font-family: 'Syne', sans-serif;">
                    {{ currentWeekSummary?.mealCompletionRate || 0 }}%
                  </div>
                  <div class="text-caption text-grey" style="font-family: 'Syne', sans-serif;">of all meals</div>
                </v-card>
              </v-col>
            </v-row>

            <!-- Charts -->
            <v-row>
              <v-col cols="12" md="6">
                <v-card class="pa-4" elevation="2" rounded="lg">
                  <h3 class="text-h6 font-weight-bold mb-4" style="color: #2C3E50; font-family: 'Syne', sans-serif;">
                    <v-icon color="#EF7722" class="mr-2">mdi-fire</v-icon>Weekly Calorie Trend
                  </h3>
                  <div class="chart-container">
                    <svg viewBox="0 0 400 200" class="bar-chart">
                      <g v-for="(data, index) in weeklyCaloriesData" :key="index">
                        <rect :x="20 + index * 50" :y="180 - (data.calories / 25)" width="40" :height="data.calories / 25"
                          fill="#EF7722" rx="4" />
                        <text :x="40 + index * 50" y="195" text-anchor="middle" font-size="12" fill="#666"
                          style="font-family: 'Syne', sans-serif;">{{ data.day }}</text>
                        <text :x="40 + index * 50" :y="175 - (data.calories / 25)" text-anchor="middle" font-size="10"
                          fill="#2C3E50" font-weight="bold" style="font-family: 'Syne', sans-serif;">{{ data.calories }}</text>
                      </g>
                    </svg>
                  </div>
                </v-card>
              </v-col>
              <v-col cols="12" md="6">
                <v-card class="pa-4" elevation="2" rounded="lg">
                  <h3 class="text-h6 font-weight-bold mb-4" style="color: #2C3E50; font-family: 'Syne', sans-serif;">
                    <v-icon color="#B87C4C" class="mr-2">mdi-barley</v-icon>Weekly Carbohydrate Trend
                  </h3>
                  <div class="chart-container">
                    <svg viewBox="0 0 400 200" class="line-chart">
                      <line x1="20" y1="100" x2="380" y2="100" stroke="#9CA3AF" stroke-width="2" stroke-dasharray="5,5" />
                      <text x="385" y="105" font-size="10" fill="#9CA3AF" style="font-family: 'Syne', sans-serif;">165g</text>
                      <polyline :points="weeklyCarbsData.map((d, i) => `${40 + i * 50},${180 - d.carbs}`).join(' ')"
                        fill="none" stroke="#B87C4C" stroke-width="3" />
                      <g v-for="(data, index) in weeklyCarbsData" :key="index">
                        <circle :cx="40 + index * 50" :cy="180 - data.carbs" r="5" fill="#B87C4C" />
                        <text :x="40 + index * 50" y="195" text-anchor="middle" font-size="12" fill="#666"
                          style="font-family: 'Syne', sans-serif;">{{ data.day }}</text>
                        <text :x="40 + index * 50" :y="170 - data.carbs" text-anchor="middle" font-size="10"
                          fill="#2C3E50" font-weight="bold" style="font-family: 'Syne', sans-serif;">{{ data.carbs }}g</text>
                      </g>
                    </svg>
                  </div>
                </v-card>
              </v-col>
            </v-row>
          </v-container>
        </div>

        <!-- Bottom Navigation -->
        <v-bottom-navigation grow class="mt-8 nav-bar" style="background-color: #5B913B; margin-bottom: -1px;">
          <v-btn @click="$router.push('/home')" class="nav-tab" :class="{ active: $route.path === '/home' }">
            <span class="icon-wrapper" :class="{ active: $route.path === '/home' }"><v-icon>mdi-home</v-icon></span>
            <span>Home</span>
          </v-btn>
          <v-btn @click="$router.push('/meal-plan')" class="nav-tab" :class="{ active: $route.path === '/meal-plan' }">
            <span class="icon-wrapper" :class="{ active: $route.path === '/meal-plan' }"><v-icon>mdi-heart-pulse</v-icon></span>
            <span>Meal Plan</span>
          </v-btn>
          <v-btn @click="$router.push('/profile')" class="nav-tab" :class="{ active: $route.path === '/profile' }">
            <span class="icon-wrapper" :class="{ active: $route.path === '/profile' }"><v-icon>mdi-account</v-icon></span>
            <span>Profile</span>
          </v-btn>
          <v-btn @click="$router.push('/myprogress')" class="nav-tab" :class="{ active: $route.path === '/myprogress' }">
            <span class="icon-wrapper" :class="{ active: $route.path === '/myprogress' }"><v-icon>mdi-chart-line</v-icon></span>
            <span>Progress</span>
          </v-btn>
        </v-bottom-navigation>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
body, p, span, div, button, h1, h2, h3, h4, h5, h6 {
  font-family: 'Syne', sans-serif !important;
}

.meal-progress-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  min-height: 150px;
}

.meal-progress-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
}

@media (max-width: 599px) {
  .meal-progress-card {
    min-height: 120px;
  }
}

@media (min-width: 600px) {
  .meal-progress-card {
    min-height: 160px;
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

.v-btn-toggle {
  width: 100% !important;
}

.v-btn-toggle > .v-btn {
  flex: 1 1 0 !important;
}


.progress-container {
  position: relative;
  display: flex;
  justify-content: center;
  margin-top: 120px;
}

.image-wrapper {
  position: absolute;
  top: -140px; 
  z-index: 1;
  display: flex;
  justify-content: center;
  width: 100%;
}

.progress-image {
  width: clamp(250px, 40vw, 200px); 
  height: auto;
  object-fit: contain;
}

.progress-card {
  position: relative;
  z-index: 2;
  width: 90%;
  max-width: 750px;
  padding: 16px;
  text-align: center;
}

/* Chart styles */
.chart-container {
  width: 100%;
  height: 250px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bar-chart, .line-chart {
  width: 100%;
  height: 100%;
}

.weekly-view {
  padding-bottom: 80px;
}
</style>