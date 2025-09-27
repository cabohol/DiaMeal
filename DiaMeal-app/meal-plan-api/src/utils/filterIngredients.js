// utils/filterIngredients.js
// Utility functions for filtering ingredients based on constraints

/**
 * Filters ingredients based on allergies, religious diets, and availability
 * @param {Array} ingredients - Array of ingredient objects
 * @param {Array} allergies - Array of allergy strings
 * @param {Array} religiousDiets - Array of religious diet strings
 * @param {string} diabetesType - Type of diabetes
 * @returns {Array} Filtered ingredients array
 */
export function filterIngredientsByConstraints(ingredients, allergies = [], religiousDiets = [], diabetesType = null) {
  return ingredients.filter((ingredient) => {
    // Check availability first
    if (ingredient.availability === 'unavailable') {
      return false
    }

    // Check allergies
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

    // Check religious dietary restrictions
    for (const diet of religiousDiets) {
      switch (diet.toLowerCase()) {
        case 'halal':
          if (!ingredient.is_halal) return false
          break
        case 'kosher':
          if (!ingredient.is_kosher) return false
          break
        case 'catholic':
          if (!ingredient.is_catholic) return false
          break
        case 'vegetarian':
          if (!ingredient.is_vegetarian) return false
          break
        case 'vegan':
          if (!ingredient.is_vegan) return false
          break
      }
    }

    // Additional diabetes-specific filtering
    if (diabetesType) {
      // For severe diabetes cases, filter out very high carb ingredients
      const carbs = ingredient.carbs_grams || 0
      if (diabetesType === 'severe' && carbs > 30) {
        return false
      }
      
      // Filter out ingredients with very high glycemic index for diabetes
      const gi = ingredient.glycemic_index || 50
      if (gi > 85 && carbs > 10) {
        return false
      }
    }

    return true
  })
}

/**
 * Filters ingredients by category
 * @param {Array} ingredients - Array of ingredient objects
 * @param {string|Array} categories - Category or array of categories to include
 * @returns {Array} Filtered ingredients
 */
export function filterByCategory(ingredients, categories) {
  const categoryArray = Array.isArray(categories) ? categories : [categories]
  return ingredients.filter(ingredient => 
    categoryArray.includes(ingredient.category)
  )
}

/**
 * Filters ingredients by nutritional criteria
 * @param {Array} ingredients - Array of ingredient objects
 * @param {Object} criteria - Nutritional criteria object
 * @returns {Array} Filtered ingredients
 */
export function filterByNutrition(ingredients, criteria = {}) {
  const {
    maxCarbs,
    minProtein,
    minFiber,
    maxSodium,
    maxGlycemicIndex,
    diabeticFriendlyOnly
  } = criteria

  return ingredients.filter(ingredient => {
    if (maxCarbs && (ingredient.carbs_grams || 0) > maxCarbs) return false
    if (minProtein && (ingredient.protein_grams || 0) < minProtein) return false
    if (minFiber && (ingredient.fiber_grams || 0) < minFiber) return false
    if (maxSodium && (ingredient.sodium_mg || 0) > maxSodium) return false
    if (maxGlycemicIndex && (ingredient.glycemic_index || 50) > maxGlycemicIndex) return false
    if (diabeticFriendlyOnly && !ingredient.is_diabetic_friendly) return false
    
    return true
  })
}

/**
 * Filters ingredients by budget constraints
 * @param {Array} ingredients - Array of ingredient objects
 * @param {string} budgetLevel - 'low', 'medium', or 'high'
 * @returns {Array} Filtered ingredients
 */
export function filterByBudget(ingredients, budgetLevel) {
  const budgetThresholds = {
    low: 2.0,      // Max $2 per serving
    medium: 4.0,   // Max $4 per serving
    high: Infinity // No limit
  }
  
  const maxCost = budgetThresholds[budgetLevel] || budgetThresholds.medium
  
  return ingredients.filter(ingredient => 
    (ingredient.cost_per_serving || 1) <= maxCost
  )
}

/**
 * Filters ingredients by search term
 * @param {Array} ingredients - Array of ingredient objects
 * @param {string} searchTerm - Search term to match against name
 * @returns {Array} Filtered ingredients
 */
export function filterBySearch(ingredients, searchTerm) {
  if (!searchTerm || searchTerm.trim() === '') return ingredients
  
  const term = searchTerm.toLowerCase().trim()
  return ingredients.filter(ingredient => 
    ingredient.name.toLowerCase().includes(term) ||
    (ingredient.category || '').toLowerCase().includes(term) ||
    (ingredient.common_names || []).some(name => name.toLowerCase().includes(term))
  )
}

/**
 * Advanced filtering with multiple criteria
 * @param {Array} ingredients - Array of ingredient objects
 * @param {Object} filters - Filter criteria object
 * @returns {Array} Filtered ingredients
 */
