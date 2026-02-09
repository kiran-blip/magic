import { NextRequest, NextResponse } from 'next/server';

/**
 * Standard API error response format
 */
interface ApiErrorResponse {
  error: {
    message: string;
    code: string;
    details?: string;
    timestamp: string;
  };
}

/**
 * Custom error classes for different error types
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string = 'Unauthorized') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends Error {
  public readonly retryAfter?: number;

  constructor(message: string = 'Rate limit exceeded', retryAfter?: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Map error types to HTTP status codes
 */
function getStatusCode(error: Error): number {
  if (error instanceof ValidationError) return 400;
  if (error instanceof AuthenticationError) return 401;
  if (error instanceof NotFoundError) return 404;
  if (error instanceof RateLimitError) return 429;
  return 500;
}

/**
 * Map error types to error codes
 */
function getErrorCode(error: Error): string {
  if (error instanceof ValidationError) return 'VALIDATION_ERROR';
  if (error instanceof AuthenticationError) return 'AUTHENTICATION_ERROR';
  if (error instanceof NotFoundError) return 'NOT_FOUND';
  if (error instanceof RateLimitError) return 'RATE_LIMIT_EXCEEDED';
  return 'INTERNAL_SERVER_ERROR';
}

/**
 * Logger function for errors with context
 */
function logError(
  error: Error,
  context: {
    route: string;
    method: string;
    timestamp: string;
  }
) {
  const logMessage = {
    timestamp: context.timestamp,
    route: context.route,
    method: context.method,
    errorName: error.name,
    errorMessage: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
  };

  console.error('[API Error]', JSON.stringify(logMessage, null, 2));
}

/**
 * Create a standardized error response
 */
function createErrorResponse(
  error: Error,
  req: NextRequest
): NextResponse<ApiErrorResponse> {
  const statusCode = getStatusCode(error);
  const errorCode = getErrorCode(error);
  const timestamp = new Date().toISOString();

  // Log the error
  logError(error, {
    route: req.nextUrl.pathname,
    method: req.method,
    timestamp,
  });

  // Build response
  const response: ApiErrorResponse = {
    error: {
      message: error.message || 'An unexpected error occurred',
      code: errorCode,
      timestamp,
    },
  };

  // Include details in development mode only
  if (process.env.NODE_ENV === 'development') {
    response.error.details = error.stack;
  }

  // Create the response
  const nextResponse = NextResponse.json(response, { status: statusCode });

  // Add Retry-After header for rate limit errors
  if (error instanceof RateLimitError && error.retryAfter) {
    nextResponse.headers.set('Retry-After', error.retryAfter.toString());
  }

  return nextResponse;
}

/**
 * Wrapper for Next.js API route handlers with error handling
 *
 * Usage:
 * ```
 * export const POST = withErrorHandler(async (req) => {
 *   // Your handler logic
 *   return NextResponse.json({ success: true });
 * });
 * ```
 */
export function withErrorHandler(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      return await handler(req);
    } catch (error) {
      // Handle unknown error types
      if (error instanceof Error) {
        return createErrorResponse(error, req);
      }

      // Fallback for non-Error throws
      const genericError = new Error('An unexpected error occurred');
      return createErrorResponse(genericError, req);
    }
  };
}

/**
 * Middleware-style error handler for use outside of withErrorHandler
 * Returns a properly formatted error response
 */
export function handleApiError(
  error: unknown,
  req: NextRequest
): NextResponse<ApiErrorResponse> {
  if (error instanceof Error) {
    return createErrorResponse(error, req);
  }

  const genericError = new Error('An unexpected error occurred');
  return createErrorResponse(genericError, req);
}

/**
 * Validation helper to throw ValidationError
 */
export function validateRequired(
  value: unknown,
  fieldName: string
): asserts value {
  if (!value) {
    throw new ValidationError(`${fieldName} is required`);
  }
}

/**
 * Validation helper for object schema
 */
export function validateSchema(
  data: Record<string, unknown>,
  schema: Record<string, boolean>
): void {
  for (const [field, required] of Object.entries(schema)) {
    if (required && !data[field]) {
      throw new ValidationError(`${field} is required`);
    }
  }
}
