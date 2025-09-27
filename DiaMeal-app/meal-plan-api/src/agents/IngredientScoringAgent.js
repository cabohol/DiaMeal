class IngredientScoringAgent {
  static scoreIngredientForDiabetes(ingredient, diabetesAnalysis) {
    let score = 50 // Base score

    // Diabetic-friendly flag
    if (ingredient.is_diabetic_friendly) score += 20

    // Fiber content (high fiber is good)
    const fiber = ingredient.fiber_grams || 0
    score += Math.min(fiber * 3, 15)

    // Glycemic impact
    const carbs = ingredient.carbs_grams || 0
    const gi = ingredient.glycemic_index || 50
    const gl = (gi * carbs) / 100
    if (gl < 10) score += 10
    else if (gl < 20) score += 5
    else score -= Math.min(gl, 20)

    // Protein content (good for satiety)
    const protein = ingredient.protein_grams || 0
    score += Math.min(protein * 2, 20)

    // Penalize high carb ingredients for severe diabetes
    if (diabetesAnalysis.severity === 'severe' && carbs > 20) {
      score -= 15
    }

    return Math.max(0, Math.min(100, score))
  }

  static scoreIngredientForBudget(ingredient, budget) {
    const cost = ingredient.cost_per_serving || 1
    let score = 50

    if (budget === 'low' && cost <= 0.5) score += 30
    else if (budget === 'low' && cost > 2) score -= 30
    else if (budget === 'medium' && cost <= 1.5) score += 20
    else if (budget === 'medium' && cost > 3) score -= 20
    else if (budget === 'high') score += 10 // Less budget constraint

    return Math.max(0, Math.min(100, score))
  }
}
export default IngredientScoringAgent