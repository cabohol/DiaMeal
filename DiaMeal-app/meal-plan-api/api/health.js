// api/health.js
// CORS headers function
const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Max-Age', '86400')
}

export default function handler(req, res) {
  // Set CORS headers
  setCorsHeaders(res)
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }
  
  // Health check response
  return res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    architecture: 'Vercel Serverless Functions',
    message: 'DiaMeal API is running properly',
    cors: 'Enabled for all origins'
  })
}