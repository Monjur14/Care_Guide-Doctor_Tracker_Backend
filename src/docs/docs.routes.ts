import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { getOpenApiDocument } from './openapi';

/*
 * Swagger UI is loaded from a pinned CDN version with Subresource Integrity, so
 * a tampered file is refused by the browser. The page's own script runs only
 * with a per-request CSP nonce.
 */
const SWAGGER_UI_VERSION = '5.34.0';
const CDN = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}`;
const SRI = {
  css: 'sha384-4c3vsE5f+trhFyHrFrLM1fFGUn531NIaC7dcqEWIJdoRQJ5CkJbSuSCwXLpaS1KF',
  js: 'sha384-9Td7MKiIr2S83E1kZyyVi8KdJw/S8CpAvu0llLyMeg0xq/hDGiZJfVn0fV4llCmK',
};

function page(nonce: string) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Doctor Tracker API docs</title>
  <link rel="stylesheet" href="${CDN}/swagger-ui.css" integrity="${SRI.css}" crossorigin="anonymous" />
  <style>body { margin: 0; } .swagger-ui .topbar { display: none; }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${CDN}/swagger-ui-bundle.js" integrity="${SRI.js}" crossorigin="anonymous"></script>
  <script nonce="${nonce}">
    window.ui = SwaggerUIBundle({
      url: './openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      displayRequestDuration: true,
      tryItOutEnabled: false,
      persistAuthorization: false,
      defaultModelsExpandDepth: 0,
      docExpansion: 'list',
      filter: true,
    });
  </script>
</body>
</html>`;
}

export const docsRouter = Router();

docsRouter.get('/openapi.json', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.json(getOpenApiDocument());
});

docsRouter.get('/docs', (_req, res) => {
  const nonce = randomBytes(16).toString('base64');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'none'",
      `script-src 'nonce-${nonce}' ${CDN}/`,
      // Swagger UI sets inline styles at runtime (a nonce would disable 'unsafe-inline').
      `style-src ${CDN}/ 'unsafe-inline'`,
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
  );
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(page(nonce));
});
