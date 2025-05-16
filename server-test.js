import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running properly!' });
});

app.get('/', (req, res) => {
  res.send('Hello from the test server! API is available at /api/health');
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});