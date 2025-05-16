import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bestBallRoutes from './routes/bestBall';
import debugRoutes from './routes/debug';
import { requestLogger, errorLogger } from './utils/logger';
import { debugRequest, debugError, debugPerformance, debugMemory } from './middleware/debug';
import { DatabaseDebugger } from './utils/dbDebug';
import { appDebugger } from './utils/appDebug';
import { pool } from './db';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Create database debugger
const dbDebugger = new DatabaseDebugger(pool);

// Middleware
app.use(cors());
app.use(express.json());

// Debugging middleware
app.use(debugRequest);
app.use(debugPerformance);
app.use(debugMemory);
app.use(requestLogger);

// Routes
app.use('/api', bestBallRoutes);
app.use('/api/debug', debugRoutes);

// Error handling
app.use(debugError);
app.use(errorLogger);

// Health check endpoint with debugging info
app.get('/health', (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: dbDebugger.getQueryStats(),
    application: appDebugger.getState(),
  };
  res.json(health);
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log('Debug mode:', process.env.NODE_ENV === 'development' ? 'enabled' : 'disabled');
  
  // Track server start
  appDebugger.trackMetric('serverStart', new Date());
}); 