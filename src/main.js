import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { database } from './storage.js';
import { createHttpApp } from './web.js';

const port = Number(process.env.PORT || 3000);

async function boot() {
  const email = (process.env.ADMIN_EMAIL || 'cantina@estulanches.local').trim().toLowerCase();
  if (!process.env.ADMIN_PASSWORD || !process.env.JWT_SECRET) {
    throw new Error('Configure ADMIN_PASSWORD e JWT_SECRET antes de iniciar.');
  }
  const digest = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
  await database.query(
    `UPDATE users SET name=$1,email=$2,password_hash=$3,role='admin'
     WHERE email='admin@estulanches.local'
       AND NOT EXISTS (SELECT 1 FROM users WHERE email=$2)`,
    [process.env.ADMIN_NAME || 'Equipe da Cantina', email, digest]
  );
  await database.query(
    `INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,'admin')
     ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name,password_hash=EXCLUDED.password_hash,role='admin'`,
    [process.env.ADMIN_NAME || 'Equipe da Cantina', email, digest]
  );
  createHttpApp(database).listen(port, '0.0.0.0', () => {
    console.log(`EstuLanches iniciou na porta ${port}`);
  });
}

boot().catch(error => {
  console.error('Não foi possível iniciar o EstuLanches:', error);
  process.exit(1);
});

process.on('SIGTERM', async () => {
  await database.end();
  process.exit(0);
});
