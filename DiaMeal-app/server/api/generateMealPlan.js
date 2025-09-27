import { Groq } from "groq-sdk";
import { supabase } from "../utils/supabase.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Helper function to filter ingredients based on user constraints
function filterIngredientsByConstraints(ingredients, allergies, religiousDiets, diabetesType) {
  return ingredients.filter(ingredient => {
    // Filter out allergens
    if (allergies.length > 0) {
      const allergenList = ingredient.common_allergens || [];
      const hasAllergen = allergies.some(allergy => 
        allergenList.some(allergen => 
          allergen.toLowerCase().includes(allergy.toLowerCase()) ||
          allergy.toLowerCase().includes(allergen.toLowerCase())
        )
      );
      if (hasAllergen) return false;
    }

    // Filter based on religious dietary restrictions
    for (const diet of religiousDiets) {
      switch (diet.toLowerCase()) {
        case 'halal':
          if (!ingredient.is_halal) return false;
          break;
        case 'kosher':
          if (!ingredient.is_kosher) return false;
          break;
        case 'vegetarian':
          if (!ingredient.is_vegetarian) return false;
          break;
        case 'vegan':
          if (!ingredient.is_vegan) return false;
          break;
      }
    }

    // Filter based on availability
    if (ingredient.availability === 'unavailable') {
      return false;
    }

    return true;
  });
}

export default function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*'); // Or specify your domain: 'http://localhost:5173'
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Your existing API logic here
  if (req.method === 'GET') {
    return res.status(200).json({ 
      success: true, 
      message: 'API is healthy',
      timestamp: new Date().toISOString()
    });
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}

// Alternative: Create a CORS helper function to use across all endpoints
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

// Then use it in each endpoint:
export default function handler(req, res) {
  setCorsHeaders(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Your existing API logic here
  if (req.method === 'GET') {
    return res.status(200).json({ 
      success: true, 
      message: 'API is healthy',
      timestamp: new Date().toISOString()
    });
  }
  
}