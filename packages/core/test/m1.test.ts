import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseSchema,
  validateDbml,
  serializeDbml,
  diffSchemas,
  affectedOf,
  hashDbml,
  normalizeDbml,
} from '../src/index.js';

describe('M1: DBML Core and Diff Engine', () => {
  const fixture1Path = resolve(__dirname, '../../../fixtures/ecommerce.dbml');
  const fixture2Path = resolve(__dirname, '../../../fixtures/ecommerce.v2.dbml');
  const dbml1 = readFileSync(fixture1Path, 'utf-8');
  const dbml2 = readFileSync(fixture2Path, 'utf-8');

  describe('Validation', () => {
    it('validates correct DBML', () => {
      const res = validateDbml(dbml1);
      expect(res.ok).toBe(true);
    });

    it('reports syntax error with line and column', () => {
      const badDbml = 'Table users {\n  id int [pk\n}';
      const res = validateDbml(badDbml);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.errors.length).toBeGreaterThan(0);
        expect(res.errors[0]?.line).toBeGreaterThanOrEqual(1);
        expect(res.errors[0]?.column).toBeGreaterThanOrEqual(1);
      }
    });

    it('accepts empty string as valid empty schema', () => {
      const res = validateDbml('');
      expect(res.ok).toBe(true);
      const parsed = parseSchema('');
      expect(parsed.tables).toEqual([]);
    });
  });

  describe('Parse and Serialize Round-trip', () => {
    it('parses ecommerce.dbml accurately', () => {
      const model = parseSchema(dbml1);
      expect(model.tables.length).toBe(4);
      expect(model.enums.length).toBe(1);
      expect(model.refs.length).toBe(3);

      const users = model.tables.find((t) => t.name === 'users');
      expect(users).toBeDefined();
      expect(users?.note).toBe('User accounts table');

      const id = users?.columns.find((c) => c.name === 'id');
      expect(id?.pk).toBe(true);
      expect(id?.increment).toBe(true);

      const email = users?.columns.find((c) => c.name === 'email');
      expect(email?.unique).toBe(true);
      expect(email?.notNull).toBe(true);

      const createdAt = users?.columns.find((c) => c.name === 'created_at');
      expect(createdAt?.default).toBe('now()');
    });

    it('preserves model equivalence through serialization and re-parsing', () => {
      const model1 = parseSchema(dbml1);
      const serialized = serializeDbml(model1);

      const validRes = validateDbml(serialized);
      expect(validRes.ok).toBe(true);

      const model2 = parseSchema(serialized);

      // Deep compare tables, columns, enums, refs
      expect(model2.tables.map((t) => t.name)).toEqual(
        model1.tables.map((t) => t.name)
      );
      for (const t1 of model1.tables) {
        const t2 = model2.tables.find((t) => t.name === t1.name);
        expect(t2).toBeDefined();
        expect(t2?.columns).toEqual(t1.columns);
        expect(t2?.note).toEqual(t1.note);
      }

      expect(model2.enums).toEqual(model1.enums);

      // Refs comparison
      expect(model2.refs.length).toBe(model1.refs.length);
      for (const r1 of model1.refs) {
        const found = model2.refs.find(
          (r2) =>
            r2.from.table === r1.from.table &&
            r2.to.table === r1.to.table &&
            r2.relation === r1.relation
        );
        expect(found).toBeDefined();
      }
    });
  });

  describe('Schema Diffing', () => {
    it('detects no changes for identical schemas', () => {
      const m1 = parseSchema(dbml1);
      const m2 = parseSchema(dbml1);
      const changes = diffSchemas(m1, m2);
      expect(changes).toEqual([]);
    });

    it('detects table added and removed', () => {
      const before = parseSchema('Table users {\n  id int [pk]\n}');
      const after = parseSchema('Table posts {\n  id int [pk]\n  title varchar\n}');
      const changes = diffSchemas(before, after);

      expect(changes.some((c) => c.kind === 'table_removed' && c.table === 'users')).toBe(true);
      expect(changes.some((c) => c.kind === 'table_added' && c.table === 'posts')).toBe(true);
      // Ensure separate column_added/removed were NOT emitted for added/removed tables
      expect(changes.some((c) => c.kind === 'column_added')).toBe(false);
      expect(changes.some((c) => c.kind === 'column_removed')).toBe(false);
    });

    it('detects column added, removed, changed', () => {
      const before = parseSchema(`
        Table users {
          id int [pk]
          email varchar
          bio text
        }
      `);
      const after = parseSchema(`
        Table users {
          id int [pk]
          email varchar [not null, unique]
          avatar varchar
        }
      `);
      const changes = diffSchemas(before, after);

      const added = changes.find((c) => c.kind === 'column_added');
      expect(added).toMatchObject({
        kind: 'column_added',
        table: 'users',
        column: 'avatar',
      });

      const removed = changes.find((c) => c.kind === 'column_removed');
      expect(removed).toMatchObject({
        kind: 'column_removed',
        table: 'users',
        column: 'bio',
      });

      const changed = changes.find((c) => c.kind === 'column_changed');
      expect(changed).toMatchObject({
        kind: 'column_changed',
        table: 'users',
        column: 'email',
        fields: expect.arrayContaining(['unique', 'notNull']),
      });
    });

    it('detects enum added, removed and value changes', () => {
      const before = parseSchema(`
        Enum status {
          active
          inactive
        }
      `);
      const after = parseSchema(`
        Enum status {
          active
          archived
        }
        Enum role {
          admin
          user
        }
      `);
      const changes = diffSchemas(before, after);

      expect(
        changes.some((c) => c.kind === 'enum_added' && c.name === 'role')
      ).toBe(true);

      const enumChanged = changes.find((c) => c.kind === 'enum_changed');
      expect(enumChanged).toMatchObject({
        kind: 'enum_changed',
        name: 'status',
        addedValues: ['archived'],
        removedValues: ['inactive'],
      });
    });

    it('detects ref added and removed', () => {
      const before = parseSchema(`
        Table users {
          id int [pk]
        }
        Table orders {
          id int [pk]
          user_id int
        }
      `);
      const after = parseSchema(`
        Table users {
          id int [pk]
        }
        Table orders {
          id int [pk]
          user_id int
        }
        Ref: orders.user_id > users.id
      `);
      const changes = diffSchemas(before, after);
      expect(changes.some((c) => c.kind === 'ref_added')).toBe(true);
    });

    it('correctly calculates diff between fixture v1 and v2', () => {
      const m1 = parseSchema(dbml1);
      const m2 = parseSchema(dbml2);
      const changes = diffSchemas(m1, m2);

      expect(changes.length).toBeGreaterThan(0);
      expect(
        changes.some((c) => c.kind === 'table_added' && c.table === 'reviews')
      ).toBe(true);
      expect(
        changes.some(
          (c) =>
            c.kind === 'column_added' &&
            c.table === 'users' &&
            c.column === 'phone'
        )
      ).toBe(true);
      expect(
        changes.some(
          (c) =>
            c.kind === 'enum_changed' &&
            c.name === 'order_status' &&
            c.addedValues.includes('delivered')
        )
      ).toBe(true);

      const affected = affectedOf(changes);
      expect(affected).toContain('reviews');
      expect(affected).toContain('users');
      expect(affected).toContain('users.phone');
      expect(affected).toContain('enum:order_status');
    });
  });

  describe('Hashing and Normalization', () => {
    it('normalizes CRLF and trailing spaces', () => {
      const raw = 'Table t {   \r\n  id int [pk] \r\n}\r\n';
      const norm = normalizeDbml(raw);
      expect(norm).toBe('Table t {\n  id int [pk]\n}');
    });

    it('produces identical sha256 for CRLF and LF equivalents', () => {
      const lf = 'Table t {\n  id int\n}';
      const crlf = 'Table t {  \r\n  id int  \r\n}\r\n';
      expect(hashDbml(lf)).toBe(hashDbml(crlf));
    });
  });

  describe('Boolean Defaults & Composite Primary Keys', () => {
    it('serializes boolean and null defaults unquoted', () => {
      const dbml = serializeDbml({
        tables: [
          {
            name: 'settings',
            schema: 'public',
            columns: [
              { name: 'id', type: 'int', pk: true, increment: false, unique: false, notNull: true, default: null, note: null },
              { name: 'is_active', type: 'boolean', pk: false, increment: false, unique: false, notNull: true, default: 'true', note: null },
              { name: 'is_verified', type: 'boolean', pk: false, increment: false, unique: false, notNull: false, default: 'false', note: null },
            ],
            indexes: [],
            note: null,
          },
        ],
        refs: [],
        enums: [],
      });

      expect(dbml).toContain('is_active boolean [not null, default: true]');
      expect(dbml).toContain('is_verified boolean [default: false]');
      expect(dbml).not.toContain("default: 'true'");
      expect(dbml).not.toContain("default: 'false'");
    });

    it('parses and serializes composite primary keys in indexes', () => {
      const src = `
Table user_teams {
  user_id int
  team_id int

  Indexes {
    (user_id, team_id) [pk]
  }
}
      `.trim();

      const parsed = parseSchema(src);
      const userTeams = parsed.tables.find((t) => t.name === 'user_teams');
      expect(userTeams).toBeDefined();
      expect(userTeams?.indexes.length).toBe(1);
      expect(userTeams?.indexes[0]?.pk).toBe(true);
      expect(userTeams?.indexes[0]?.columns).toEqual(['user_id', 'team_id']);

      const serialized = serializeDbml(parsed);
      expect(serialized).toContain('(user_id, team_id) [pk]');
    });
  });
});

