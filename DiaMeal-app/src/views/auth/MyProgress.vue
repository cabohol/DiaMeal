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

// NEW: Weekly data
const currentWeekSummary = ref(null);
const previousWeekSummary = ref(null);
const weeklyCaloriesData = ref([]);
const weeklyCarbsData = ref([]);
const activeTab = ref('daily'); // 'daily' or 'weekly'

// Helper function to get local date string (YYYY-MM-DD format)
const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// NEW: Get week boundaries (Monday to Sunday)
const getWeekBoundaries = (baseDate = null) => {
  // If no baseDate provided, use user's last_submission_date
  let startDate;
  
  if (baseDate) {
    startDate = new Date(baseDate);
  } else if (userLastSubmissionDate.value) {
    startDate = new Date(userLastSubmissionDate.value);
  } else {
    // Fallback to today if no submission date
    startDate = new Date();
  }
  
  // Ensure we're working with just the date (no time component issues)
  startDate.setHours(0, 0, 0, 0);
  
  // End date is 6 days after start (7 day total period)
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  endDate.setHours(23, 59, 59, 999);
  
  return { 
    start: getLocalDateString(startDate), 
    end: getLocalDateString(endDate)
  };
};

// NEW: Get previous week boundaries (7 days before the current week start)
const getPreviousWeekBoundaries = () => {
  if (!userLastSubmissionDate.value) return null;
  
  const currentStart = new Date(userLastSubmissionDate.value);
  currentStart.setHours(0, 0, 0, 0);
  
  // Previous week starts 7 days before current week
  const prevStart = new Date(currentStart);
  prevStart.setDate(currentStart.getDate() - 7);
  
  const prevEnd = new Date(prevStart);
  prevEnd.setDate(prevStart.getDate() + 6);
  
  return {
    start: getLocalDateString(prevStart),
    end: getLocalDateString(prevEnd)
  };
};

// NEW: Calculate balanced meal score
const calculateBalancedScore = (dailyNutrition) => {
  let score = 0
  
  // Carbs within target (40 points)
  const carbs = dailyNutrition.carbs || 0
  if (carbs >= 130 && carbs <= 180) {
    score += 40
  } else {
    const diff = Math.abs(carbs - 155)
    score += Math.max(0, 40 - (diff * 0.5))
  }
  
  // Adequate protein (30 points)
  const protein = dailyNutrition.protein || 0
  if (protein >= 60) {
    score += 30
  } else {
    score += (protein / 60) * 30
  }
  
  // Adequate fiber (30 points)
  const fiber = dailyNutrition.fiber || 0
  if (fiber >= 20) {
    score += 30
  } else {
    score += (fiber / 20) * 30
  }
  
  return Math.round(score)
}

