import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';

describe('Server Modular Routes & Zod Validation', () => {
  let tempHome: string;
  const originalHome = process.env.SCHEMA_MEMORY_HOME;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'sm-srv-routes-'));
    process.env.SCHEMA_MEMORY_HOME = tempHome;
    app = createApp();
  });

  afterEach(async () => {
    process.env.SCHEMA_MEMORY_HOME = originalHome;
    await rm(tempHome, { recursive: true, force: true });
  });

  const localHeaders = {
    host: '127.0.0.1:4317',
    'content-type': 'application/json',
  };

  it('validates project plan input schema (rejects empty or missing path)', async () => {
    const res = await app.request('/api/projects/plan', {
      method: 'POST',
      headers: localHeaders,
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Field "path" is required.');
    expect(json.issues).toBeDefined();
  });

  it('validates project add input schema (rejects empty path)', async () => {
    const res = await app.request('/api/projects', {
      method: 'POST',
      headers: localHeaders,
      body: JSON.stringify({ path: '' }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Field "path" is required.');
  });

  it('validates layout update input schema', async () => {
    const res = await app.request('/api/projects/non-existent/layout', {
      method: 'PUT',
      headers: localHeaders,
      body: JSON.stringify({ layout: { table1: { x: 'invalid', y: 10 } } }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });
});
