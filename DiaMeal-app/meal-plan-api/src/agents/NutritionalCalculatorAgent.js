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

export default NutritionalCalculatorAgent