export function advancedFilter(ingredients, filters = {}) {
  const {
    allergies = [],
    religiousDiets = [],
    diabetesType,
    categories,
    nutrition,
    budget,
    searchTerm,
    availability = ['available', 'seasonal'],
    sortBy = 'name',
    sortOrder = 'asc'
  } = filters

  let filtered = ingredients

  // Apply basic constraints
  filtered = filterIngredientsByConstraints(filtered, allergies, religiousDiets, diabetesType)

  // Apply availability filter
  if (availability && availability.length > 0) {
    filtered = filtered.filter(ingredient => 
      availability.includes(ingredient.availability)
    )
  }

  // Apply category filter
  if (categories) {
    filtered = filterByCategory(filtered, categories)
  }

  // Apply nutritional filters
  if (nutrition) {
    filtered = filterByNutrition(filtered, nutrition)
  }

  // Apply budget filter
  if (budget) {
    filtered = filterByBudget(filtered, budget)
  }

  // Apply search filter
  if (searchTerm) {
    filtered = filterBySearch(filtered, searchTerm)
  }

  // Apply sorting
  filtered = sortIngredients(filtered, sortBy, sortOrder)

  return filtered
}

/**
 * Sorts ingredients by specified criteria
 * @param {Array} ingredients - Array of ingredient objects
 * @param {string} sortBy - Field to sort by
 * @param {string} sortOrder - 'asc' or 'desc'
 * @returns {Array} Sorted ingredients
 */
export function sortIngredients(ingredients, sortBy = 'name', sortOrder = 'asc') {
  const sorted = [...ingredients].sort((a, b) => {
    let valueA, valueB

    switch (sortBy) {
      case 'name':
        valueA = (a.name || '').toLowerCase()
        valueB = (b.name || '').toLowerCase()
        break
      case 'category':
        valueA = (a.category || '').toLowerCase()
        valueB = (b.category || '').toLowerCase()
        break
      case 'calories':
        valueA = a.calories_per_serving || 0
        valueB = b.calories_per_serving || 0
        break
      case 'protein':
        valueA = a.protein_grams || 0
        valueB = b.protein_grams || 0
        break
      case 'carbs':
        valueA = a.carbs_grams || 0
        valueB = b.carbs_grams || 0
        break
      case 'fiber':
        valueA = a.fiber_grams || 0
        valueB = b.fiber_grams || 0
        break
      case 'cost':
        valueA = a.cost_per_serving || 0
        valueB = b.cost_per_serving || 0
        break
      case 'glycemic_index':
        valueA = a.glycemic_index || 50
        valueB = b.glycemic_index || 50
        break
      case 'diabetic_friendly':
        valueA = a.is_diabetic_friendly ? 1 : 0
        valueB = b.is_diabetic_friendly ? 1 : 0
        break
      default:
        valueA = a[sortBy] || ''
        valueB = b[sortBy] || ''
    }

    if (typeof valueA === 'string' && typeof valueB === 'string') {
      return sortOrder === 'asc' 
        ? valueA.localeCompare(valueB)
        : valueB.localeCompare(valueA)
    } else {
      return sortOrder === 'asc' 
        ? valueA - valueB
        : valueB - valueA
    }
  })

  return sorted
}

/**
 * Groups ingredients by category
 * @param {Array} ingredients - Array of ingredient objects
 * @returns {Object} Ingredients grouped by category
 */
export function groupByCategory(ingredients) {
  return ingredients.reduce((groups, ingredient) => {
    const category = ingredient.category || 'Other'
    if (!groups[category]) {
      groups[category] = []
    }
    groups[category].push(ingredient)
    return groups
  }, {})
}

/**
 * Finds ingredients that are suitable substitutes for a given ingredient
 * @param {Object} targetIngredient - The ingredient to find substitutes for
 * @param {Array} allIngredients - All available ingredients
 * @param {Object} constraints - Dietary constraints
 * @returns {Array} Array of suitable substitute ingredients
 */
export function findSubstitutes(targetIngredient, allIngredients, constraints = {}) {
  if (!targetIngredient) return []

  const substitutes = allIngredients.filter(ingredient => {
    // Don't include the original ingredient
    if (ingredient.id === targetIngredient.id) return false

    // Must be in same category or compatible category
    const compatibleCategories = getCompatibleCategories(targetIngredient.category)
    if (!compatibleCategories.includes(ingredient.category)) return false

    // Must meet dietary constraints
    if (constraints.allergies || constraints.religiousDiets) {
      const filtered = filterIngredientsByConstraints(
        [ingredient], 
        constraints.allergies || [], 
        constraints.religiousDiets || []
      )
      if (filtered.length === 0) return false
    }

    // Similar nutritional profile (within reasonable ranges)
    const targetCalories = targetIngredient.calories_per_serving || 0
    const ingredientCalories = ingredient.calories_per_serving || 0
    if (Math.abs(targetCalories - ingredientCalories) > targetCalories * 0.5) return false

    return true
  })

  // Sort by nutritional similarity
  return substitutes.sort((a, b) => {
    const similarityA = calculateNutritionalSimilarity(targetIngredient, a)
    const similarityB = calculateNutritionalSimilarity(targetIngredient, b)
    return similarityB - similarityA
  }).slice(0, 5) // Return top 5 substitutes
}

