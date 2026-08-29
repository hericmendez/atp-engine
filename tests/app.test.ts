import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/interfaces/http/app.js';

describe('app', () => {
  const app = createApp();

  it('creates an express application', () => {
    expect(app).toBeDefined();
    expect(typeof app.listen).toBe('function');
  });

  it('responds to GET /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });

  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/unknown');
    expect(res.status).toBe(404);
  });

  it('returns validation error for invalid JSON body', async () => {
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{invalid json');
    expect(res.status).toBe(400);
  });
});
