import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { database } from '../src/storage.js';
import { createHttpApp } from '../src/web.js';

const email = 'integracao@estulanches.local';
const secret = process.env.JWT_SECRET || 'development-only-secret';
let server;
let origin;
let token;
let productId;
let createdOrderId;

before(async () => {
  await database.query('SELECT 1');
  const passwordHash = await bcrypt.hash('SenhaTeste123', 4);
  const account = await database.query(
    `INSERT INTO users(name,email,password_hash,role) VALUES('Conta de teste',$1,$2,'student')
     ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash RETURNING id`,
    [email, passwordHash]
  );
  token = jwt.sign({ id: account.rows[0].id, name: 'Conta de teste', role: 'student' }, secret);
  const item = await database.query(
    "INSERT INTO products(name,description,price) VALUES('Item de teste integração','Temporário',2.50) RETURNING id"
  );
  productId = item.rows[0].id;
  server = createHttpApp(database).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (createdOrderId) await database.query('DELETE FROM orders WHERE id=$1', [createdOrderId]);
  if (productId) await database.query('DELETE FROM products WHERE id=$1', [productId]);
  await database.query('DELETE FROM users WHERE email=$1', [email]);
  await database.end();
});

test('cardápio público apresenta o produto disponível', async () => {
  const response = await fetch(`${origin}/api/cardapio`);
  assert.equal(response.status, 200);
  const catalog = await response.json();
  assert.ok(catalog.some(product => product.id === productId));
});

test('pedido autenticado é gravado com seu total', async () => {
  const response = await fetch(`${origin}/api/encomendas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ items: [{ productId, quantity: 2 }] })
  });
  assert.equal(response.status, 201);
  const order = await response.json();
  createdOrderId = order.id;
  assert.equal(Number(order.total), 5);
  const stored = await database.query('SELECT id FROM orders WHERE id=$1', [createdOrderId]);
  assert.equal(stored.rowCount, 1);
});
