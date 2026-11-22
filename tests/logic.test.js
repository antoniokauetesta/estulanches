import test from 'node:test';
import assert from 'node:assert/strict';
import { emailKey, orderValue, validStudent } from '../src/logic.js';

test('soma corretamente os itens do pedido', () => {
  assert.equal(orderValue([{ price: 5, quantity: 2 }, { price: 3.5, quantity: 1 }]), 13.5);
});

test('não permite pedido vazio ou quantidade inválida', () => {
  assert.throws(() => orderValue([]), /pelo menos um item/);
  assert.throws(() => orderValue([{ price: 5, quantity: 0 }]), /quantidade/);
});

test('padroniza o endereço de e-mail', () => {
  assert.equal(emailKey('  ALUNO@EXEMPLO.COM '), 'aluno@exemplo.com');
});

test('valida dados básicos do cadastro escolar', () => {
  assert.equal(validStudent('Ana Lima', 'ANA@escola.edu.br', 'senha123'), true);
  assert.equal(validStudent('', 'aluno@escola.edu.br', 'senha123'), false);
});
