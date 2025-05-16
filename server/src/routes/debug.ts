import { Router } from 'express';
import { authenticateUser } from '../middleware/auth';
import { appDebugger } from '../utils/appDebug';
import { DatabaseDebugger } from '../utils/dbDebug';
import { profiler } from '../utils/profiler';
import { memoryProfiler } from '../utils/memoryProfiler';
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

// Performance metrics endpoint
router.get('/performance', authenticateUser, async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json({
      measurements: profiler.getMeasurements(),
      memoryTrends: memoryProfiler.getMemoryTrends(),
    });
  } catch (error) {
    console.error('Error fetching performance metrics:', error);
    res.status(500).json({ error: 'Failed to fetch performance metrics' });
  }
});

// Memory profiling endpoints
router.post('/memory/start', authenticateUser, async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { interval } = req.body;
    memoryProfiler.startProfiling(interval);
    res.json({ message: 'Memory profiling started' });
  } catch (error) {
    console.error('Error starting memory profiling:', error);
    res.status(500).json({ error: 'Failed to start memory profiling' });
  }
});

router.post('/memory/stop', authenticateUser, async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    memoryProfiler.stopProfiling();
    res.json({ message: 'Memory profiling stopped' });
  } catch (error) {
    console.error('Error stopping memory profiling:', error);
    res.status(500).json({ error: 'Failed to stop memory profiling' });
  }
});

router.get('/memory/snapshots', authenticateUser, async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json(memoryProfiler.getSnapshots());
  } catch (error) {
    console.error('Error fetching memory snapshots:', error);
    res.status(500).json({ error: 'Failed to fetch memory snapshots' });
  }
});

// Clear all debug data
router.post('/clear', authenticateUser, async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    appDebugger.clearData();
    dbDebugger.clearStats();
    profiler.clearMeasurements();
    memoryProfiler.clearSnapshots();

    res.json({ message: 'All debug data cleared successfully' });
  } catch (error) {
    console.error('Error clearing debug data:', error);
    res.status(500).json({ error: 'Failed to clear debug data' });
  }
});

export default router; 