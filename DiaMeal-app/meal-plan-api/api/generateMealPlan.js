export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'POST') {
    try {
      const { user_id, force_regenerate } = req.body;
      
      if (!user_id) {
        return res.status(400).json({
          success: false,
          error: 'User ID is required'
        });
      }

      // Your meal generation logic here
      const generatedPlan = {
        success: true,
        mealPlansByDay: {
          // Generated meal plans...
        },
        isExisting: false
      };

      res.status(200).json(generatedPlan);
    } catch (error) {
      console.error('Error in generateMealPlan:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  } else {
    res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }
}