import { describe, it, expect } from 'vitest';
import { Parser } from '@dbml/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('@dbml/core spike', () => {
  it('parses dbml format and inspects database model', () => {
    const fixturePath = resolve(__dirname, '../../../fixtures/ecommerce.dbml');
    const dbml = readFileSync(fixturePath, 'utf-8');
    const database = Parser.parse(dbml, 'dbml');

    expect(database).toBeDefined();
    expect(database.schemas).toBeDefined();
    expect(database.schemas.length).toBeGreaterThan(0);

    const publicSchema = database.schemas[0];
    expect(publicSchema.tables.length).toBe(4); // users, orders, order_items, products
    expect(publicSchema.enums.length).toBe(1);  // order_status
    expect(publicSchema.refs.length).toBe(3);   // 3 refs

    const usersTable = publicSchema.tables.find((t: any) => t.name === 'users');
    expect(usersTable).toBeDefined();
    expect(usersTable.fields.length).toBe(4);
    expect(usersTable.note).toBe('User accounts table');

    const emailField = usersTable.fields.find((f: any) => f.name === 'email');
    expect(emailField.unique).toBe(true);
    expect(emailField.not_null).toBe(true);
  });
});
