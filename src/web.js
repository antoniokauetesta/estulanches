import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { emailKey, orderValue, validStudent } from './logic.js';

export function createHttpApp(db) {
  const app = express();
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET precisa ter pelo menos 32 caracteres.');
  const run = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static('public'));

  function signedIn(req, res, next) {
    const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!bearer) return res.status(401).json({ error: 'Entre na sua conta para continuar.' });
    try {
      req.account = jwt.verify(bearer, secret);
      next();
    } catch {
      res.status(401).json({ error: 'Sua sessão expirou. Entre novamente.' });
    }
  }

  const managerOnly = (req, res, next) => req.account?.role === 'admin'
    ? next() : res.status(403).json({ error: 'Ação disponível apenas para a cantina.' });

  app.get('/api/saude', run(async (_req, res) => {
    await db.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  }));

  app.post('/api/estudantes', run(async (req, res) => {
    const { name, email, password } = req.body;
    if (!validStudent(name, email, password)) {
      return res.status(400).json({ error: 'Informe nome, e-mail válido e senha de pelo menos 8 caracteres.' });
    }
    const hash = await bcrypt.hash(password, 12);
    try {
      const inserted = await db.query(
        'INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email,role',
        [name.trim(), emailKey(email), hash]
      );
      res.status(201).json({ user: inserted.rows[0] });
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Este e-mail já possui cadastro.' });
      throw error;
    }
  }));

  app.post('/api/sessoes', run(async (req, res) => {
    const result = await db.query('SELECT * FROM users WHERE email=$1', [emailKey(req.body.email)]);
    const account = result.rows[0];
    const passwordMatches = account && typeof req.body.password === 'string'
      && await bcrypt.compare(req.body.password, account.password_hash);
    if (!passwordMatches) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    const token = jwt.sign({ id: account.id, name: account.name, role: account.role }, secret, { expiresIn: '8h' });
    res.json({ token, user: { id: account.id, name: account.name, email: account.email, role: account.role } });
  }));

  app.get('/api/cardapio', run(async (_req, res) => {
    const menu = await db.query(
      'SELECT id,name,description,price,available FROM products WHERE available=TRUE ORDER BY name'
    );
    res.json(menu.rows);
  }));

  app.post('/api/cardapio', signedIn, managerOnly, run(async (req, res) => {
    const { name, description = '', price } = req.body;
    const value = Number(price);
    if (!name?.trim() || !Number.isFinite(value) || value < 0) {
      return res.status(400).json({ error: 'Informe nome e preço válido.' });
    }
    const added = await db.query(
      'INSERT INTO products(name,description,price) VALUES($1,$2,$3) RETURNING *',
      [name.trim(), description, value]
    );
    res.status(201).json(added.rows[0]);
  }));

  app.put('/api/cardapio/:id', signedIn, managerOnly, run(async (req, res) => {
    const { name, description = '', price, available = true } = req.body;
    const value = Number(price);
    if (!name?.trim() || !Number.isFinite(value) || value < 0) {
      return res.status(400).json({ error: 'Confira os dados do produto.' });
    }
    const changed = await db.query(
      'UPDATE products SET name=$1,description=$2,price=$3,available=$4 WHERE id=$5 RETURNING *',
      [name.trim(), description, value, Boolean(available), req.params.id]
    );
    if (!changed.rowCount) return res.status(404).json({ error: 'Produto não encontrado.' });
    res.json(changed.rows[0]);
  }));

  app.delete('/api/cardapio/:id', signedIn, managerOnly, run(async (req, res) => {
    const removed = await db.query('UPDATE products SET available=FALSE WHERE id=$1 RETURNING id', [req.params.id]);
    if (!removed.rowCount) return res.status(404).json({ error: 'Produto não encontrado.' });
    res.status(204).end();
  }));

  app.post('/api/encomendas', signedIn, run(async (req, res) => {
    const lines = req.body.items;
    if (!Array.isArray(lines) || lines.length === 0 || lines.length > 30) {
      return res.status(400).json({ error: 'Escolha de 1 a 30 itens para o pedido.' });
    }
    const connection = await db.connect();
    try {
      await connection.query('BEGIN');
      const ids = [...new Set(lines.map(line => Number(line.productId)))];
      if (ids.some(id => !Number.isInteger(id) || id < 1)) {
        throw Object.assign(new Error('Produto inválido.'), { status: 400 });
      }
      const found = await connection.query(
        'SELECT id,name,price FROM products WHERE available=TRUE AND id=ANY($1::int[])', [ids]
      );
      if (found.rows.length !== ids.length) {
        throw Object.assign(new Error('Um dos produtos não está disponível.'), { status: 400 });
      }
      const catalog = new Map(found.rows.map(product => [product.id, product]));
      const items = lines.map(line => ({ product: catalog.get(Number(line.productId)), quantity: Number(line.quantity) }));
      const total = orderValue(items.map(item => ({ price: item.product.price, quantity: item.quantity })));
      const created = await connection.query(
        'INSERT INTO orders(user_id,total) VALUES($1,$2) RETURNING *', [req.account.id, total]
      );
      for (const item of items) {
        await connection.query(
          'INSERT INTO order_items(order_id,product_id,quantity,unit_price) VALUES($1,$2,$3,$4)',
          [created.rows[0].id, item.product.id, item.quantity, item.product.price]
        );
      }
      await connection.query('COMMIT');
      res.status(201).json({ ...created.rows[0], items: items.map(({ product, quantity }) => ({ product: product.name, quantity })) });
    } catch (error) {
      await connection.query('ROLLBACK');
      throw error;
    } finally {
      connection.release();
    }
  }));

  app.get('/api/encomendas', signedIn, run(async (req, res) => {
    const staff = req.account.role === 'admin';
    const listing = await db.query(
      `SELECT o.id,o.status,o.total,o.created_at,u.name AS customer,
       COALESCE(json_agg(json_build_object('product',p.name,'quantity',i.quantity,'unitPrice',i.unit_price))
       FILTER(WHERE i.id IS NOT NULL),'[]') AS items
       FROM orders o JOIN users u ON u.id=o.user_id
       LEFT JOIN order_items i ON i.order_id=o.id LEFT JOIN products p ON p.id=i.product_id
       ${staff ? '' : 'WHERE o.user_id=$1'}
       GROUP BY o.id,u.name ORDER BY o.created_at DESC`, staff ? [] : [req.account.id]
    );
    res.json(listing.rows);
  }));

  app.patch('/api/encomendas/:id/andamento', signedIn, managerOnly, run(async (req, res) => {
    const allowed = ['RECEBIDO', 'EM_PREPARACAO', 'PRONTO', 'CANCELADO'];
    if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Status inválido.' });
    const changed = await db.query('UPDATE orders SET status=$1 WHERE id=$2 RETURNING *', [req.body.status, req.params.id]);
    if (!changed.rowCount) return res.status(404).json({ error: 'Pedido não encontrado.' });
    res.json(changed.rows[0]);
  }));

  app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Erro interno do servidor.' });
  });
  return app;
}