/**
 * Gets categories that are compatible for substitution
 * @param {string} category - Original category
 * @returns {Array} Array of compatible categories
 */
function getCompatibleCategories(category) {
  const categoryMap = {
    'Protein': ['Protein', 'Fish', 'Seafood', 'Legumes'],
    'Fish': ['Fish', 'Seafood', 'Protein'],
    'Seafood': ['Seafood', 'Fish', 'Protein'],
    'Vegetables': ['Vegetables', 'Leafy Greens'],
    'Leafy Greens': ['Leafy Greens', 'Vegetables'],
    'Fruits': ['Fruits'],
    'Grains': ['Grains', 'Starches'],
    'Starches': ['Starches', 'Grains'],
    'Dairy': ['Dairy'],
    'Nuts': ['Nuts', 'Seeds'],
    'Seeds': ['Seeds', 'Nuts'],
    'Oils': ['Oils', 'Fats'],
    'Fats': ['Fats', 'Oils'],
    'Herbs': ['Herbs', 'Spices'],
    'Spices': ['Spices', 'Herbs'],
    'Legumes': ['Legumes', 'Protein']
  }

  return categoryMap[category] || [category]
}

/**
 * Calculates nutritional similarity between two ingredients
 * @param {Object} ingredient1 - First ingredient
 * @param {Object} ingredient2 - Second ingredient
 * @returns {number} Similarity score (0-100)
 */
function calculateNutritionalSimilarity(ingredient1, ingredient2) {
  const metrics = ['calories_per_serving', 'protein_grams', 'carbs_grams', 'fat_grams', 'fiber_grams']
  let totalSimilarity = 0
  let validMetrics = 0

  metrics.forEach(metric => {
    const value1 = ingredient1[metric] || 0
    const value2 = ingredient2[metric] || 0
    
    if (value1 > 0 || value2 > 0) {
      const maxValue = Math.max(value1, value2)
      const minValue = Math.min(value1, value2)
      const similarity = maxValue > 0 ? (minValue / maxValue) * 100 : 100
      totalSimilarity += similarity
      validMetrics++
    }
  })

  return validMetrics > 0 ? totalSimilarity / validMetrics : 0
}

/**
 * Validates ingredient data completeness and quality
 * @param {Array} ingredients - Array of ingredient objects
 * @returns {Object} Validation report
 */
export function validateIngredientData(ingredients) {
  const report = {
    total: ingredients.length,
    valid: 0,
    warnings: [],
    errors: [],
    missingData: {
      nutritionInfo: 0,
      costInfo: 0,
      dietaryFlags: 0,
      categories: 0
    }
  }

  ingredients.forEach((ingredient, index) => {
    let isValid = true
    const warnings = []

    // Check required fields
    if (!ingredient.name || ingredient.name.trim() === '') {
      report.errors.push(`Ingredient at index ${index}: Missing name`)
      isValid = false
    }

    if (!ingredient.category) {
      report.missingData.categories++
      warnings.push('Missing category')
    }

    // Check nutritional data
    const nutritionFields = ['calories_per_serving', 'protein_grams', 'carbs_grams', 'fat_grams']
    const missingNutrition = nutritionFields.filter(field => 
      ingredient[field] === undefined || ingredient[field] === null
    )

    if (missingNutrition.length > 2) {
      report.missingData.nutritionInfo++
      warnings.push('Incomplete nutritional information')
    }

    // Check cost information
    if (!ingredient.cost_per_serving) {
      report.missingData.costInfo++
      warnings.push('Missing cost information')
    }

    // Check dietary flags
    const dietaryFlags = ['is_diabetic_friendly', 'is_vegetarian', 'is_vegan', 'is_halal', 'is_kosher', 'is_catholic']
    const missingFlags = dietaryFlags.filter(flag => 
      ingredient[flag] === undefined || ingredient[flag] === null
    )

    if (missingFlags.length > 3) {
      report.missingData.dietaryFlags++
      warnings.push('Missing dietary restriction flags')
    }

    if (warnings.length > 0) {
      report.warnings.push(`Ingredient "${ingredient.name || 'Unknown'}": ${warnings.join(', ')}`)
    }

    if (isValid) report.valid++
  })

  report.completeness = (report.valid / report.total) * 100

  return report
}

export default {
  filterIngredientsByConstraints,
  filterByCategory,
  filterByNutrition,
  filterByBudget,
  filterBySearch,
  advancedFilter,
  sortIngredients,
  groupByCategory,
  findSubstitutes,
  validateIngredientData
}