import { createServer } from 'http';
import { config } from 'dotenv';
import handler from './api/generateMealPlan.js';

config();

const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/generateMealPlan') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => handler(req, res, body));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(3000, () => {
  console.log('Backend running on http://localhost:3000');
});
