import { performance, PerformanceObserver } from 'perf_hooks';
import logger from './logger';
import { debugConfig } from '../config/debug';

class Profiler {
  private static instance: Profiler;
  private measurements: Map<string, number[]> = new Map();
  private observer: PerformanceObserver;

  private constructor() {
    this.observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        const { name, duration } = entry;
        if (!this.measurements.has(name)) {
          this.measurements.set(name, []);
        }
        this.measurements.get(name)?.push(duration);

        // Log slow operations
        if (duration > debugConfig.performance.slowRequestThreshold) {
          logger.warn('Slow operation detected', {
            operation: name,
            duration: `${duration}ms`,
          });
        }
      });
    });

    this.observer.observe({ entryTypes: ['measure'], buffered: true });
  }

  static getInstance(): Profiler {
    if (!Profiler.instance) {
      Profiler.instance = new Profiler();
    }
    return Profiler.instance;
  }

  startMeasure(name: string) {
    performance.mark(`${name}-start`);
  }

  endMeasure(name: string) {
    performance.mark(`${name}-end`);
    performance.measure(name, `${name}-start`, `${name}-end`);
  }

  getMeasurements() {
    const stats: Record<string, {
      count: number;
      avg: number;
      min: number;
      max: number;
      p95: number;
    }> = {};

    this.measurements.forEach((durations, name) => {
      const sorted = [...durations].sort((a, b) => a - b);
      const count = durations.length;
      const sum = durations.reduce((a, b) => a + b, 0);
      const avg = sum / count;
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const p95 = sorted[Math.floor(count * 0.95)];

      stats[name] = { count, avg, min, max, p95 };
    });

    return stats;
  }

  clearMeasurements() {
    this.measurements.clear();
    performance.clearMarks();
    performance.clearMeasures();
  }
}

export const profiler = Profiler.getInstance(); 