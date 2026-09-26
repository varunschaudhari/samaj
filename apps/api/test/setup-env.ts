// Runs before any test file imports the app, so config/env.ts sees these.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:1/replaced-by-memory-server';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-123';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.COOKIE_SECURE = 'false';
process.env.RATE_LIMIT_MAX = '10000';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
