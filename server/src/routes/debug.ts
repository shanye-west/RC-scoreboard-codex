import { Router } from 'express';
import { authenticateUser } from '../middleware/auth';
import { appDebugger } from '../utils/appDebug';
import { DatabaseDebugger } from '../utils/dbDebug';
import { pool } from '../db';
import { debugConfig } from '../config/debug';

const router = Router();
const dbDebugger = new DatabaseDebugger(pool);

// Debug dashboard endpoint
router.get('/dashboard', authenticateUser, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const [appState, dbStats, poolStatus] = await Promise.all([
      appDebugger.getState(),
      dbDebugger.getQueryStats(),
      dbDebugger.getPoolStatus(),
    ]);

    res.json({
      application: {
        state: appState,
        config: debugConfig,
      },
      database: {
        stats: dbStats,
        pool: poolStatus,
      },
      system: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        uptime: process.uptime(),
      },
    });
  } catch (error) {
    console.error('Error fetching debug dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch debug information' });
  }
});

// Error statistics endpoint
router.get('/errors', authenticateUser, async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json(appDebugger.getErrorStats());
  } catch (error) {
    console.error('Error fetching error statistics:', error);
    res.status(500).json({ error: 'Failed to fetch error statistics' });
  }
});

// Warning statistics endpoint
router.get('/warnings', authenticateUser, async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json(appDebugger.getWarningStats());
  } catch (error) {
    console.error('Error fetching warning statistics:', error);
    res.status(500).json({ error: 'Failed to fetch warning statistics' });
  }
});

// Database statistics endpoint
router.get('/database', authenticateUser, async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const [stats, poolStatus] = await Promise.all([
      dbDebugger.getQueryStats(),
      dbDebugger.getPoolStatus(),
    ]);

    res.json({
      queryStats: stats,
      poolStatus,
    });
  } catch (error) {
    console.error('Error fetching database statistics:', error);
    res.status(500).json({ error: 'Failed to fetch database statistics' });
  }
});

// Clear debug data endpoint
router.post('/clear', authenticateUser, async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    appDebugger.clearData();
    dbDebugger.clearStats();

    res.json({ message: 'Debug data cleared successfully' });
  } catch (error) {
    console.error('Error clearing debug data:', error);
    res.status(500).json({ error: 'Failed to clear debug data' });
  }
});

export default router; 