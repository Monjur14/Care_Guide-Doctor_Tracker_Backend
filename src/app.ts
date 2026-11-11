import cookieParser from 'cookie-parser';
import express from 'express';
import { apiDocsEnabled, env } from './config/env';
import { docsRouter } from './docs/docs.routes';
import { ensureDb } from './middleware/ensureDb';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimit';
import { requestLogger } from './middleware/requestLogger';
import { corsPolicy, csrfProtection, noStore, securityHeaders } from './middleware/security';
import { apiRouter } from './routes';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  // "simple" parser: ?a[$ne]=x stays a literal key, never a nested object (blocks operator injection).
  app.set('query parser', 'simple');
  app.set('json spaces', 0);

  app.use(requestLogger);
  app.use(securityHeaders);
  app.use(corsPolicy);
  app.use(express.json({ limit: '10kb', strict: true }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Friendly landing response for anyone opening the API's root URL in a browser.
  app.get('/', (_req, res) => {
    res.json({
      message: 'Welcome to the Doctor Tracker API. The backend is up and running.',
      status: 'ok',
      version: 'v1',
      endpoints: {
        health: '/api/health',
        api: '/api/v1',
        ...(apiDocsEnabled && { docs: '/api/docs', openapi: '/api/openapi.json' }),
      },
    });
  });

  if (apiDocsEnabled) app.use('/api', docsRouter); // GET /api/docs, GET /api/openapi.json

  app.use('/api/v1', noStore, apiLimiter, csrfProtection, ensureDb, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
