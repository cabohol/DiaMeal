// agents/MealCompositionAgent.js

import IngredientScoringAgent from './IngredientScoringAgent.js'

class MealCompositionAgent {
  /**
   * Generates optimal meal structure based on constraints and targets
   * @param {string} mealType - 'breakfast', 'lunch', 'dinner', or 'snack'
   * @param {Object} macroTargets - Macro nutrient targets from NutritionalCalculatorAgent
   * @param {Array} availableIngredients - Array of available ingredients
   * @param {Object} constraints - Constraints including diabetes analysis, budget, etc.
   * @returns {Object} Meal structure with selected ingredients
   */
  static generateMealStructure(mealType, macroTargets, availableIngredients, constraints) {
    const structure = {
      mealType,
      targetNutrition: macroTargets,
      composition: {
        primaryProtein: null,
        secondaryProtein: null,
        primaryCarb: null,
        secondaryCarb: null,
        vegetables: [],
        healthyFats: null,
        flavor: null,
        fiber: null
      },
      nutritionBreakdown: {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
        glycemicLoad: 0
      },
      portions: {},
      cookingMethod: null,
      difficulty: 'easy'
    }

    const categorizedIngredients = this.categorizeIngredients(availableIngredients)
    const scoredIngredients = this.scoreAndRankIngredients(availableIngredients, constraints)

    // Generate meal composition based on type
    switch (mealType) {
      case 'breakfast':
        this.composeBreakfast(structure, categorizedIngredients, scoredIngredients, macroTargets, constraints)
        break
      case 'lunch':
        this.composeLunch(structure, categorizedIngredients, scoredIngredients, macroTargets, constraints)
        break
      case 'dinner':
        this.composeDinner(structure, categorizedIngredients, scoredIngredients, macroTargets, constraints)
        break
      case 'snack':
        this.composeSnack(structure, categorizedIngredients, scoredIngredients, macroTargets, constraints)
        break
    }

    // Calculate final nutrition and portions
    this.calculatePortions(structure, macroTargets)
    this.calculateNutrition(structure)
    this.selectCookingMethod(structure, constraints)

    return structure
  }

  /**
   * Categorizes ingredients by type for easier selection
   * @param {Array} ingredients - Array of ingredient objects
   * @returns {Object} Categorized ingredients
   */
  static categorizeIngredients(ingredients) {
    return {
      protein: {
        lean: ingredients.filter(i => i.category === 'Protein' && (i.fat_grams || 0) < 5),
        fatty: ingredients.filter(i => i.category === 'Protein' && (i.fat_grams || 0) >= 5),
        plant: ingredients.filter(i => (i.category === 'Legumes' || i.category === 'Nuts') && (i.protein_grams || 0) > 10),
        fish: ingredients.filter(i => i.category === 'Fish' || i.category === 'Seafood'),
        eggs: ingredients.filter(i => i.name.toLowerCase().includes('egg')),
        dairy: ingredients.filter(i => i.category === 'Dairy' && (i.protein_grams || 0) > 5)
      },
      carbohydrates: {
        grains: ingredients.filter(i => i.category === 'Grains' || i.category === 'Starches'),
        wholegrain: ingredients.filter(i => (i.category === 'Grains' || i.category === 'Starches') && 
                                            (i.fiber_grams || 0) > 2),
        starchy_veg: ingredients.filter(i => i.category === 'Vegetables' && (i.carbs_grams || 0) > 15),
        legumes: ingredients.filter(i => i.category === 'Legumes')
      },
      vegetables: {
        leafy: ingredients.filter(i => i.category === 'Leafy Greens' || i.name.toLowerCase().includes('lettuce') || 
                                      i.name.toLowerCase().includes('spinach')),
        cruciferous: ingredients.filter(i => ['broccoli', 'cauliflower', 'cabbage', 'brussels sprouts']
                                            .some(v => i.name.toLowerCase().includes(v))),
        colorful: ingredients.filter(i => i.category === 'Vegetables' && 
                                         ['red', 'orange', 'yellow', 'purple'].some(c => i.name.toLowerCase().includes(c))),
        low_carb: ingredients.filter(i => i.category === 'Vegetables' && (i.carbs_grams || 0) < 5),
        high_fiber: ingredients.filter(i => i.category === 'Vegetables' && (i.fiber_grams || 0) > 3)
      },
      fats: {
        oils: ingredients.filter(i => i.category === 'Oils'),
        nuts: ingredients.filter(i => i.category === 'Nuts'),
        seeds: ingredients.filter(i => i.category === 'Seeds'),
        avocado: ingredients.filter(i => i.name.toLowerCase().includes('avocado')),
        olives: ingredients.filter(i => i.name.toLowerCase().includes('olive'))
      },
      fruits: {
        low_sugar: ingredients.filter(i => i.category === 'Fruits' && (i.carbs_grams || 0) < 10),
        berries: ingredients.filter(i => i.category === 'Fruits' && 
                                        ['berry', 'berries', 'strawberry', 'blueberry', 'raspberry']
                                        .some(b => i.name.toLowerCase().includes(b))),
        citrus: ingredients.filter(i => i.category === 'Fruits' && 
                                       ['lemon', 'lime', 'orange', 'grapefruit'].some(c => i.name.toLowerCase().includes(c)))
      },
      flavor: {
        herbs: ingredients.filter(i => i.category === 'Herbs'),
        spices: ingredients.filter(i => i.category === 'Spices'),
        aromatics: ingredients.filter(i => ['onion', 'garlic', 'ginger', 'shallot']
                                           .some(a => i.name.toLowerCase().includes(a)))
      }
    }
  }

