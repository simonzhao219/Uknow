import { Hono } from 'npm:hono@4.3.11';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';

// Import handlers
import payuniHandler from 'payuni_handler.ts';

const app = new Hono();

// ========================================
// Middleware
// ========================================
app.use('*', logger(console.log));
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// ========================================
// Health Check
// ========================================
app.get('/webhooks/health', (c) => {
  return c.json({ 
    status: 'ok', 
    service: 'webhooks',
    timestamp: new Date().toISOString()
  });
});

// ========================================
// Webhook Routes
// ========================================

// PayUni webhook
app.route('/webhooks/payuni', payuniHandler);

// 未來可以添加其他 webhook
// app.route('/webhooks/stripe', stripeHandler);
// app.route('/webhooks/line', lineHandler);

// ========================================
// 404 Handler
// ========================================
app.notFound((c) => {
  return c.json({ 
    error: 'Webhook endpoint not found',
    path: c.req.path 
  }, 404);
});

// ========================================
// Error Handler
// ========================================
app.onError((err, c) => {
  console.error('[Webhook] Global error:', err);
  return c.json({ 
    error: 'Internal server error',
    message: err.message 
  }, 500);
});

// ========================================
// Start Server
// ========================================
console.log('[Webhook] Server starting...');
Deno.serve(app.fetch);
