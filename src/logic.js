export function emailKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function orderValue(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('Adicione pelo menos um item ao pedido.');
  }
  return lines.reduce((sum, line) => {
    const price = Number(line.price);
    const quantity = Number(line.quantity);
    if (!Number.isFinite(price) || price < 0 || !Number.isInteger(quantity) || quantity < 1) {
      throw new Error('Confira o preço e a quantidade dos itens.');
    }
    return sum + price * quantity;
  }, 0);
}

export function validStudent(name, email, password) {
  return Boolean(String(name ?? '').trim()) && /^\S+@\S+\.\S+$/.test(emailKey(email))
    && typeof password === 'string' && password.length >= 8;
}
