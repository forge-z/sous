import './styles.css';

const STORAGE = [
  ['despensa', 'Despensa'],
  ['geladeira', 'Geladeira'],
  ['freezer', 'Freezer'],
  ['fruteira', 'Fruteira'],
  ['bancada', 'Bancada'],
  ['outro', 'Outro'],
];
const state = { tab: 'inventory', inventory: [], shopping: [], loading: true, error: '', notice: '', commandDraft: '', editingId: null };
const app = document.querySelector('#app');

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Não foi possível concluir a operação (${response.status}).`);
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

function storageOptions(selected = '', automatic = false) {
  return `${automatic ? '<option value="">Automático</option>' : ''}${STORAGE.map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('')}`;
}

function dateLabel(item) {
  if (!item.expires_on) return 'Validade não informada';
  const date = new Date(`${item.expires_on}T12:00:00`);
  const formatted = Number.isNaN(date.getTime()) ? item.expires_on : date.toLocaleDateString('pt-BR');
  return `${item.expiry_estimated ? 'Validade estimada' : 'Vence'} em ${formatted}`;
}

function itemLabel(item) { return `${esc(item.quantity)} ${esc(item.unit)} · ${esc(item.name)}`; }

function inventoryView() {
  if (!state.inventory.length) return '<div class="empty"><strong>Seu estoque está vazio.</strong><span>Adicione um item ou escreva um comando acima.</span></div>';
  return state.inventory.map((item) => `<article class="item ${item.low_stock ? 'low' : ''}">
    <div class="item-main"><div class="item-title"><strong>${esc(item.name)}</strong>${item.low_stock ? '<span class="badge warning">baixo</span>' : ''}</div><small>${esc(item.quantity)} ${esc(item.unit)} · ${esc(item.storage_location || 'despensa')}</small><small class="muted">${dateLabel(item)}</small>
      <details class="item-details" ${state.editingId === item.id ? 'open' : ''}><summary>Editar detalhes</summary><form class="details-form" data-form="edit-inventory" data-id="${item.id}"><label>Local<select name="storage_location">${storageOptions(item.storage_location || 'despensa')}</select></label><label>Validade<input name="expires_on" type="date" value="${esc(item.expires_on || '')}"></label><button>Salvar</button></form></details>
    </div>
    <div class="quantity"><button type="button" data-action="adjust" data-id="${item.id}" data-delta="-1" aria-label="Diminuir">−</button><b>${esc(item.quantity)}</b><button type="button" data-action="adjust" data-id="${item.id}" data-delta="1" aria-label="Aumentar">+</button></div>
    <button type="button" class="icon-button danger" data-action="delete-inventory" data-id="${item.id}" aria-label="Excluir ${esc(item.name)}">×</button>
  </article>`).join('');
}

function shoppingView() {
  if (!state.shopping.length) return '<div class="empty"><strong>A lista de compras está vazia.</strong><span>Adicione o que estiver faltando.</span></div>';
  return state.shopping.map((item) => `<article class="item ${item.checked ? 'checked' : ''}">
    <label class="shopping-label"><input type="checkbox" data-action="toggle-shopping" data-id="${item.id}" ${item.checked ? 'checked' : ''}><span>${itemLabel(item)}</span></label>
    <button type="button" class="icon-button danger" data-action="delete-shopping" data-id="${item.id}" aria-label="Excluir ${esc(item.name)}">×</button>
  </article>`).join('');
}

function render() {
  app.innerHTML = `<div class="shell">
    <header><div><p class="eyebrow">COZINHA LOCAL · PT-BR</p><h1>Sous</h1><p class="subtitle">Seu estoque, sua lista, sem complicação.</p></div><span class="status"><i></i> offline-first</span></header>
    ${state.error ? `<div class="alert error"><span>${esc(state.error)}</span><button type="button" data-action="reload">Tentar novamente</button></div>` : ''}
    ${state.notice ? `<div class="alert success">${esc(state.notice)}</div>` : ''}
    <nav class="tabs"><button type="button" class="${state.tab === 'inventory' ? 'active' : ''}" data-action="tab" data-tab="inventory">Estoque <span>${state.inventory.length}</span></button><button type="button" class="${state.tab === 'shopping' ? 'active' : ''}" data-action="tab" data-tab="shopping">Lista de compras <span>${state.shopping.filter((item) => !item.checked).length}</span></button></nav>
    <section class="command"><div class="section-kicker"><span>COMANDO RÁPIDO</span><small>Separe vários itens com vírgulas ou “e”</small></div><form id="command-form"><div class="command-input"><input id="command-input" name="text" value="${esc(state.commandDraft)}" placeholder="Ex.: comprei arroz, leite e 1 kg de macarrão" autocomplete="off"><button type="button" class="clear-input" data-action="clear-command" aria-label="Limpar texto">×</button></div><button>Registrar</button></form><small class="hint">Ex.: “comprei frango, 6 litros de leite e 1 kg de macarrão”.</small></section>
    ${state.loading ? '<div class="loading">Carregando…</div>' : state.tab === 'inventory' ? `<section class="panel"><div class="section-heading"><div><p class="eyebrow">CONTROLE RÁPIDO</p><h2>Estoque</h2><p class="section-copy">O local é sugerido automaticamente; você pode ajustar.</p></div><button type="button" class="secondary" data-action="cook">O que posso cozinhar?</button></div><form id="inventory-form" class="add-form"><label class="field wide">Item<input name="name" required placeholder="Ex.: arroz"></label><label class="field">Quantidade<input name="quantity" type="number" min="0" step="0.1" value="1"></label><label class="field">Unidade<select name="unit"><option>un</option><option>kg</option><option>g</option><option>l</option><option>ml</option></select></label><label class="field">Local<select name="storage_location">${storageOptions('', true)}</select></label><label class="field">Validade<input name="expires_on" type="date"><span class="field-note">vazio = estimar</span></label><label class="auto-check"><input name="auto_expiry" type="checkbox" checked> Estimar validade</label><button>Adicionar</button></form><div class="list">${inventoryView()}</div><div id="cook-result" class="cook-result"></div></section>` : `<section class="panel"><div class="section-heading"><div><p class="eyebrow">PRÓXIMA COMPRA</p><h2>Lista de compras</h2></div></div><form id="shopping-form" class="add-form"><label class="field wide">Item<input name="name" required placeholder="Ex.: café"></label><label class="field">Quantidade<input name="quantity" type="number" min="0" step="0.1" value="1"></label><label class="field">Unidade<select name="unit"><option>un</option><option>kg</option><option>g</option><option>l</option><option>ml</option></select></label><button>Adicionar</button></form><div class="list">${shoppingView()}</div></section>`}
  </div>`;
}

app.addEventListener('input', (event) => {
  if (event.target.id === 'command-input') state.commandDraft = event.target.value;
});

app.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && event.target.id === 'command-input') { state.commandDraft = ''; render(); document.querySelector('#command-input')?.focus(); }
});

app.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  try {
    if (button.dataset.action === 'clear-command') { state.commandDraft = ''; render(); document.querySelector('#command-input')?.focus(); return; }
    if (button.dataset.action === 'tab') { state.tab = button.dataset.tab; state.notice = ''; render(); return; }
    if (button.dataset.action === 'reload') { await load(); return; }
    if (button.dataset.action === 'adjust') {
      const item = state.inventory.find((entry) => entry.id === Number(button.dataset.id));
      await api(`/api/inventory/${item.id}`, { method: 'PATCH', body: JSON.stringify({ quantity: Math.max(0, Number(item.quantity) + Number(button.dataset.delta)) }) });
      await load(); return;
    }
    if (button.dataset.action === 'delete-inventory') { await api(`/api/inventory/${button.dataset.id}`, { method: 'DELETE' }); state.notice = 'Item removido do estoque.'; await load(); return; }
    if (button.dataset.action === 'delete-shopping') { await api(`/api/shopping/${button.dataset.id}`, { method: 'DELETE' }); state.notice = 'Item removido da lista.'; await load(); return; }
    if (button.dataset.action === 'cook') { const result = await api('/api/cook', { method: 'POST', body: '{}' }); document.querySelector('#cook-result').textContent = result.suggestion; }
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
  try {
    if (form.id === 'command-form') {
      if (!state.commandDraft.trim()) return;
      const result = await api('/api/commands', { method: 'POST', body: JSON.stringify({ text: state.commandDraft }) });
      state.commandDraft = '';
      state.notice = result.items?.length > 1 ? `${result.items.length} itens registrados.` : 'Item registrado.';
    }
    if (form.id === 'inventory-form') {
      const body = Object.fromEntries(new FormData(form));
      body.auto_expiry = form.elements.auto_expiry.checked;
      await api('/api/inventory', { method: 'POST', body: JSON.stringify(body) });
      state.notice = 'Item adicionado ao estoque.';
    }
    if (form.id === 'shopping-form') { await api('/api/shopping', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); state.notice = 'Item adicionado à lista.'; }
    if (form.dataset.form === 'edit-inventory') { await api(`/api/inventory/${form.dataset.id}`, { method: 'PATCH', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); state.editingId = null; state.notice = 'Detalhes atualizados.'; }
    state.error = '';
    await load();
  } catch (error) { state.error = error.message; render(); }
});

render();
load();
