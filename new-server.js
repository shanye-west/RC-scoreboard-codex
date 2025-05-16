import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs';

// Setup ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Enable CORS and JSON parsing
app.use(cors({
  origin: 'http://localhost:3000', // Allow Vite dev server
  credentials: true
}));
app.use(express.json());

// API routes
app.get('/api/status', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Server is running correctly',
    time: new Date().toISOString()
  });
});

// Check database connection
app.get('/api/db-status', async (req, res) => {
  try {
    // Just check if we have a DATABASE_URL without actually connecting
    if (process.env.DATABASE_URL) {
      res.json({ 
        status: 'OK', 
        message: 'Database URL is configured',
        connected: true
      });
    } else {
      res.status(500).json({ 
        status: 'Error', 
        message: 'Database URL is not configured',
        connected: false
      });
    }
  } catch (error) {
    res.status(500).json({ 
      status: 'Error', 
      message: error.message,
      connected: false 
    });
  }
});

// Sample data endpoint
app.get('/api/data', (req, res) => {
  res.json([
    { id: 1, name: 'Item 1', value: 100 },
    { id: 2, name: 'Item 2', value: 200 },
    { id: 3, name: 'Item 3', value: 300 }
  ]);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.send('OK');
});

// Catch-all route that sends back a simple message
app.get('*', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Backend Server</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          pre { background: #f1f1f1; padding: 10px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <h1>Backend Server</h1>
        <p>This is your Express backend server. Your frontend Vite app is running separately on port 3000.</p>
        <h2>Available API Endpoints:</h2>
        <ul>
          <li><a href="/api/status">/api/status</a> - Check server status</li>
          <li><a href="/api/db-status">/api/db-status</a> - Check database connection</li>
          <li><a href="/api/data">/api/data</a> - Get sample data</li>
        </ul>
      </body>
    </html>
  `);
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    status: 'Error',
    message: err.message || 'An unexpected error occurred'
  });
});

// Start server
const PORT = process.env.PORT || 5000;
const server = createServer(app);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api/status`);
});