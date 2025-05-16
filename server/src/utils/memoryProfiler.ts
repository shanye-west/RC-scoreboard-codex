import { heapStats } from 'v8';
import logger from './logger';
import { debugConfig } from '../config/debug';

class MemoryProfiler {
  private static instance: MemoryProfiler;
  private snapshots: Array<{
    timestamp: Date;
    stats: ReturnType<typeof heapStats>;
    memoryUsage: NodeJS.MemoryUsage;
  }> = [];
  private interval: NodeJS.Timeout | null = null;

  private constructor() {}

  static getInstance(): MemoryProfiler {
    if (!MemoryProfiler.instance) {
      MemoryProfiler.instance = new MemoryProfiler();
    }
    return MemoryProfiler.instance;
  }

  startProfiling(intervalMs: number = 60000) { // Default: 1 minute
    if (this.interval) {
      clearInterval(this.interval);
    }

    this.interval = setInterval(() => {
      this.takeSnapshot();
    }, intervalMs);

    // Take initial snapshot
    this.takeSnapshot();
  }

  stopProfiling() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  takeSnapshot() {
    const snapshot = {
      timestamp: new Date(),
      stats: heapStats(),
      memoryUsage: process.memoryUsage(),
    };

    this.snapshots.push(snapshot);

    // Check for memory warnings
    const heapUsedMB = snapshot.memoryUsage.heapUsed / 1024 / 1024;
    if (heapUsedMB > debugConfig.performance.memoryWarningThreshold) {
      logger.warn('High memory usage detected', {
        heapUsed: `${Math.round(heapUsedMB)}MB`,
        threshold: `${debugConfig.performance.memoryWarningThreshold}MB`,
      });
    }

    // Keep only last 100 snapshots
    if (this.snapshots.length > 100) {
      this.snapshots = this.snapshots.slice(-100);
    }
  }

  getSnapshots() {
    return this.snapshots;
  }

  getMemoryTrends() {
    if (this.snapshots.length < 2) {
      return null;
    }

    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];
    const duration = last.timestamp.getTime() - first.timestamp.getTime();

    return {
      duration: `${duration}ms`,
      heapUsed: {
        start: `${Math.round(first.memoryUsage.heapUsed / 1024 / 1024)}MB`,
        end: `${Math.round(last.memoryUsage.heapUsed / 1024 / 1024)}MB`,
        change: `${Math.round((last.memoryUsage.heapUsed - first.memoryUsage.heapUsed) / 1024 / 1024)}MB`,
      },
      heapTotal: {
        start: `${Math.round(first.memoryUsage.heapTotal / 1024 / 1024)}MB`,
        end: `${Math.round(last.memoryUsage.heapTotal / 1024 / 1024)}MB`,
        change: `${Math.round((last.memoryUsage.heapTotal - first.memoryUsage.heapTotal) / 1024 / 1024)}MB`,
      },
      rss: {
        start: `${Math.round(first.memoryUsage.rss / 1024 / 1024)}MB`,
        end: `${Math.round(last.memoryUsage.rss / 1024 / 1024)}MB`,
        change: `${Math.round((last.memoryUsage.rss - first.memoryUsage.rss) / 1024 / 1024)}MB`,
      },
    };
  }

  clearSnapshots() {
    this.snapshots = [];
  }
}

export const memoryProfiler = MemoryProfiler.getInstance(); 