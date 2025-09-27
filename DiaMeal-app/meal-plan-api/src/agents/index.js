// agents/index.js
// Central export file for all AI agents

import DiabetesAnalysisAgent from './DiabetesAnalysisAgent.js'
import NutritionalCalculatorAgent from './NutritionalCalculatorAgent.js'
import IngredientScoringAgent from './IngredientScoringAgent.js'
import MealCompositionAgent from './MealCompositionAgent.js'


// Export all agents
// src/agents/index.js
export { default as DiabetesAnalysisAgent } from './DiabetesAnalysisAgent.js'
export { default as NutritionalCalculatorAgent } from './NutritionalCalculatorAgent.js'
export { default as IngredientScoringAgent } from './IngredientScoringAgent.js'
export { default as MealCompositionAgent } from './MealCompositionAgent.js'

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