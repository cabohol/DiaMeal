// agents/DiabetesAnalysisAgent.js

class DiabetesAnalysisAgent {
  /**
   * Calculates glycemic load based on ingredients and portions
   * @param {Array} ingredients - Array of ingredient objects with carbs and GI data
   * @param {Array} portions - Array of portion multipliers
   * @returns {number} Total glycemic load rounded to 1 decimal place
   */
  static calculateGlycemicLoad(ingredients, portions) {
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

  /**
   * Analyzes lab results to determine diabetes severity and dietary restrictions
   * @param {Object} labResults - Lab results object with hba1c, fbs, ppbs, glucose_tolerance
   * @returns {Object} Analysis with severity, recommendations, limits, and risk factors
   */
  static analyzeLabResults(labResults) {
    const analysis = {
      severity: 'normal',
      recommendations: [],
      carbLimit: 45, // grams per meal (default)
      caloryLimit: 600, // calories per meal (default)
      riskFactors: [],
      glucoseThresholds: {
        pre_meal: 80,
        post_meal: 140,
        bedtime: 100
      }
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
        analysis.recommendations.push('Consider frequent glucose monitoring')
        analysis.recommendations.push('Prioritize low-glycemic foods only')
        analysis.riskFactors.push('high_hba1c')
      } else if (hba1c >= 8) {
        analysis.severity = 'moderate'
        analysis.carbLimit = 35
        analysis.caloryLimit = 500
        analysis.recommendations.push('Elevated HbA1c needs moderate carb restriction')
        analysis.recommendations.push('Focus on complex carbohydrates')
        analysis.riskFactors.push('moderate_hba1c')
      } else if (hba1c >= 6.5) {
        analysis.severity = 'mild'
        analysis.carbLimit = 40
        analysis.caloryLimit = 550
        analysis.recommendations.push('Mildly elevated HbA1c requires careful monitoring')
        analysis.recommendations.push('Maintain consistent meal timing')
      } else if (hba1c >= 5.7) {
        analysis.severity = 'prediabetic'
        analysis.carbLimit = 45
        analysis.recommendations.push('Pre-diabetic range - focus on prevention')
      }
    }

    // Fasting Blood Sugar Analysis (mg/dL)
    if (fbs) {
      if (fbs >= 200) {
        analysis.riskFactors.push('very_high_fbs')
        analysis.recommendations.push('Dangerously high fasting glucose - minimize fast carbs')
        analysis.recommendations.push('Consider splitting meals into smaller portions')
      } else if (fbs >= 140) {
        analysis.riskFactors.push('high_fbs')
        analysis.recommendations.push('High fasting glucose - avoid simple sugars')
        analysis.recommendations.push('Include protein with every meal')
      } else if (fbs >= 110) {
        analysis.recommendations.push('Elevated fasting glucose - prefer complex carbs')
        analysis.recommendations.push('Consider intermittent fasting windows')
      }
    }

    // Post-prandial Blood Sugar Analysis (mg/dL)
    if (ppbs) {
      if (ppbs >= 250) {
        analysis.riskFactors.push('very_high_ppbs')
        analysis.recommendations.push('Extreme post-meal spikes - strict portion control needed')
        analysis.recommendations.push('Consider pre-meal fiber supplementation')
      } else if (ppbs >= 200) {
        analysis.riskFactors.push('high_ppbs')
        analysis.recommendations.push('High post-meal glucose - limit meal portions')
        analysis.recommendations.push('Add 10-minute walk after meals')
      }
    }

    // Glucose Tolerance Test Analysis
    if (glucose_tolerance) {
      if (glucose_tolerance >= 200) {
        analysis.recommendations.push('Impaired glucose tolerance - avoid refined carbs')
      }
    }

    return analysis
  }

  /**
   * Determines meal timing recommendations based on diabetes severity
   * @param {Object} diabetesAnalysis - Result from analyzeLabResults
   * @returns {Object} Meal timing recommendations
   */
  static getMealTimingRecommendations(diabetesAnalysis) {
    const timing = {
      mealsPerDay: 3,
      snacksAllowed: 2,
      maxMealGap: 6, // hours
      fastingWindow: 12 // hours
    }

    if (diabetesAnalysis.severity === 'severe') {
      timing.mealsPerDay = 6
      timing.snacksAllowed = 3
      timing.maxMealGap = 3
      timing.fastingWindow = 10
    } else if (diabetesAnalysis.severity === 'moderate') {
      timing.mealsPerDay = 4
      timing.snacksAllowed = 2
      timing.maxMealGap = 4
      timing.fastingWindow = 11
    }

    return timing
  }

  /**
   * Calculates personalized glucose targets based on age, diabetes type, and complications
   * @param {number} age - Patient age
   * @param {string} diabetesType - Type 1, Type 2, or Gestational
   * @param {Array} complications - Array of diabetes complications
   * @returns {Object} Personalized glucose targets
   */
  static getPersonalizedGlucoseTargets(age, diabetesType, complications = []) {
    let targets = {
      fasting: { min: 80, max: 130 },
      postMeal: { min: 80, max: 180 },
      bedtime: { min: 100, max: 140 },
      hba1c: { target: 7.0 }
    }

    // Age-based adjustments
    if (age > 65) {
      targets.hba1c.target = 7.5
      targets.fasting.max = 140
      targets.postMeal.max = 200
    } else if (age < 25) {
      targets.hba1c.target = 6.5
      targets.fasting.max = 120
    }

    // Diabetes type adjustments
    if (diabetesType === 'Type 1') {
      targets.fasting.min = 70
      targets.postMeal.max = 160
    }

    // Complications adjustments
    if (complications.includes('cardiovascular')) {
      targets.hba1c.target = 6.5
    }

    return targets
  }
}

export default DiabetesAnalysisAgent