  /**
   * Scores and ranks all ingredients for selection
   * @param {Array} ingredients - Available ingredients
   * @param {Object} constraints - Meal constraints
   * @returns {Array} Ingredients with scores, sorted by overall score
   */
  static scoreAndRankIngredients(ingredients, constraints) {
    return ingredients
      .map(ingredient => ({
        ...ingredient,
        scoringProfile: IngredientScoringAgent.createScoringProfile(ingredient, constraints)
      }))
      .sort((a, b) => b.scoringProfile.overallScore - a.scoringProfile.overallScore)
  }

  /**
   * Composes breakfast meal structure
   * @param {Object} structure - Meal structure to populate
   * @param {Object} categorized - Categorized ingredients
   * @param {Array} scored - Scored ingredients
   * @param {Object} targets - Macro targets
   * @param {Object} constraints - Constraints
   */
  static composeBreakfast(structure, categorized, scored, targets, constraints) {
    const { diabetesAnalysis } = constraints

    // Primary protein for breakfast stability
    structure.composition.primaryProtein = this.selectBestFrom([
      ...categorized.protein.eggs,
      ...categorized.protein.dairy,
      ...categorized.protein.lean
    ], scored, 1)[0]

    // Breakfast carb - prefer high fiber, lower GI
    if (diabetesAnalysis.severity !== 'severe') {
      structure.composition.primaryCarb = this.selectBestFrom([
        ...categorized.carbohydrates.wholegrain.filter(g => 
          g.name.toLowerCase().includes('oat') || 
          g.name.toLowerCase().includes('quinoa') ||
          g.breakfast_suitable !== false
        )
      ], scored, 1)[0]
    }

    // Breakfast vegetables (optional)
    structure.composition.vegetables = this.selectBestFrom([
      ...categorized.vegetables.low_carb,
      ...categorized.flavor.aromatics
    ], scored, 1)

    // Healthy fat
    structure.composition.healthyFats = this.selectBestFrom([
      ...categorized.fats.nuts,
      ...categorized.fats.seeds,
      ...categorized.fats.avocado
    ], scored, 1)[0]

    // Low-sugar fruit if diabetes allows
    if (diabetesAnalysis.severity === 'normal' || diabetesAnalysis.severity === 'mild') {
      structure.composition.fiber = this.selectBestFrom([
        ...categorized.fruits.berries,
        ...categorized.fruits.low_sugar
      ], scored, 1)[0]
    }

    structure.difficulty = 'easy'
  }

