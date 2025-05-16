import { EventEmitter } from 'events';
import logger from './logger';
import { debugConfig } from '../config/debug';

class AppDebugger extends EventEmitter {
  private static instance: AppDebugger;
  private metrics: Map<string, any> = new Map();
  private errors: Array<{
    timestamp: Date;
    error: Error;
    context: any;
  }> = [];
  private warnings: Array<{
    timestamp: Date;
    message: string;
    context: any;
  }> = [];

  private constructor() {
    super();
    this.setupEventListeners();
  }

  static getInstance(): AppDebugger {
    if (!AppDebugger.instance) {
      AppDebugger.instance = new AppDebugger();
    }
    return AppDebugger.instance;
  }

  private setupEventListeners() {
    process.on('uncaughtException', (error) => {
      this.trackError(error, { type: 'uncaughtException' });
    });

    process.on('unhandledRejection', (reason) => {
      this.trackError(reason instanceof Error ? reason : new Error(String(reason)), {
        type: 'unhandledRejection',
      });
    });

    process.on('warning', (warning) => {
      this.trackWarning(warning.message, { warning });
    });
  }

  // Track application metrics
  trackMetric(name: string, value: any) {
    this.metrics.set(name, {
      value,
      timestamp: new Date(),
    });
    this.emit('metric', { name, value });
  }

  // Track errors
  trackError(error: Error, context: any = {}) {
    const errorEntry = {
      timestamp: new Date(),
      error,
      context,
    };
    this.errors.push(errorEntry);
    logger.error('Application error', { error, context });
    this.emit('error', errorEntry);
  }

  // Track warnings
  trackWarning(message: string, context: any = {}) {
    const warningEntry = {
      timestamp: new Date(),
      message,
      context,
    };
    this.warnings.push(warningEntry);
    logger.warn('Application warning', { message, context });
    this.emit('warning', warningEntry);
  }

  // Get application state
  getState() {
    return {
      metrics: Object.fromEntries(this.metrics),
      errors: this.errors.slice(-100), // Last 100 errors
      warnings: this.warnings.slice(-100), // Last 100 warnings
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      environment: debugConfig.environment,
    };
  }

  // Clear tracked data
  clearData() {
    this.metrics.clear();
    this.errors = [];
    this.warnings = [];
  }

  // Get error statistics
  getErrorStats() {
    const errorTypes = new Map<string, number>();
    this.errors.forEach(({ error }) => {
      const type = error.name || 'Unknown';
      errorTypes.set(type, (errorTypes.get(type) || 0) + 1);
    });

    return {
      totalErrors: this.errors.length,
      errorTypes: Object.fromEntries(errorTypes),
      recentErrors: this.errors.slice(-10),
    };
  }

  // Get warning statistics
  getWarningStats() {
    return {
      totalWarnings: this.warnings.length,
      recentWarnings: this.warnings.slice(-10),
    };
  }
}

export const appDebugger = AppDebugger.getInstance(); 