// NEW: Fetch weekly summary
const fetchWeeklySummary = async () => {
  if (!currentUserId.value || !userLastSubmissionDate.value) return;
  
  try {
    // Get current week boundaries based on user's last_submission_date
    const currentWeek = getWeekBoundaries();
    
    // Get previous week boundaries
    const previousWeek = getPreviousWeekBoundaries();
    
    console.log('Fetching weekly data:', { currentWeek, previousWeek });
    
    // Fetch current week's completed meals
    const { data: currentWeekMeals, error: currentError } = await supabase
      .from('completed_meals')
      .select(`
        *,
        meals (
          calories,
          carbs,
          protein,
          fiber,
          fat
        )
      `)
      .eq('user_id', currentUserId.value)
      .gte('meal_date', currentWeek.start)
      .lte('meal_date', currentWeek.end);
    
    if (currentError) {
      console.error('Error fetching current week meals:', currentError);
      return;
    }
    
    // Fetch previous week's completed meals (if exists)
    let previousWeekMeals = [];
    if (previousWeek) {
      const { data: prevData, error: previousError } = await supabase
        .from('completed_meals')
        .select(`
          *,
          meals (
            calories,
            carbs,
            protein,
            fiber,
            fat
          )
        `)
        .eq('user_id', currentUserId.value)
        .gte('meal_date', previousWeek.start)
        .lte('meal_date', previousWeek.end);
      
      if (previousError) {
        console.error('Error fetching previous week meals:', previousError);
      } else {
        previousWeekMeals = prevData || [];
      }
    }
    
    // Process current week
    const currentSummary = processWeekData(currentWeekMeals || [], currentWeek);
    currentWeekSummary.value = currentSummary;
    
    // Process previous week
    if (previousWeek) {
      const previousSummary = processWeekData(previousWeekMeals, previousWeek);
      previousWeekSummary.value = previousSummary;
    }
    
    // Prepare chart data
    prepareChartData(currentWeekMeals || [], currentWeek);
    
    // Save to database
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


const daysPassedForMealType = computed(() => {
  if (!currentWeekSummary.value) return 0;
  return Math.floor((currentWeekSummary.value.possibleMealsSoFar || 0) / 3);
});

//Process week data
const processWeekData = (meals, weekBounds) => {
  const dailyData = {};
  
  //Track meal types
  const mealsByType = {
    breakfast: 0,
    lunch: 0,
    dinner: 0
  };
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekBounds.start);
    date.setDate(date.getDate() + i);
    const dateStr = getLocalDateString(date);
    
    const dayLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    dailyData[dateStr] = {
      day: dayLabel,
      dayNumber: i + 1,
      calories: 0,
      carbs: 0,
      protein: 0,
      fiber: 0,
      fat: 0,
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
      
      // NEW: Count by meal type
      if (meal.meal_type) {
        const mealType = meal.meal_type.toLowerCase();
        if (mealsByType.hasOwnProperty(mealType)) {
          mealsByType[mealType]++;
        }
      }
    }
  });
  
  let totalCalories = 0;
  let totalCarbs = 0;
  let totalMealsCompleted = 0;
  let balancedDaysCount = 0;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = getLocalDateString(today);
  
  let daysPassedCount = 0;
  let mealsFromPastDays = 0;
  
  Object.entries(dailyData).forEach(([dateStr, day]) => {
    // FIXED: Only count days BEFORE today
    if (dateStr < todayStr) {
      daysPassedCount++;
      mealsFromPastDays += day.mealsCompleted;
    }
    
    totalCalories += day.calories;
    totalCarbs += day.carbs;
    totalMealsCompleted += day.mealsCompleted;
    
    if (day.mealsCompleted > 0) {
      const dayScore = calculateBalancedScore(day);
      if (dayScore >= 70) balancedDaysCount++;
    }
  });
  
  const totalPossibleMeals = 21;
  const possibleMealsSoFar = daysPassedCount * 3;
  const skippedMeals = Math.max(0, possibleMealsSoFar - mealsFromPastDays);
  
  const mealCompletionRate = totalPossibleMeals > 0 ? (totalMealsCompleted / totalPossibleMeals) : 0;
  const balancedMealScore = Math.round((balancedDaysCount / 7) * 100);
  
  return {
    totalCalories: Math.round(totalCalories),
    avgDailyCalories: Math.round(totalCalories / 7),
    totalCarbs: Math.round(totalCarbs),
    avgDailyCarbs: Math.round(totalCarbs / 7),
    mealCompletionRate: Math.round(mealCompletionRate * 100),
    balancedMealScore,
    totalMealsCompleted,
    skippedMeals,
    possibleMealsSoFar,
    mealsByType,  
    dailyData
  };
};
// NEW: Prepare chart data
const prepareChartData = (meals, weekBounds) => {
  const caloriesData = [];
  const carbsData = [];
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekBounds.start);
    date.setDate(date.getDate() + i);
    const dateStr = getLocalDateString(date);
    
    // Format as "Nov 19" or shorter "19" for chart
    const dayLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    const dayMeals = meals.filter(m => m.meal_date === dateStr);
    
    let dayCalories = 0;
    let dayCarbs = 0;
    
    dayMeals.forEach(meal => {
      if (meal.meals) {
        dayCalories += meal.meals.calories || 0;
        dayCarbs += meal.meals.carbs || 0;
      }
    });
    
    caloriesData.push({
      day: dayLabel,
      calories: Math.round(dayCalories)
    });
    
    carbsData.push({
      day: dayLabel,
      carbs: Math.round(dayCarbs),
      target: 165
    });
  }
  
  weeklyCaloriesData.value = caloriesData;
  weeklyCarbsData.value = carbsData;
};