  /**
   * Composes lunch meal structure
   * @param {Object} structure - Meal structure to populate
   * @param {Object} categorized - Categorized ingredients
   * @param {Array} scored - Scored ingredients
   * @param {Object} targets - Macro targets
   * @param {Object} constraints - Constraints
   */
  static composeLunch(structure, categorized, scored, targets, constraints) {
    // Balanced protein
    structure.composition.primaryProtein = this.selectBestFrom([
      ...categorized.protein.lean,
      ...categorized.protein.fish,
      ...categorized.protein.plant
    ], scored, 1)[0]

    // Complex carbohydrate
    structure.composition.primaryCarb = this.selectBestFrom([
      ...categorized.carbohydrates.wholegrain,
      ...categorized.carbohydrates.legumes,
      ...categorized.carbohydrates.starchy_veg
    ], scored, 1)[0]

    // Multiple vegetables for nutrition
    structure.composition.vegetables = this.selectBestFrom([
      ...categorized.vegetables.leafy,
      ...categorized.vegetables.cruciferous,
      ...categorized.vegetables.colorful,
      ...categorized.vegetables.high_fiber
    ], scored, 2)

    // Healthy fat
    structure.composition.healthyFats = this.selectBestFrom([
      ...categorized.fats.oils,
      ...categorized.fats.olives,
      ...categorized.fats.nuts
    ], scored, 1)[0]

    // Flavor enhancers
    structure.composition.flavor = this.selectBestFrom([
      ...categorized.flavor.herbs,
      ...categorized.flavor.spices,
      ...categorized.flavor.aromatics
    ], scored, 2)[0]

    structure.difficulty = 'medium'
  }

  /**
   * Composes dinner meal structure
   * @param {Object} structure - Meal structure to populate
   * @param {Object} categorized - Categorized ingredients
   * @param {Array} scored - Scored ingredients
   * @param {Object} targets - Macro targets
   * @param {Object} constraints - Constraints
   */
  static composeDinner(structure, categorized, scored, targets, constraints) {
    // Primary protein - can be more substantial
    structure.composition.primaryProtein = this.selectBestFrom([
      ...categorized.protein.fish,
      ...categorized.protein.lean,
      ...categorized.protein.fatty
    ], scored, 1)[0]

    // Secondary protein for variety
    structure.composition.secondaryProtein = this.selectBestFrom([
      ...categorized.protein.plant,
      ...categorized.carbohydrates.legumes
    ], scored, 1)[0]

    // Moderate carbs for dinner
    structure.composition.primaryCarb = this.selectBestFrom([
      ...categorized.carbohydrates.wholegrain,
      ...categorized.vegetables.low_carb.slice(0, 3) // Vegetable carbs preferred
    ], scored, 1)[0]

    // Variety of vegetables
    structure.composition.vegetables = this.selectBestFrom([
      ...categorized.vegetables.leafy,
      ...categorized.vegetables.cruciferous,
      ...categorized.vegetables.colorful
    ], scored, 3)

    // Cooking fat
    structure.composition.healthyFats = this.selectBestFrom([
      ...categorized.fats.oils,
      ...categorized.fats.olives
    ], scored, 1)[0]

    // Complex flavoring
    structure.composition.flavor = this.selectBestFrom([
      ...categorized.flavor.herbs,
      ...categorized.flavor.spices,
      ...categorized.flavor.aromatics
    ], scored, 3)[0]

    structure.difficulty = 'medium'
  }

  /**
   * Composes snack structure
   * @param {Object} structure - Meal structure to populate
   * @param {Object} categorized - Categorized ingredients
   * @param {Array} scored - Scored ingredients
   * @param {Object} targets - Macro targets
   * @param {Object} constraints - Constraints
   */
  static composeSnack(structure, categorized, scored, targets, constraints) {
    // Protein for satiety
    structure.composition.primaryProtein = this.selectBestFrom([
      ...categorized.protein.dairy,
      ...categorized.fats.nuts,
      ...categorized.protein.plant
    ], scored, 1)[0]

    // Minimal carbs
    structure.composition.vegetables = this.selectBestFrom([
      ...categorized.vegetables.low_carb,
      ...categorized.fruits.berries
    ], scored, 1)

    structure.difficulty = 'easy'
  }

