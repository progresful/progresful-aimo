import { ZodError } from 'zod';
import type { NextFunction, Request, Response } from 'express';

import {
  PrismaClientInitializationError,
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
} from '../../prisma/generated/prisma/runtime/library.js';
import { AppError } from '../utils/AppError.ts';
import logger from '../services/logger.ts';

// TODO: add logging for errors

export function errorHandler(
  err: Error & { statusCode?: number; meta?: any; code?: string },
  req: Request,
  res: Response,
  next: NextFunction
) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let details = undefined;

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    statusCode = 400;
    message = 'Validation failed';
    details = err.issues.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
      code: e.code,
    }));
    logger.warn(`Validation error: ${JSON.stringify(details)}`);
  }

  // Handle Prisma errors
  else if (err instanceof PrismaClientKnownRequestError) {
    statusCode = 400;
    message = `Database error [${err.code}]`;
    details = err.meta || undefined;
    logger.error(`Database error [${err.code}]:`, err);
  } else if (err instanceof PrismaClientValidationError) {
    statusCode = 422;
    message = 'Database validation error';
    logger.error('Database validation error:', err);
  } else if (err instanceof PrismaClientInitializationError) {
    statusCode = 500;
    message = 'Database initialization error';
    logger.error('Database initialization error:', err);
  }

  // Handle custom AppError
  else if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
    logger.error(`Application error [${statusCode}]: ${message}`, err);
  }

  // Handle unknown errors
  else {
    logger.error('Unhandled error:', err);
  }

  // Final JSON response
  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(details && { details }), // Only include if details exist
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    },
  });
}