// NEW: Save weekly summary to database
const saveWeeklySummary = async (summary, weekBounds) => {
  if (!currentUserId.value || !summary) return
  
  try {
    // Calculate comparison with previous week
    let comparisonData = {}
    if (previousWeekSummary.value) {
      const caloriesDiff = summary.avgDailyCalories - previousWeekSummary.value.avgDailyCalories
      const carbsDiff = summary.avgDailyCarbs - previousWeekSummary.value.avgDailyCarbs
      const completionDiff = summary.mealCompletionRate - previousWeekSummary.value.mealCompletionRate
      const balancedDiff = summary.balancedMealScore - previousWeekSummary.value.balancedMealScore
      
      comparisonData = {
        calories: {
          diff: caloriesDiff,
          percent: previousWeekSummary.value.avgDailyCalories > 0 
            ? ((caloriesDiff / previousWeekSummary.value.avgDailyCalories) * 100).toFixed(1)
            : 0
        },
        carbs: {
          diff: carbsDiff,
          percent: previousWeekSummary.value.avgDailyCarbs > 0
            ? ((carbsDiff / previousWeekSummary.value.avgDailyCarbs) * 100).toFixed(1)
            : 0
        },
        completion: {
          diff: completionDiff,
          percent: completionDiff.toFixed(1)
        },
        balanced: {
          diff: balancedDiff,
          percent: balancedDiff.toFixed(1)
        }
      }
    }
    
    const { error } = await supabase
      .from('weekly_nutrition_summary')
      .upsert({
        user_id: currentUserId.value,
        week_start_date: weekBounds.start,
        week_end_date: weekBounds.end,
        total_calories: summary.totalCalories,
        total_carbs: summary.totalCarbs,
        meal_completion_rate: summary.mealCompletionRate / 100, // Store as decimal
        balanced_meal_score: summary.balancedMealScore,
        comparison_vs_last_week: comparisonData,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,week_start_date,week_end_date'
      })
    
    if (error) {
      console.error('Error saving weekly summary:', error)
    } else {
      console.log('Weekly summary saved successfully')
    }
    
  } catch (err) {
    console.error('Error saving weekly summary:', err)
  }
}

// NEW: Computed week comparison
const weekComparison = computed(() => {
  if (!currentWeekSummary.value || !previousWeekSummary.value) {
    return null;
  }
  
  const current = currentWeekSummary.value;
  const previous = previousWeekSummary.value;
  
  const caloriesDiff = current.avgDailyCalories - previous.avgDailyCalories;
  const carbsDiff = current.avgDailyCarbs - previous.avgDailyCarbs;
  const completionDiff = current.mealCompletionRate - previous.mealCompletionRate;
  const balancedDiff = current.balancedMealScore - previous.balancedMealScore;
  
  return {
    calories: {
      current: current.avgDailyCalories,
      previous: previous.avgDailyCalories,
      diff: caloriesDiff,
      percent: previous.avgDailyCalories > 0 
        ? Math.abs((caloriesDiff / previous.avgDailyCalories) * 100).toFixed(1)
        : 0,
      direction: caloriesDiff >= 0 ? 'up' : 'down',
      isGood: Math.abs(caloriesDiff) < 100
    },
    carbs: {
      current: current.avgDailyCarbs,
      previous: previous.avgDailyCarbs,
      diff: carbsDiff,
      percent: previous.avgDailyCarbs > 0
        ? Math.abs((carbsDiff / previous.avgDailyCarbs) * 100).toFixed(1)
        : 0,
      direction: carbsDiff >= 0 ? 'up' : 'down',
      isGood: carbsDiff <= 0
    },
    completion: {
      current: current.mealCompletionRate,
      previous: previous.mealCompletionRate,
      diff: completionDiff,
      direction: completionDiff >= 0 ? 'up' : 'down',
      isGood: completionDiff >= 0,
      // NEW: Add meal counts
      completed: current.totalMealsCompleted,
      skipped: current.skippedMeals,
      possible: current.possibleMealsSoFar
    },
    balanced: {
      current: current.balancedMealScore,
      previous: previous.balancedMealScore,
      diff: balancedDiff,
      direction: balancedDiff >= 0 ? 'up' : 'down',
      isGood: balancedDiff >= 0
    }
  };
});
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

