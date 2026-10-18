import { Hono } from 'hono';
import { listDirectories, listLocations } from '../fs-browser.js';
import { validate } from '../schemas/validator.js';
import { listDirectoriesQuerySchema } from '../schemas/fs.js';

export const fsRouter = new Hono()
  .get('/locations', async (c) => {
    try {
      const locations = await listLocations();
      return c.json({ locations });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  })
  .get(
    '/list',
    validate('query', listDirectoriesQuerySchema),
    async (c) => {
      try {
        const { path } = c.req.valid('query' as never) as { path?: string };
        const result = await listDirectories(path);
        return c.json(result);
      } catch (err: any) {
        return c.json({ error: err.message }, 400);
      }
    }
  );
