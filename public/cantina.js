const byId = id => document.getElementById(id);
const phases = ['RECEBIDO', 'EM_PREPARACAO', 'PRONTO', 'CANCELADO'];
const glyphs = ['🥐', '🥪', '🧃', '🍰', '🍎', '🧀'];
let sessionToken = localStorage.getItem('estulanches_token');
let member = null;
let formMode = 'login';

function message(text, error = false) {
  const box = byId('message');
  box.textContent = text;
  box.classList.remove('hidden', 'error');
  if (error) box.classList.add('error');
}

async function request(route, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  const response = await fetch(`/api${route}`, { ...options, headers });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(body?.error || 'Não foi possível concluir a solicitação.');
  return body;
}

const safe = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));
const money = value => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function drawSession() {
  byId('session-area').innerHTML = member
    ? `<span class="muted">Oi, ${safe(member.name)}!</span> <button class="button button-light" id="logout">Sair</button>`
    : '<button class="button button-dark" id="login-open">Entrar</button>';
  byId('logout')?.addEventListener('click', signOut);
  byId('login-open')?.addEventListener('click', () => showAuth('login'));
  byId('orders-open').classList.toggle('hidden', !member);
  byId('admin-panel').classList.toggle('hidden', member?.role !== 'admin');
  if (member?.role === 'admin') refreshAdminOrders();
}

async function refreshMenu() {
  try {
    const menu = await request('/cardapio');
    byId('products').innerHTML = menu.length ? menu.map((item, index) => `
      <article class="menu-item"><div class="food-icon" aria-hidden="true">${glyphs[index % glyphs.length]}</div>
      <h3>${safe(item.name)}</h3><p>${safe(item.description || 'Preparado hoje na cantina.')}</p>
      <div class="item-bottom"><span class="price">${money(item.price)}</span>
      <button class="button button-dark" data-product="${Number(item.id)}" ${member ? '' : 'disabled'}>${member ? 'Quero esse +' : 'Entre para pedir'}</button></div></article>`).join('')
      : '<p class="muted">O cardápio está sendo preparado. Volte daqui a pouco!</p>';
    byId('products').querySelectorAll('[data-product]').forEach(button => {
      button.addEventListener('click', () => placeOrder(Number(button.dataset.product)));
    });
  } catch (error) { message(error.message, true); }
}

function showAuth(mode) {
  formMode = mode;
  byId('auth-panel').classList.remove('hidden');
  byId('name-wrap').classList.toggle('hidden', mode === 'login');
  byId('auth-title').textContent = mode === 'login' ? 'Que bom ter você por aqui.' : 'Vamos fazer seu cadastro.';
  byId('auth-submit').textContent = mode === 'login' ? 'Entrar na conta' : 'Criar minha conta';
  byId('password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  byId('auth-switch').innerHTML = mode === 'login'
    ? 'Primeira vez aqui? <button class="quiet-button" id="switch-auth">Crie seu cadastro</button>'
    : 'Já tem uma conta? <button class="quiet-button" id="switch-auth">Entrar</button>';
  byId('switch-auth').addEventListener('click', () => showAuth(mode === 'login' ? 'register' : 'login'));
  byId('auth-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function placeOrder(productId) {
  try {
    const order = await request('/encomendas', {
      method: 'POST', body: JSON.stringify({ items: [{ productId, quantity: 1 }] })
    });
    message(`Pedido #${order.id} recebido na cantina · ${money(order.total)}.`);
  } catch (error) { message(error.message, true); }
}

function orderCard(order, manageable = false) {
  const details = (order.items || []).map(item => `${safe(item.quantity)}× ${safe(item.product)}`).join(' · ');
  const time = new Date(order.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const selector = manageable ? `<div class="order-actions"><strong>${money(order.total)}</strong><select aria-label="Status do pedido ${order.id}" data-status="${Number(order.id)}">${phases.map(phase => `<option value="${phase}" ${phase === order.status ? 'selected' : ''}>${phase.replaceAll('_', ' ')}</option>`).join('')}</select></div>` : `<strong>${money(order.total)}</strong>`;
  return `<div class="order-row"><div><strong>Pedido #${Number(order.id)}${manageable ? ` · ${safe(order.customer)}` : ''}</strong><p>${safe(order.status.replaceAll('_', ' '))} · ${safe(time)}${details ? ` · ${details}` : ''}</p></div>${selector}</div>`;
}

async function openOrders() {
  try {
    const orders = await request('/encomendas');
    byId('orders-list').innerHTML = orders.length
      ? orders.map(order => orderCard(order)).join('')
      : '<p class="muted">Seus próximos pedidos aparecerão aqui.</p>';
    byId('orders-panel').classList.remove('hidden');
    byId('orders-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) { message(error.message, true); }
}

async function refreshAdminOrders() {
  try {
    const orders = await request('/encomendas');
    byId('admin-orders').innerHTML = orders.length
      ? orders.map(order => orderCard(order, true)).join('')
      : '<p class="muted">A fila da cantina está vazia.</p>';
    byId('admin-orders').querySelectorAll('[data-status]').forEach(select => {
      select.addEventListener('change', async () => {
        try {
          await request(`/encomendas/${select.dataset.status}/andamento`, {
            method: 'PATCH', body: JSON.stringify({ status: select.value })
          });
          message('Status do pedido atualizado.');
        } catch (error) { message(error.message, true); }
      });
    });
  } catch (error) { message(error.message, true); }
}

async function signOut() {
  sessionToken = null;
  member = null;
  localStorage.removeItem('estulanches_token');
  drawSession();
  await refreshMenu();
  message('Você saiu da sua conta. Até logo!');
}

byId('auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  const credentials = { email: byId('email').value, password: byId('password').value };
  try {
    if (formMode === 'register') {
      await request('/estudantes', {
        method: 'POST', body: JSON.stringify({ ...credentials, name: byId('name').value })
      });
    }
    const result = await request('/sessoes', { method: 'POST', body: JSON.stringify(credentials) });
    sessionToken = result.token;
    member = result.user;
    localStorage.setItem('estulanches_token', sessionToken);
    byId('auth-panel').classList.add('hidden');
    drawSession();
    await refreshMenu();
    message(`Bem-vindo(a), ${member.name}!`);
  } catch (error) { message(error.message, true); }
});

byId('product-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    await request('/cardapio', {
      method: 'POST', body: JSON.stringify({
        name: byId('product-name').value,
        description: byId('product-description').value,
        price: Number(byId('product-price').value)
      })
    });
    byId('product-form').reset();
    await refreshMenu();
    message('Produto adicionado ao cardápio.');
  } catch (error) { message(error.message, true); }
});

byId('login-open')?.addEventListener('click', () => showAuth('login'));
byId('auth-close').addEventListener('click', () => byId('auth-panel').classList.add('hidden'));
byId('orders-open').addEventListener('click', openOrders);
byId('orders-close').addEventListener('click', () => byId('orders-panel').classList.add('hidden'));
byId('refresh-admin').addEventListener('click', refreshAdminOrders);

async function startPage() {
  if (sessionToken) {
    try {
      await request('/encomendas');
      const payload = JSON.parse(atob(sessionToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      member = { id: payload.id, name: payload.name, role: payload.role };
    } catch {
      sessionToken = null;
      localStorage.removeItem('estulanches_token');
    }
  }
  drawSession();
  await refreshMenu();
}

startPage();