// Calculate which day should be selected based on today
const calculateSelectedDay = () => {
  if (!userLastSubmissionDate.value) return 1;
  
  const todayLocal = getLocalDateString();
  const todayIndex = generatedDays.value.findIndex(day => day.date === todayLocal);
  
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

// Get the date for the current selected day
const getCurrentSelectedDate = () => {
  if (!generatedDays.value.length || !currentDayInSequence.value) {
    return getLocalDateString();
  }
  
  const selectedDay = generatedDays.value.find(day => day.dayNumber === currentDayInSequence.value);
  return selectedDay ? selectedDay.date : getLocalDateString();
};

// Fetch completed meals from Supabase
const fetchCompletedMeals = async () => {
  if (!currentUserId.value) return;
  
  const selectedDate = getCurrentSelectedDate();
  
  try {
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

    const processedMeals = await Promise.all(completedMeals?.map(async (meal) => {
      let calories = 0;
      let mealName = meal.meal_name || 'Unknown Meal';

      if (meal.meals && meal.meals.calories) {
        calories = meal.meals.calories;
        mealName = meal.meals.name || meal.meal_name || 'Unknown Meal';
      } else {
        calories = meal.calories || 0;
      }

      return {
        ...meal,
        calories: calories,
        meal_name: mealName
      };
    }) || []);

    dbCompletedMeals.value = processedMeals;
    
    let totalCalories = 0;
    if (processedMeals && processedMeals.length > 0) {
      totalCalories = processedMeals.reduce((sum, meal) => {
        return sum + (meal.calories || 0);
      }, 0);
    }
    
    calculatedTotalCalories.value = totalCalories;
    
    const completedMealTypes = new Set();
    dbCompletedMeals.value.forEach(meal => {
      if (meal.meal_type) {
        completedMealTypes.add(meal.meal_type.toLowerCase());
      }
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
  if (calculatedTotalCalories.value > 0) {
    return calculatedTotalCalories.value;
  }
  
  if (dbProgressData.value && dbProgressData.value.calories_consumed !== null) {
    return dbProgressData.value.calories_consumed;
  }

  return 0;
});

// Computed progress
const todayProgress = computed(() => {
  if (dbCompletedMeals.value && dbCompletedMeals.value.length > 0) {
    const mealTypes = new Set();
    dbCompletedMeals.value.forEach(meal => {
      if (meal.meal_type) {
        mealTypes.add(meal.meal_type.toLowerCase());
      }
    });

    const totalMeals = 3;
    const completedMeals = mealTypes.size;
    const percentage = totalMeals > 0 ? Math.round((completedMeals / totalMeals) * 100) : 0;

    return {
      completed: completedMeals,
      total: totalMeals,
      percentage: percentage
    };
  }

  return {
    completed: 0,
    total: 3,
    percentage: 0
  }
});

// Generate meal status array
const completedMeals = computed(() => {
  const mealTypes = ['breakfast', 'lunch', 'dinner'];
  const mealNames = ['BREAKFAST', 'LUNCH', 'DINNER'];
  const colors = ['#e7f5d9', '#fff7d9', '#e7f5d9'];
  
  return mealTypes.map((type, index) => {
    const dbCompletion = dbCompletedMeals.value.find(meal => 
      meal.meal_type && meal.meal_type.toLowerCase() === type
    );
    
    if (dbCompletion) {
      let timeString = '---';
      
      // Try completed_at first, then fall back to created_at or updated_at
      const timestamp = dbCompletion.completed_at || dbCompletion.created_at || dbCompletion.updated_at;
      
      if (timestamp) {
        try {
          const completedDateTime = new Date(timestamp);
          
          // Check if date is valid
          if (!isNaN(completedDateTime.getTime())) {
            const dateStr = completedDateTime.toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric', 
              year: 'numeric' 
            });
            const timeStr = completedDateTime.toLocaleTimeString('en-US', { 
              hour: 'numeric', 
              minute: '2-digit',
              hour12: true 
            });
            timeString = `${dateStr} at ${timeStr}`;
          }
        } catch (e) {
          console.error('Error parsing date:', e);
        }
      }
      
      // Debug log to see what's in the data
      console.log('Meal completion data:', {
        meal_type: type,
        completed_at: dbCompletion.completed_at,
        created_at: dbCompletion.created_at,
        timestamp_used: timestamp
      });
      
      return {
        name: mealNames[index],
        status: 'Completed',
        time: timeString,
        color: colors[index],
        mealName: dbCompletion.meal_name,
        calories: dbCompletion.calories || 0
      };
    }
    
    return {
      name: mealNames[index],
      status: 'Not Started',
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

    dbProgressData.value = progressData && progressData.length > 0 ? progressData[0] : null;
  } catch (err) {
    console.error('Error fetching progress:', err);
  }
};

// Get current date display
const getCurrentDateDisplay = computed(() => {
  const selectedDate = getCurrentSelectedDate();
  const date = new Date(selectedDate + 'T00:00:00');
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric'
  });
});

// Get current day display
const getCurrentDayDisplay = computed(() => {
  return `Day ${currentDayInSequence.value}`;
});

// Format date range for display
const formatDateRange = (start, end) => {
  if (!start || !end) return '';
  const startDate = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  
  const options = { month: 'short', day: 'numeric' };
  return `${startDate.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}`;
};
// Updated onMounted function
onMounted(async () => {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) {
      router.push('/login');
      return;
    }

    const meta = data.user.user_metadata;
    const fullName = meta.full_name || 'User';
    userFirstName.value = fullName.split(' ')[0];
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
    
    // NEW: Fetch weekly summary
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
          <v-btn-toggle
            v-model="activeTab"
            mandatory
            rounded="lg"
            color="#5D8736"
            class="mb-4 d-flex"
            style="width: 100%; border: 1px solid #5D8736; border-radius: 10px;"
          >
            <v-btn value="daily" class="flex-grow-1 text-none" style="font-family: 'Syne', sans-serif;">
              <v-icon start>mdi-calendar-today</v-icon>
              Daily View
            </v-btn>
            <v-btn value="weekly" class="flex-grow-1 text-none" style="font-family: 'Syne', sans-serif;">
              <v-icon start>mdi-chart-line</v-icon>
              Weekly Summary
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

              <v-progress-linear 
                color="#66BB6A" 
                height="10" 
                :model-value="todayProgress.percentage" 
                striped
              />

              <div class="mt-2 font-weight-bold" style="font-family: 'Syne', sans-serif;">
                {{ todayProgress.percentage }}%
              </div>
            </v-card>
          </div>

          <!-- Meal Cards -->
          <v-container class="mt-4">
            <v-row>
              <v-col
                v-for="meal in completedMeals"
                :key="meal.name"
                cols="12"
                sm="4"
                md="4"
                lg="4"
              >
                <v-card
                  class="meal-progress-card px-4 py-4 d-flex flex-column h-100 text-center"
                  :color="meal.color"
                  rounded="lg"
                  elevation="2"
                >
                  <p class="mb-3 font-weight-bold text-h6" style="font-family: 'Syne', sans-serif;">
                    {{ meal.name }}
                  </p>
                  
                  <div class="d-flex align-center justify-center mb-2">
                    <v-icon 
                      small 
                      :color="meal.status === 'Completed' ? 'green' : 'orange'" 
                      class="mr-2"
                    >
                      {{ meal.status === 'Completed' ? 'mdi-check-circle' : 'mdi-progress-clock' }}
                    </v-icon>
                    <span class="font-weight-medium" :class="meal.status === 'Completed' ? 'text-green' : 'text-orange'" style="font-family: 'Syne', sans-serif;">
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
              
                <!-- Main Progress -->
                <div class="mb-4">
                  <div class="d-flex justify-space-between align-center mb-2">
                    <span class="text-body-1" style="font-family: 'Syne', sans-serif;">
                      Meals Completed This Week
                    </span>
                    <span class="text-h5 font-weight-bold" style="color: #5D8736; font-family: 'Syne', sans-serif;">
                      {{ currentWeekSummary?.totalMealsCompleted || 0 }} / 21
                    </span>
                  </div>
                  <v-progress-linear
                    :model-value="((currentWeekSummary?.totalMealsCompleted || 0) / 21) * 100"
                    color="#5D8736"
                    bg-color="#E8F5E9"
                    height="16"
                    rounded
                  />
                  <div class="text-caption text-grey-darken-1 mt-1" style="font-family: 'Syne', sans-serif;">
                    21 total meals (Breakfast, Lunch, Dinner × 7 days)
                  </div>
                </div>
                
                <!-- Completed vs Skipped -->
                <v-row>
                  <v-col cols="6">
                    <div class="d-flex align-center pa-3 rounded-lg" style="background-color: #E8F5E9;">
                      
                      <div>
                        <div class="text-h6 font-weight-bold text-center" style="color: #2E7D32; font-family: 'Syne', sans-serif;">
                          {{ currentWeekSummary?.totalMealsCompleted || 0 }}
                        </div>
                        <div class="text-caption text-center" style="font-family: 'Syne', sans-serif;">Marked as Completed</div>
                      </div>
                    </div>
                  </v-col>
                  
                  <v-col cols="6">
                    <div class="d-flex align-center pa-3 rounded-lg" style="background-color: #FFEBEE;">
                    
                      <div>
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

            <!-- Week-over-Week Comparison Cards -->
            <v-row v-if="weekComparison" class="mb-4">
              <v-col cols="12" sm="6" md="3">
                <v-card class="pa-4" elevation="2" rounded="lg">
                  <div class="d-flex align-center justify-space-between mb-2">
                    <span class="text-body-2 text-grey-darken-1" style="font-family: 'Syne', sans-serif;">Avg Daily Calories</span>
                    <v-chip 
                      :color="weekComparison.calories.isGood ? 'success' : 'warning'"
                      size="small"
                      class="font-weight-bold"
                    >
                      <v-icon size="small" class="mr-1">
                        {{ weekComparison.calories.direction === 'up' ? 'mdi-arrow-up' : 'mdi-arrow-down' }}
                      </v-icon>
                      {{ weekComparison.calories.percent }}%
                    </v-chip>
                  </div>
                  <div class="text-h4 font-weight-bold mb-1" style="color: #2C3E50; font-family: 'Syne', sans-serif;">
                    {{ weekComparison.calories.current }}
                  </div>
                  <div class="text-caption text-grey" style="font-family: 'Syne', sans-serif;">
                    Previous: {{ weekComparison.calories.previous }} kcal
                  </div>
                </v-card>
              </v-col>
              
              <v-col cols="12" sm="6" md="3">
                <v-card class="pa-4" elevation="2" rounded="lg">
                  <div class="d-flex align-center justify-space-between mb-2">
                    <span class="text-body-2 text-grey-darken-1" style="font-family: 'Syne', sans-serif;">Avg Daily Carbs</span>
                    <v-chip 
                      :color="weekComparison.carbs.isGood ? 'success' : 'warning'"
                      size="small"
                      class="font-weight-bold"
                    >
                      <v-icon size="small" class="mr-1">
                        {{ weekComparison.carbs.direction === 'up' ? 'mdi-arrow-up' : 'mdi-arrow-down' }}
                      </v-icon>
                      {{ weekComparison.carbs.percent }}%
                    </v-chip>
                  </div>
                  <div class="text-h4 font-weight-bold mb-1" style="color: #2C3E50; font-family: 'Syne', sans-serif;">
                    {{ weekComparison.carbs.current }}g
                  </div>
                  <div class="text-caption text-grey" style="font-family: 'Syne', sans-serif;">
                    Target: 165g daily
                  </div>
                </v-card>
              </v-col>
              
              <v-col cols="12" sm="6" md="3">
  <v-card class="pa-4" elevation="2" rounded="lg">
    <div class="d-flex align-center justify-space-between mb-2">
      <span class="text-body-2 text-grey-darken-1" style="font-family: 'Syne', sans-serif;">Meal Completion</span>
      <v-chip 
        :color="weekComparison.completion.isGood ? 'success' : 'warning'"
        size="small"
        class="font-weight-bold"
      >
        <v-icon size="small" class="mr-1">
          {{ weekComparison.completion.direction === 'up' ? 'mdi-arrow-up' : 'mdi-arrow-down' }}
        </v-icon>
        {{ Math.abs(weekComparison.completion.diff) }}%
      </v-chip>
    </div>
    <div class="text-h4 font-weight-bold mb-1" style="color: #2C3E50; font-family: 'Syne', sans-serif;">
      {{ weekComparison.completion.current }}%
    </div>
    
    <div class="text-caption text-grey mt-1" style="font-family: 'Syne', sans-serif;">
      Previous: {{ weekComparison.completion.previous }}%
    </div>
  </v-card>
</v-col>
              
              <v-col cols="12" sm="6" md="3">
                <v-card class="pa-4" elevation="2" rounded="lg">
                  <div class="d-flex align-center justify-space-between mb-2">
                    <span class="text-body-2 text-grey-darken-1" style="font-family: 'Syne', sans-serif;">Balanced Score</span>
                    <v-chip 
                      :color="weekComparison.balanced.isGood ? 'success' : 'warning'"
                      size="small"
                      class="font-weight-bold"
                    >
                      <v-icon size="small" class="mr-1">
                        {{ weekComparison.balanced.direction === 'up' ? 'mdi-arrow-up' : 'mdi-arrow-down' }}
                      </v-icon>
                      {{ Math.abs(weekComparison.balanced.diff) }}%
                    </v-chip>
                  </div>
                  <div class="text-h4 font-weight-bold mb-1" style="color: #2C3E50; font-family: 'Syne', sans-serif;">
                    {{ weekComparison.balanced.current }}%
                  </div>
                  <div class="text-caption text-grey" style="font-family: 'Syne', sans-serif;">
                    Previous: {{ weekComparison.balanced.previous }}%
                  </div>
                </v-card>
              </v-col>
            </v-row>

            <!-- Charts -->
            <v-row>
              <!-- Calorie Trend Chart -->
              <v-col cols="12" md="6">
                <v-card class="pa-4" elevation="2" rounded="lg">
                  <h3 class="text-h6 font-weight-bold mb-4" style="color: #2C3E50; font-family: 'Syne', sans-serif;">
                    <v-icon color="#EF7722" class="mr-2">mdi-fire</v-icon>
                    Weekly Calorie Trend
                  </h3>
                  <div class="chart-container">
                    <svg viewBox="0 0 400 200" class="bar-chart">
                      <g v-for="(data, index) in weeklyCaloriesData" :key="index">
                        <rect 
                          :x="20 + index * 50" 
                          :y="180 - (data.calories / 25)"
                          width="40" 
                          :height="data.calories / 25"
                          fill="#EF7722"
                          rx="4"
                        />
                        <text 
                          :x="40 + index * 50" 
                          y="195" 
                          text-anchor="middle" 
                          font-size="12"
                          fill="#666"
                          style="font-family: 'Syne', sans-serif;"
                        >
                          {{ data.day }}
                        </text>
                        <text 
                          :x="40 + index * 50" 
                          :y="175 - (data.calories / 25)"
                          text-anchor="middle" 
                          font-size="10"
                          fill="#2C3E50"
                          font-weight="bold"
                          style="font-family: 'Syne', sans-serif;"
                        >
                          {{ data.calories }}
                        </text>
                      </g>
                    </svg>
                  </div>
                </v-card>
              </v-col>

              <!-- Carbs Trend Chart -->
              <v-col cols="12" md="6">
                <v-card class="pa-4" elevation="2" rounded="lg">
                  <h3 class="text-h6 font-weight-bold mb-4" style="color: #2C3E50; font-family: 'Syne', sans-serif;">
                    <v-icon color="#B87C4C" class="mr-2">mdi-barley</v-icon>
                    Weekly Carbohydrate Trend
                  </h3>
                  <div class="chart-container">
                    <svg viewBox="0 0 400 200" class="line-chart">
                      <!-- Target line -->
                      <line 
                        x1="20" 
                        y1="100" 
                        x2="380" 
                        y2="100" 
                        stroke="#9CA3AF" 
                        stroke-width="2" 
                        stroke-dasharray="5,5"
                      />
                      <text x="385" y="105" font-size="10" fill="#9CA3AF" style="font-family: 'Syne', sans-serif;">
                        165g
                      </text>
                      
                      <!-- Data line -->
                      <polyline 
                        :points="weeklyCarbsData.map((d, i) => `${40 + i * 50},${180 - d.carbs}`).join(' ')"
                        fill="none" 
                        stroke="#B87C4C" 
                        stroke-width="3"
                      />
                      
                      <!-- Data points -->
                      <g v-for="(data, index) in weeklyCarbsData" :key="index">
                        <circle 
                          :cx="40 + index * 50" 
                          :cy="180 - data.carbs"
                          r="5" 
                          fill="#B87C4C"
                        />
                        <text 
                          :x="40 + index * 50" 
                          y="195" 
                          text-anchor="middle" 
                          font-size="12"
                          fill="#666"
                          style="font-family: 'Syne', sans-serif;"
                        >
                          {{ data.day }}
                        </text>
                        <text 
                          :x="40 + index * 50" 
                          :y="170 - data.carbs"
                          text-anchor="middle" 
                          font-size="10"
                          fill="#2C3E50"
                          font-weight="bold"
                          style="font-family: 'Syne', sans-serif;"
                        >
                          {{ data.carbs }}g
                        </text>
                      </g>
                    </svg>
                  </div>
                </v-card>
              </v-col>
            </v-row>

            <!-- Info Alert -->
            <v-alert
              type="info"
              variant="tonal"
              class="mt-4"
              rounded="lg"
            >
              <div style="font-family: 'Syne', sans-serif;">
                <strong>Balanced Meal Score</strong> is calculated based on adequate protein (≥60g), 
                fiber (≥20g), and carbs within target range (130-180g) per day.
              </div>
            </v-alert>

            <!-- No Data Message -->
            <v-alert
              v-if="!weekComparison"
              type="warning"
              variant="tonal"
              class="mt-4"
              rounded="lg"
            >
              <div style="font-family: 'Syne', sans-serif;">
                Complete more meals this week to see your weekly progress comparison!
              </div>
            </v-alert>
          </v-container>
        </div>

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