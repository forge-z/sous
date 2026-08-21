import './styles.css';

const state = { tab: 'inventory', inventory: [], shopping: [], loading: true, error: '' };
const app = document.querySelector('#app');

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
}

async function load() {
  state.loading = true;
  render();
  try {
    const [inventory, shopping] = await Promise.all([api('/api/inventory'), api('/api/shopping')]);
    state.inventory = inventory.items;
    state.shopping = shopping.items;
    state.error = '';
  } catch (error) { state.error = error.message; }
  state.loading = false;
  render();
}

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function itemLabel(item) { return `${esc(item.quantity)} ${esc(item.unit)} · ${esc(item.name)}`; }

function inventoryView() {
  if (!state.inventory.length) return '<div class="empty">Seu estoque está vazio. Adicione o primeiro item acima.</div>';
  return state.inventory.map((item) => `<article class="item ${item.low_stock ? 'low' : ''}">
    <div><strong>${esc(item.name)}</strong><small>${item.low_stock ? 'Estoque baixo · ' : ''}${esc(item.unit)}</small></div>
    <div class="quantity"><button data-action="adjust" data-id="${item.id}" data-delta="-1" aria-label="Diminuir">−</button><b>${esc(item.quantity)}</b><button data-action="adjust" data-id="${item.id}" data-delta="1" aria-label="Aumentar">+</button></div>
    <button class="icon-button danger" data-action="delete-inventory" data-id="${item.id}" aria-label="Excluir">×</button>
  </article>`).join('');
}

function shoppingView() {
  if (!state.shopping.length) return '<div class="empty">A lista de compras está vazia.</div>';
  return state.shopping.map((item) => `<article class="item ${item.checked ? 'checked' : ''}">
    <label><input type="checkbox" data-action="toggle-shopping" data-id="${item.id}" ${item.checked ? 'checked' : ''}><span>${itemLabel(item)}</span></label>
    <button class="icon-button danger" data-action="delete-shopping" data-id="${item.id}" aria-label="Excluir">×</button>
  </article>`).join('');
}

function render() {
  app.innerHTML = `<div class="shell">
    <header><div><p class="eyebrow">COZINHA LOCAL · PT-BR</p><h1>Sous</h1><p class="subtitle">Seu estoque, sua lista, sem complicação.</p></div><span class="status">● offline-first</span></header>
    ${state.error ? `<div class="alert">${esc(state.error)} <button data-action="reload">Tentar novamente</button></div>` : ''}
    <nav class="tabs"><button class="${state.tab === 'inventory' ? 'active' : ''}" data-action="tab" data-tab="inventory">Estoque <span>${state.inventory.length}</span></button><button class="${state.tab === 'shopping' ? 'active' : ''}" data-action="tab" data-tab="shopping">Lista de compras <span>${state.shopping.filter((item) => !item.checked).length}</span></button></nav>
    <section class="command"><form id="command-form"><input name="text" placeholder="Ex.: comprei 2 kg de arroz" autocomplete="off"><button>Registrar</button></form><small>Você pode escrever como fala. Ex.: “comprar 1 leite”.</small></section>
    ${state.loading ? '<div class="loading">Carregando…</div>' : state.tab === 'inventory' ? `<section class="panel"><div class="section-heading"><div><p class="eyebrow">CONTROLE RÁPIDO</p><h2>Estoque</h2></div><button class="secondary" data-action="cook">O que posso cozinhar?</button></div><form id="inventory-form" class="add-form"><input name="name" required placeholder="Nome do item"><input name="quantity" type="number" min="0" step="0.1" value="1" aria-label="Quantidade"><select name="unit"><option>un</option><option>kg</option><option>g</option><option>l</option><option>ml</option></select><input name="min_quantity" type="number" min="0" step="0.1" value="0" aria-label="Estoque mínimo"><button>Adicionar</button></form><div class="list">${inventoryView()}</div><div id="cook-result" class="cook-result"></div></section>` : `<section class="panel"><div class="section-heading"><div><p class="eyebrow">PRÓXIMA COMPRA</p><h2>Lista de compras</h2></div></div><form id="shopping-form" class="add-form"><input name="name" required placeholder="O que comprar?"><input name="quantity" type="number" min="0" step="0.1" value="1" aria-label="Quantidade"><select name="unit"><option>un</option><option>kg</option><option>g</option><option>l</option><option>ml</option></select><button>Adicionar</button></form><div class="list">${shoppingView()}</div></section>`}
  </div>`;
}

app.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  try {
    if (button.dataset.action === 'tab') { state.tab = button.dataset.tab; render(); return; }
    if (button.dataset.action === 'reload') { await load(); return; }
    if (button.dataset.action === 'adjust') {
      const item = state.inventory.find((entry) => entry.id === Number(button.dataset.id));
      await api(`/api/inventory/${item.id}`, { method: 'PATCH', body: JSON.stringify({ quantity: Math.max(0, Number(item.quantity) + Number(button.dataset.delta)) }) });
      await load(); return;
    }
    if (button.dataset.action === 'delete-inventory') { await api(`/api/inventory/${button.dataset.id}`, { method: 'DELETE' }); await load(); return; }
    if (button.dataset.action === 'delete-shopping') { await api(`/api/shopping/${button.dataset.id}`, { method: 'DELETE' }); await load(); return; }
    if (button.dataset.action === 'cook') {
      const result = await api('/api/cook', { method: 'POST', body: '{}' });
      document.querySelector('#cook-result').textContent = result.suggestion;
    }
  } catch (error) { state.error = error.message; render(); }
});

app.addEventListener('change', async (event) => {
  const input = event.target.closest('[data-action="toggle-shopping"]');
  if (!input) return;
  try { await api(`/api/shopping/${input.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ checked: input.checked }) }); await load(); }
  catch (error) { state.error = error.message; render(); }
});

app.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const body = Object.fromEntries(new FormData(form));
  try {
    if (form.id === 'command-form') await api('/api/commands', { method: 'POST', body: JSON.stringify({ text: body.text }) });
    if (form.id === 'inventory-form') await api('/api/inventory', { method: 'POST', body: JSON.stringify(body) });
    if (form.id === 'shopping-form') await api('/api/shopping', { method: 'POST', body: JSON.stringify(body) });
    await load();
  } catch (error) { state.error = error.message; render(); }
});

render();
load();
