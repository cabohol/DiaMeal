// src/agents/index.js
// Central export file for all AI agents

// Import named exports from agent files
import { DiabetesAnalysisAgent } from './DiabetesAnalysisAgent.js'
import { NutritionalCalculatorAgent } from './NutritionalCalculatorAgent.js'
import { IngredientScoringAgent } from './IngredientScoringAgent.js'
import { MealCompositionAgent } from './MealCompositionAgent.js'

// Re-export as named exports
export {
  DiabetesAnalysisAgent,
  NutritionalCalculatorAgent,
  IngredientScoringAgent,
  MealCompositionAgent
}

// Export default object with all agents for easy destructuring
export default {
  DiabetesAnalysisAgent,
  NutritionalCalculatorAgent,
  IngredientScoringAgent,
  MealCompositionAgent
}

/**
 * Agent capabilities overview:
 * 
 * DiabetesAnalysisAgent:
 * - Analyzes lab results for diabetes severity
 * - Calculates glycemic loads
 * - Provides dietary recommendations
 * - Determines glucose targets
 * 
 * NutritionalCalculatorAgent:
 * - Calculates BMR and daily calorie needs
 * - Determines macro nutrient targets
 * - Calculates portion sizes
 * - Provides micronutrient recommendations
 * 
 * IngredientScoringAgent:
 * - Scores ingredients for diabetes suitability
 * - Evaluates budget compatibility
 * - Checks dietary restrictions
 * - Creates comprehensive scoring profiles
 * 
 * MealCompositionAgent:
 * - Generates meal structures
 * - Categorizes ingredients optimally
 * - Calculates portions and nutrition
 * - Validates meal compositions
 */