  /**
   * Selects best ingredients from a category
   * @param {Array} categoryIngredients - Ingredients from specific category
   * @param {Array} scoredIngredients - All scored ingredients
   * @param {number} count - Number to select
   * @returns {Array} Selected ingredients
   */
  static selectBestFrom(categoryIngredients, scoredIngredients, count) {
    const available = categoryIngredients
      .map(ing => scoredIngredients.find(s => s.id === ing.id))
      .filter(Boolean)
      .filter(ing => ing.scoringProfile.dietaryCompatibility.compatible)

    available.sort((a, b) => b.scoringProfile.overallScore - a.scoringProfile.overallScore)
    return available.slice(0, count)
  }

  /**
   * Calculates appropriate portions for meal components
   * @param {Object} structure - Meal structure
   * @param {Object} targets - Macro targets
   */
  static calculatePortions(structure, targets) {
    const components = Object.values(structure.composition).flat().filter(Boolean)
    const totalCaloriesNeeded = targets.calories

    let allocatedCalories = 0
    const portions = {}

    // Allocate calories by priority
    const priorities = {
      primaryProtein: 0.25,
      vegetables: 0.20,
      primaryCarb: 0.30,
      healthyFats: 0.15,
      secondaryProtein: 0.10
    }

    for (const [component, allocation] of Object.entries(priorities)) {
      const ingredient = structure.composition[component]
      if (ingredient && !Array.isArray(ingredient)) {
        const targetCalories = totalCaloriesNeeded * allocation
        const caloriesPerServing = ingredient.calories_per_serving || 100
        const servings = Math.max(0.25, targetCalories / caloriesPerServing)
        
        portions[ingredient.id] = {
          servings: Math.round(servings * 4) / 4, // Round to quarter servings
          calories: servings * caloriesPerServing,
          unit: ingredient.typical_serving_size || 'serving'
        }
        allocatedCalories += portions[ingredient.id].calories
      }
    }

    // Handle vegetable arrays
    if (Array.isArray(structure.composition.vegetables) && structure.composition.vegetables.length > 0) {
      const vegCalories = totalCaloriesNeeded * 0.20
      const caloriesPerVeg = vegCalories / structure.composition.vegetables.length
      
      structure.composition.vegetables.forEach(veg => {
        const caloriesPerServing = veg.calories_per_serving || 25
        const servings = Math.max(0.5, caloriesPerVeg / caloriesPerServing)
        portions[veg.id] = {
          servings: Math.round(servings * 2) / 2,
          calories: servings * caloriesPerServing,
          unit: veg.typical_serving_size || 'cup'
        }
      })
    }

    structure.portions = portions
  }

  /**
   * Calculates final nutrition breakdown for the meal
   * @param {Object} structure - Meal structure with portions
   */
  static calculateNutrition(structure) {
    const nutrition = {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sugar: 0,
      sodium: 0,
      glycemicLoad: 0
    }

    const allIngredients = Object.values(structure.composition).flat().filter(Boolean)
    
    allIngredients.forEach(ingredient => {
      const portion = structure.portions[ingredient.id]
      if (portion) {
        const multiplier = portion.servings
        nutrition.calories += (ingredient.calories_per_serving || 0) * multiplier
        nutrition.protein += (ingredient.protein_grams || 0) * multiplier
        nutrition.carbs += (ingredient.carbs_grams || 0) * multiplier
        nutrition.fat += (ingredient.fat_grams || 0) * multiplier
        nutrition.fiber += (ingredient.fiber_grams || 0) * multiplier
        nutrition.sugar += (ingredient.sugar_grams || 0) * multiplier
        nutrition.sodium += (ingredient.sodium_mg || 0) * multiplier

        // Calculate glycemic load contribution
        const carbs = (ingredient.carbs_grams || 0) * multiplier
        const gi = ingredient.glycemic_index || 50
        nutrition.glycemicLoad += (gi * carbs) / 100
      }
    })

    // Round all values
    Object.keys(nutrition).forEach(key => {
      nutrition[key] = Math.round(nutrition[key] * 10) / 10
    })

    structure.nutritionBreakdown = nutrition
  }

