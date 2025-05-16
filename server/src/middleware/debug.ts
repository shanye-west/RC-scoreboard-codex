import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { performanceLogger } from '../utils/logger';

// Request debugging middleware
export const debugRequest = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const requestId = Math.random().toString(36).substring(7);

  // Log request details
  logger.debug('Incoming request', {
    requestId,
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: req.body,
    query: req.query,
    params: req.params,
  });

  // Add request ID to response headers
  res.setHeader('X-Request-ID', requestId);

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.debug('Request completed', {
      requestId,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    });
    performanceLogger(`Request ${requestId}`, start);
  });

  next();
};

// Error debugging middleware
export const debugError = (err: Error, req: Request, res: Response, next: NextFunction) => {
  const requestId = res.getHeader('X-Request-ID');
  
  logger.error('Error occurred', {
    requestId,
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
    },
    request: {
      method: req.method,
      url: req.url,
      body: req.body,
      query: req.query,
      params: req.params,
    },
  });

  next(err);
};

// Performance monitoring middleware
export const debugPerformance = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const requestId = res.getHeader('X-Request-ID');

  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 1000) { // Log slow requests (over 1 second)
      logger.warn('Slow request detected', {
        requestId,
        duration: `${duration}ms`,
        method: req.method,
        url: req.url,
      });
    }
  });

  next();
};

// Memory usage monitoring
export const debugMemory = (req: Request, res: Response, next: NextFunction) => {
  const memoryUsage = process.memoryUsage();
  logger.debug('Memory usage', {
    heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
    rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
  });

  next();
}; 