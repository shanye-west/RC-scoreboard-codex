import { Pool, QueryResult } from 'pg';
import { queryLogger } from './logger';

export class DatabaseDebugger {
  private pool: Pool;
  private queryCount: number = 0;
  private slowQueries: Array<{
    query: string;
    params: any[];
    duration: number;
    timestamp: Date;
  }> = [];

  constructor(pool: Pool) {
    this.pool = pool;
  }

  // Wrap pool.query to add debugging
  async query(text: string, params?: any[]): Promise<QueryResult> {
    const start = Date.now();
    this.queryCount++;

    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;

      // Log query
      queryLogger(text, params || [], duration);

      // Track slow queries (over 100ms)
      if (duration > 100) {
        this.slowQueries.push({
          query: text,
          params: params || [],
          duration,
          timestamp: new Date(),
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      console.error('Database query failed:', {
        query: text,
        params,
        duration: `${duration}ms`,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  // Get query statistics
  getQueryStats() {
    return {
      totalQueries: this.queryCount,
      slowQueries: this.slowQueries.length,
      slowestQuery: this.slowQueries.length > 0 
        ? this.slowQueries.reduce((prev, current) => 
            prev.duration > current.duration ? prev : current
          )
        : null,
      averageQueryTime: this.slowQueries.length > 0
        ? this.slowQueries.reduce((acc, curr) => acc + curr.duration, 0) / this.slowQueries.length
        : 0,
    };
  }

  // Clear query statistics
  clearStats() {
    this.queryCount = 0;
    this.slowQueries = [];
  }

  // Get connection pool status
  async getPoolStatus() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }
} 