  /**
   * Selects appropriate cooking method based on ingredients and constraints
   * @param {Object} structure - Meal structure
   * @param {Object} constraints - Constraints including user preferences
   */
  static selectCookingMethod(structure, constraints) {
    const hasProtein = structure.composition.primaryProtein
    const hasVegetables = structure.composition.vegetables?.length > 0
    const mealType = structure.mealType

    const cookingMethods = {
      'breakfast': ['scrambled', 'poached', 'sautéed', 'steamed'],
      'lunch': ['grilled', 'sautéed', 'roasted', 'steamed', 'raw'],
      'dinner': ['grilled', 'baked', 'roasted', 'sautéed', 'braised'],
      'snack': ['raw', 'toasted', 'blended']
    }

    // Select based on meal type and ingredients
    const availableMethods = cookingMethods[mealType] || ['sautéed']
    
    if (hasProtein && hasVegetables) {
      structure.cookingMethod = ['sautéed', 'roasted', 'grilled'].find(method => 
        availableMethods.includes(method)
      ) || availableMethods[0]
    } else if (hasProtein) {
      structure.cookingMethod = ['grilled', 'baked', 'poached'].find(method => 
        availableMethods.includes(method)
      ) || availableMethods[0]
    } else {
      structure.cookingMethod = availableMethods[0]
    }

    // Adjust difficulty based on cooking method
    const complexMethods = ['braised', 'roasted', 'baked']
    if (complexMethods.includes(structure.cookingMethod)) {
      structure.difficulty = 'medium'
    }
  }

  /**
   * Validates meal structure against targets and constraints
   * @param {Object} structure - Complete meal structure
   * @param {Object} targets - Macro targets
   * @param {Object} constraints - Constraints
   * @returns {Object} Validation results with warnings and suggestions
   */
  static validateMealStructure(structure, targets, constraints) {
    const validation = {
      isValid: true,
      warnings: [],
      suggestions: [],
      nutritionCheck: {
        calories: 'good',
        protein: 'good',
        carbs: 'good',
        fiber: 'good'
      }
    }

    const nutrition = structure.nutritionBreakdown
    const { diabetesAnalysis } = constraints

    // Calorie validation
    if (nutrition.calories > targets.calories * 1.2) {
      validation.warnings.push('Meal exceeds calorie target by >20%')
      validation.nutritionCheck.calories = 'high'
    } else if (nutrition.calories < targets.calories * 0.8) {
      validation.warnings.push('Meal is below calorie target by >20%')
      validation.nutritionCheck.calories = 'low'
    }

    // Carb validation for diabetes
    if (nutrition.carbs > targets.carbs) {
      validation.warnings.push(`Carbs (${nutrition.carbs}g) exceed target (${targets.carbs}g)`)
      validation.nutritionCheck.carbs = 'high'
      validation.isValid = false
    }

    // Protein validation
    if (nutrition.protein < targets.protein * 0.8) {
      validation.warnings.push('Protein content is below recommended minimum')
      validation.nutritionCheck.protein = 'low'
    }

    // Fiber validation
    if (nutrition.fiber < targets.fiber) {
      validation.suggestions.push('Consider adding more high-fiber ingredients')
      validation.nutritionCheck.fiber = 'low'
    }

    // Glycemic load validation
    if (nutrition.glycemicLoad > 20 && diabetesAnalysis.severity !== 'normal') {
      validation.warnings.push('High glycemic load may cause blood sugar spikes')
    }

    return validation
  }
}

export default MealCompositionAgent