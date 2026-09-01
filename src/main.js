import './styles.css';

const STORAGE = [
  ['despensa', 'Despensa'],
  ['geladeira', 'Geladeira'],
  ['freezer', 'Freezer'],
  ['fruteira', 'Fruteira'],
  ['bancada', 'Bancada'],
  ['outro', 'Outro'],
];

const state = {
  tab: 'inventory',
  inventory: [],
  shopping: [],
  loading: true,
  submitting: false,
  error: '',
  notice: '',
  noticeType: 'success',
  commandDraft: '',
  editingId: null,
  filterStorage: 'todos',
  searchQuery: '',
  cookSuggestion: '',
  cookLoading: false,
};

const app = document.querySelector('#app');
const quantityFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
let noticeTimeoutId = null;

function formatQuantity(value) {
  const number = Number(value);
  return Number.isFinite(number) ? quantityFormat.format(number) : String(value ?? '');
}

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[char]));
}

function announce(message) {
  const el = document.querySelector('#live-announcer');
  if (el) el.textContent = message;
}

function setNotice(message, type = 'success') {
  state.notice = message;
  state.noticeType = type;
  announce(message);
  if (noticeTimeoutId) clearTimeout(noticeTimeoutId);
  // Expirar o aviso remove só a faixa: um render completo aqui apagaria o que
  // estiver sendo digitado em um formulário aberto.
  noticeTimeoutId = setTimeout(() => {
    state.notice = '';
    app.querySelector('.alert.success')?.remove();
  }, 4000);
}

function clearNotice() {
  state.notice = '';
  if (noticeTimeoutId) clearTimeout(noticeTimeoutId);
  app.querySelector('.alert.success')?.remove();
}

function setError(message) {
  state.error = message;
  announce(`Erro: ${message}`);
  render();
}

function clearError() {
  state.error = '';
  render();
}

function storageLabel(key) {
  const found = STORAGE.find(([k]) => k === key);
  return found ? found[1] : (key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Despensa');
}

function storageOptions(selected = '', includeAutomatic = false) {
  const autoOption = includeAutomatic ? '<option value="">Automático (sugerir local)</option>' : '';
  const options = STORAGE.map(
    ([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`
  ).join('');
  return `${autoOption}${options}`;
}

function parseLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d, 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getExpiryInfo(item) {
  if (!item.expires_on) {
    return {
      label: 'Validade não informada',
      badge: null,
      badgeClass: '',
      isExpired: false,
      isWarning: false,
    };
  }

  const expDate = parseLocalDate(item.expires_on);
  if (!expDate) {
    return {
      label: `Validade: ${esc(item.expires_on)}`,
      badge: null,
      badgeClass: '',
      isExpired: false,
      isWarning: false,
    };
  }

  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const diffMs = expDate.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const formatted = expDate.toLocaleDateString('pt-BR');
  const prefix = item.expiry_estimated ? 'Validade estimada:' : 'Vence em:';

  if (diffDays < 0) {
    const pastDays = Math.abs(diffDays);
    return {
      label: `Vencido há ${pastDays} ${pastDays === 1 ? 'dia' : 'dias'} (${formatted})`,
      badge: 'Vencido',
      badgeClass: 'badge-danger',
      isExpired: true,
      isWarning: true,
    };
  }

  if (diffDays === 0) {
    return {
      label: `Vence hoje (${formatted})`,
      badge: 'Vence hoje',
      badgeClass: 'badge-urgent',
      isExpired: false,
      isWarning: true,
    };
  }

  if (diffDays === 1) {
    return {
      label: `Vence amanhã (${formatted})`,
      badge: 'Vence amanhã',
      badgeClass: 'badge-urgent',
      isExpired: false,
      isWarning: true,
    };
  }

  if (diffDays <= 3) {
    return {
      label: `Vence em ${diffDays} dias (${formatted})`,
      badge: `Vence em ${diffDays}d`,
      badgeClass: 'badge-warning',
      isExpired: false,
      isWarning: true,
    };
  }

  return {
    label: `${prefix} ${formatted}`,
    badge: item.expiry_estimated ? 'Estimada' : null,
    badgeClass: 'badge-subtle',
    isExpired: false,
    isWarning: false,
  };
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined && !headers['content-type']) {
    headers['content-type'] = 'application/json';
  }
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Não foi possível concluir a operação (${response.status}).`);
  }
  return data;
}

async function load(silent = false) {
  if (!silent) {
    state.loading = true;
    render();
  }
  try {
    const [inventory, shopping] = await Promise.all([api('/api/inventory'), api('/api/shopping')]);
    state.inventory = inventory.items || [];
    state.shopping = shopping.items || [];
    state.error = '';
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
    render();
  }
}

function getFilteredInventory() {
  let list = state.inventory;

  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase().trim();
    list = list.filter((item) =>
      item.name.toLowerCase().includes(q) ||
      (item.storage_location && item.storage_location.toLowerCase().includes(q))
    );
  }

  if (state.filterStorage === 'alertas') {
    list = list.filter((item) => {
      const exp = getExpiryInfo(item);
      return item.low_stock || exp.isWarning || exp.isExpired;
    });
  } else if (state.filterStorage !== 'todos') {
    list = list.filter((item) => (item.storage_location || 'despensa') === state.filterStorage);
  }

  return list;
}

function inventoryCountByStorage(storageKey) {
  if (storageKey === 'todos') return state.inventory.length;
  if (storageKey === 'alertas') {
    return state.inventory.filter((item) => {
      const exp = getExpiryInfo(item);
      return item.low_stock || exp.isWarning || exp.isExpired;
    }).length;
  }
  return state.inventory.filter((item) => (item.storage_location || 'despensa') === storageKey).length;
}

function inventoryView() {
  const filtered = getFilteredInventory();

  if (!state.inventory.length) {
    return `
      <div class="empty">
        <div class="empty-icon" aria-hidden="true">🧺</div>
        <strong>Seu estoque está vazio.</strong>
        <p>Adicione um item no formulário acima ou use o comando rápido (ex: <em>“comprei 2kg de arroz”</em>).</p>
      </div>`;
  }

  if (!filtered.length) {
    return `
      <div class="empty">
        <div class="empty-icon" aria-hidden="true">🔍</div>
        <strong>Nenhum item encontrado com o filtro selecionado.</strong>
        <p>Tente limpar a busca ou selecionar outro local de armazenamento.</p>
        <div>
          <button type="button" class="secondary" data-action="reset-filter">Limpar filtros</button>
        </div>
      </div>`;
  }

  return filtered.map((item) => {
    const exp = getExpiryInfo(item);
    const isLow = Boolean(item.low_stock);
    const isExpired = exp.isExpired;
    const isEditing = state.editingId === item.id;

    let itemClasses = 'item';
    if (isExpired) itemClasses += ' expired';
    else if (isLow) itemClasses += ' low-stock';

    return `
      <article class="${itemClasses}" data-item-id="${item.id}">
        <div class="item-main">
          <div class="item-title">
            <strong>${esc(item.name)}</strong>
            ${isLow ? '<span class="badge badge-warning" title="Estoque igual ou menor que o mínimo">Estoque baixo</span>' : ''}
            ${exp.badge ? `<span class="badge ${exp.badgeClass}">${esc(exp.badge)}</span>` : ''}
          </div>
          <div class="item-meta">
            <small><strong>${esc(formatQuantity(item.quantity))} ${esc(item.unit)}</strong> · Local: <em>${esc(storageLabel(item.storage_location))}</em></small>
            <small class="${exp.isWarning || exp.isExpired ? '' : 'muted'}">${esc(exp.label)}</small>
          </div>
          <details class="item-details" ${isEditing ? 'open' : ''} data-id="${item.id}">
            <summary data-action="toggle-edit" data-id="${item.id}">${isEditing ? 'Ocultar detalhes' : 'Editar detalhes'}</summary>
            <form class="details-form" data-form="edit-inventory" data-id="${item.id}">
              <label>
                Nome
                <input name="name" required value="${esc(item.name)}">
              </label>
              <label>
                Quantidade
                <input name="quantity" type="number" min="0" step="0.1" value="${esc(item.quantity)}">
              </label>
              <label>
                Unidade
                <select name="unit">
                  <option value="un" ${item.unit === 'un' ? 'selected' : ''}>un</option>
                  <option value="kg" ${item.unit === 'kg' ? 'selected' : ''}>kg</option>
                  <option value="g" ${item.unit === 'g' ? 'selected' : ''}>g</option>
                  <option value="l" ${item.unit === 'l' ? 'selected' : ''}>l</option>
                  <option value="ml" ${item.unit === 'ml' ? 'selected' : ''}>ml</option>
                </select>
              </label>
              <label>
                Local
                <select name="storage_location">${storageOptions(item.storage_location || 'despensa', true)}</select>
              </label>
              <label>
                Estoque Mínimo
                <input name="min_quantity" type="number" min="0" step="0.1" value="${esc(item.min_quantity ?? 0)}" title="Alerta quando a quantidade for menor ou igual a este valor">
              </label>
              <label>
                Validade
                <input name="expires_on" type="date" value="${esc(item.expires_on || '')}">
                <span class="field-note">vazio = sem validade</span>
              </label>
              <div class="details-form-actions">
                <button type="submit" class="primary" ${state.submitting ? 'disabled' : ''}>Salvar</button>
                <button type="button" class="secondary" data-action="close-edit">Cancelar</button>
              </div>
            </form>
          </details>
        </div>
        <div class="item-actions">
          <div class="quantity" role="group" aria-label="Ajustar quantidade de ${esc(item.name)}">
            <button type="button" class="quantity-button" data-action="adjust" data-id="${item.id}" data-delta="-1" aria-label="Diminuir 1 ${esc(item.unit)} de ${esc(item.name)}" ${Number(item.quantity) <= 0 || state.submitting ? 'disabled' : ''}>−</button>
            <b>${esc(formatQuantity(item.quantity))}</b>
            <button type="button" class="quantity-button" data-action="adjust" data-id="${item.id}" data-delta="1" aria-label="Aumentar 1 ${esc(item.unit)} de ${esc(item.name)}" ${state.submitting ? 'disabled' : ''}>+</button>
          </div>
          ${isLow || isExpired ? `<button type="button" class="icon-button" data-action="restock" data-id="${item.id}" aria-label="Adicionar ${esc(item.name)} à lista de compras" title="Adicionar à lista de compras" ${state.submitting ? 'disabled' : ''}>🛒</button>` : ''}
          <button type="button" class="icon-button danger" data-action="delete-inventory" data-id="${item.id}" aria-label="Excluir ${esc(item.name)} do estoque" title="Excluir item" ${state.submitting ? 'disabled' : ''}>×</button>
        </div>
      </article>`;
  }).join('');
}

function shoppingView() {
  if (!state.shopping.length) {
    return `
      <div class="empty">
        <div class="empty-icon" aria-hidden="true">🛒</div>
        <strong>Sua lista de compras está vazia.</strong>
        <p>Adicione os itens que estão faltando ou digite um comando (ex: <em>“comprar 1 café e açúcar”</em>).</p>
      </div>`;
  }

  return state.shopping.map((item) => `
    <article class="item ${item.checked ? 'checked' : ''}" data-item-id="${item.id}">
      <label class="shopping-label">
        <input type="checkbox" data-action="toggle-shopping" data-id="${item.id}" ${item.checked ? 'checked' : ''} aria-label="Marcar ${esc(item.name)} como comprado">
        <div class="shopping-text">
          <strong>${esc(item.name)}</strong>
          <small>${esc(formatQuantity(item.quantity))} ${esc(item.unit)}</small>
        </div>
      </label>
      <div class="item-actions">
        <button type="button" class="icon-button danger" data-action="delete-shopping" data-id="${item.id}" aria-label="Excluir ${esc(item.name)} da lista" title="Excluir item" ${state.submitting ? 'disabled' : ''}>×</button>
      </div>
    </article>
  `).join('');
}

// O render recria o DOM inteiro; sem isso o foco e o cursor se perdem sempre
// que uma atualização chega enquanto o usuário digita ou usa o teclado.
const FOCUS_KEYS = ['action', 'id', 'tab', 'filter', 'delta', 'text'];

function focusSelector(element) {
  if (element.id) return `#${element.id}`;
  const form = element.closest('form[data-form][data-id]');
  if (form && element.name) {
    return `form[data-form="${form.dataset.form}"][data-id="${form.dataset.id}"] [name="${element.name}"]`;
  }
  if (!element.dataset?.action) return null;
  const parts = FOCUS_KEYS
    .filter((key) => element.dataset[key] !== undefined)
    .map((key) => (element.dataset[key].includes('"') ? null : `[data-${key}="${element.dataset[key]}"]`));
  return parts.includes(null) ? null : parts.join('');
}

function captureFocus() {
  const element = document.activeElement;
  if (!element || !app.contains(element)) return null;
  const selector = focusSelector(element);
  if (!selector) return null;
  try {
    return { selector, start: element.selectionStart, end: element.selectionEnd };
  } catch {
    return { selector }; // campos como number/date não expõem seleção
  }
}

function restoreFocus(snapshot) {
  const element = snapshot && app.querySelector(snapshot.selector);
  if (!element) return;
  element.focus({ preventScroll: true });
  if (snapshot.start === null || snapshot.start === undefined) return;
  try {
    element.setSelectionRange(snapshot.start, snapshot.end);
  } catch { /* seleção indisponível para este campo */ }
}

function render() {
  const focused = captureFocus();
  const pendingCount = state.shopping.filter((item) => !item.checked).length;
  const hasCompletedShopping = state.shopping.some((item) => item.checked);
  const alertsCount = inventoryCountByStorage('alertas');

  app.innerHTML = `
    <div class="shell">
      <header>
        <div>
          <p class="eyebrow">COZINHA INTELIGENTE · SOUS LITE</p>
          <h1>Sous</h1>
          <p class="subtitle">Seu estoque e sua lista de compras sincronizados, sem complicação.</p>
        </div>
        <span class="status"><i></i> dados locais, sem nuvem</span>
      </header>

      ${state.error ? `
        <div class="alert error" role="alert">
          <div class="alert-content">
            <span aria-hidden="true">⚠️</span>
            <span>${esc(state.error)}</span>
          </div>
          <div class="alert-actions">
            <button type="button" class="link-button" data-action="reload">Tentar novamente</button>
            <button type="button" class="close-alert" data-action="clear-error" aria-label="Fechar aviso de erro">×</button>
          </div>
        </div>
      ` : ''}

      ${state.notice ? `
        <div class="alert success" role="status">
          <div class="alert-content">
            <span aria-hidden="true">✓</span>
            <span>${esc(state.notice)}</span>
          </div>
          <button type="button" class="close-alert" data-action="clear-notice" aria-label="Fechar aviso">×</button>
        </div>
      ` : ''}

      <nav class="tabs" role="tablist" aria-label="Seções do aplicativo">
        <button type="button" id="tab-inventory" class="tab-button ${state.tab === 'inventory' ? 'active' : ''}" role="tab" aria-selected="${state.tab === 'inventory'}" aria-controls="panel-inventory" data-action="tab" data-tab="inventory">
          Estoque <span class="tab-badge" aria-label="${state.inventory.length} itens no estoque">${state.inventory.length}</span>
        </button>
        <button type="button" id="tab-shopping" class="tab-button ${state.tab === 'shopping' ? 'active' : ''}" role="tab" aria-selected="${state.tab === 'shopping'}" aria-controls="panel-shopping" data-action="tab" data-tab="shopping">
          Lista de compras <span class="tab-badge" aria-label="${pendingCount} itens pendentes para comprar">${pendingCount}</span>
        </button>
      </nav>

      <section class="command" aria-label="Entrada de comandos rápidos">
        <div class="section-kicker">
          <span>COMANDO RÁPIDO EM LINGUAGEM NATURAL</span>
          <small>Separe múltiplos itens por vírgulas ou “e”</small>
        </div>
        <form id="command-form">
          <div class="command-input-wrapper">
            <input
              id="command-input"
              name="text"
              value="${esc(state.commandDraft)}"
              placeholder="Ex.: comprei 2 kg de arroz, 1 leite e 500g de queijo"
              autocomplete="off"
              aria-label="Comando rápido de compras ou estoque"
            >
            ${state.commandDraft ? `<button type="button" class="clear-input" data-action="clear-command" aria-label="Limpar texto">×</button>` : ''}
          </div>
          <button type="submit" class="primary" ${state.submitting ? 'disabled' : ''}>
            ${state.submitting ? 'Processando…' : 'Registrar'}
          </button>
        </form>
        <div class="command-chips" aria-label="Exemplos rápidos de comando">
          <span>Exemplos:</span>
          <button type="button" class="chip-btn" data-action="chip-fill" data-text="comprei 2 kg de arroz e 1 feijao">“comprei 2 kg de arroz e 1 feijao”</button>
          <button type="button" class="chip-btn" data-action="chip-fill" data-text="comprar café e azeite">“comprar café e azeite”</button>
          <button type="button" class="chip-btn" data-action="chip-fill" data-text="comprei frango, 6 ovos e 1kg de tomate">“comprei frango, 6 ovos e 1kg de tomate”</button>
        </div>
      </section>

      ${state.loading ? `
        <div class="loading">
          <div class="empty-icon" aria-hidden="true">⏳</div>
          <strong>Carregando seus dados…</strong>
          <p>Conectando ao banco de dados da cozinha.</p>
        </div>
      ` : state.tab === 'inventory' ? `
        <section id="panel-inventory" class="panel" role="tabpanel" aria-labelledby="tab-inventory">
          <div class="section-heading">
            <div>
              <p class="eyebrow">DISPENSA &amp; GELADEIRA</p>
              <h2>Estoque da Cozinha</h2>
              <p class="section-copy">Monitore validades, locais de armazenamento e receba alertas de reposição.</p>
            </div>
            <div class="heading-actions">
              <button type="button" class="secondary" data-action="cook" ${state.cookLoading ? 'disabled' : ''}>
                ${state.cookLoading ? 'Pensando na receita…' : '🍳 O que posso cozinhar?'}
              </button>
            </div>
          </div>

          ${state.cookSuggestion ? `
            <div class="cook-card" role="region" aria-label="Sugestão do Chef">
              <div class="cook-card-content">
                <div class="cook-card-title">
                  <span aria-hidden="true">👨‍🍳</span>
                  <span>Sugestão do Chef Sous</span>
                </div>
                <p>${esc(state.cookSuggestion)}</p>
              </div>
              <button type="button" class="icon-button" data-action="close-cook" aria-label="Fechar sugestão" title="Fechar sugestão">×</button>
            </div>
          ` : ''}

          <form id="inventory-form" class="add-form" aria-label="Adicionar item ao estoque">
            <label class="field item-field">
              Item *
              <input name="name" required placeholder="Ex.: arroz" autocomplete="off">
            </label>
            <label class="field quantity-field">
              Quantidade
              <input name="quantity" type="number" min="0" step="0.1" value="1">
            </label>
            <label class="field unit-field">
              Unidade
              <select name="unit">
                <option value="un">un</option>
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="l">l</option>
                <option value="ml">ml</option>
              </select>
            </label>
            <label class="field location-field">
              Local
              <select name="storage_location">${storageOptions('', true)}</select>
            </label>
            <label class="field expiry-field">
              Validade
              <input name="expires_on" type="date">
              <span class="field-note">vazio = estimativa auto</span>
            </label>
            <label class="auto-check">
              <input name="auto_expiry" type="checkbox" checked>
              Estimar validade
            </label>
            <button type="submit" class="primary" ${state.submitting ? 'disabled' : ''}>+ Adicionar ao Estoque</button>
          </form>

          <div class="filter-bar" aria-label="Filtros do estoque">
            <div class="filter-chips" role="toolbar" aria-label="Filtrar por local">
              <button type="button" class="filter-chip ${state.filterStorage === 'todos' ? 'active' : ''}" data-action="filter-storage" data-filter="todos">
                Todos (${inventoryCountByStorage('todos')})
              </button>
              <button type="button" class="filter-chip ${state.filterStorage === 'geladeira' ? 'active' : ''}" data-action="filter-storage" data-filter="geladeira">
                Geladeira (${inventoryCountByStorage('geladeira')})
              </button>
              <button type="button" class="filter-chip ${state.filterStorage === 'despensa' ? 'active' : ''}" data-action="filter-storage" data-filter="despensa">
                Despensa (${inventoryCountByStorage('despensa')})
              </button>
              <button type="button" class="filter-chip ${state.filterStorage === 'freezer' ? 'active' : ''}" data-action="filter-storage" data-filter="freezer">
                Freezer (${inventoryCountByStorage('freezer')})
              </button>
              <button type="button" class="filter-chip ${state.filterStorage === 'fruteira' ? 'active' : ''}" data-action="filter-storage" data-filter="fruteira">
                Fruteira (${inventoryCountByStorage('fruteira')})
              </button>
              ${alertsCount > 0 ? `
                <button type="button" class="filter-chip ${state.filterStorage === 'alertas' ? 'active' : ''}" data-action="filter-storage" data-filter="alertas">
                  ⚠️ Alertas (${alertsCount})
                </button>
              ` : ''}
            </div>
            <div class="filter-search">
              <input
                id="search-input"
                type="search"
                placeholder="Buscar no estoque…"
                value="${esc(state.searchQuery)}"
                aria-label="Buscar item no estoque"
              >
              ${state.searchQuery ? `<button type="button" class="clear-search" data-action="clear-search" aria-label="Limpar busca">×</button>` : ''}
            </div>
          </div>

          <div class="list" role="feed" aria-label="Lista de itens em estoque">
            ${inventoryView()}
          </div>
        </section>
      ` : `
        <section id="panel-shopping" class="panel" role="tabpanel" aria-labelledby="tab-shopping">
          <div class="section-heading">
            <div>
              <p class="eyebrow">PLANEJAMENTO DE COMPRAS</p>
              <h2>Lista de Compras</h2>
              <p class="section-copy">Marque os itens conforme for ao mercado para manter sua despensa abastecida.</p>
            </div>
            <div class="heading-actions">
              ${hasCompletedShopping ? `
                <button type="button" class="primary" data-action="checkout-shopping" ${state.submitting ? 'disabled' : ''}>
                  Mover comprados para o estoque
                </button>
                <button type="button" class="secondary" data-action="clear-completed-shopping" ${state.submitting ? 'disabled' : ''}>
                  Limpar comprados
                </button>
              ` : ''}
            </div>
          </div>

          <form id="shopping-form" class="add-form" aria-label="Adicionar item à lista de compras">
            <label class="field item-field">
              Item *
              <input name="name" required placeholder="Ex.: café em pó" autocomplete="off">
            </label>
            <label class="field quantity-field">
              Quantidade
              <input name="quantity" type="number" min="0" step="0.1" value="1">
            </label>
            <label class="field unit-field">
              Unidade
              <select name="unit">
                <option value="un">un</option>
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="l">l</option>
                <option value="ml">ml</option>
              </select>
            </label>
            <button type="submit" class="primary" ${state.submitting ? 'disabled' : ''}>+ Adicionar à Lista</button>
          </form>

          <div class="list" role="feed" aria-label="Itens da lista de compras">
            ${shoppingView()}
          </div>
        </section>
      `}
    </div>`;

  restoreFocus(focused);
}

// Event Listeners

app.addEventListener('input', (event) => {
  if (event.target.id === 'command-input') {
    state.commandDraft = event.target.value;
  }
  if (event.target.id === 'search-input') {
    state.searchQuery = event.target.value;
    const listEl = app.querySelector('.list');
    if (listEl && state.tab === 'inventory') {
      listEl.innerHTML = inventoryView();
    }
  }
});

app.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (event.target.id === 'command-input') {
      state.commandDraft = '';
      render();
      document.querySelector('#command-input')?.focus();
    } else if (event.target.id === 'search-input') {
      state.searchQuery = '';
      render();
      document.querySelector('#search-input')?.focus();
    }
  }

  // Keyboard navigation for tabs
  if (event.target.getAttribute('role') === 'tab') {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const nextTab = state.tab === 'inventory' ? 'shopping' : 'inventory';
      state.tab = nextTab;
      state.error = '';
      render();
      document.querySelector(`#tab-${nextTab}`)?.focus();
    }
  }
});

app.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;

  const action = button.dataset.action;

  try {
    if (action === 'tab') {
      state.tab = button.dataset.tab;
      state.error = '';
      render();
      return;
    }

    if (action === 'clear-command') {
      state.commandDraft = '';
      render();
      document.querySelector('#command-input')?.focus();
      return;
    }

    if (action === 'chip-fill') {
      state.commandDraft = button.dataset.text || '';
      render();
      const input = document.querySelector('#command-input');
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
      return;
    }

    if (action === 'clear-search' || action === 'reset-filter') {
      state.searchQuery = '';
      state.filterStorage = 'todos';
      render();
      return;
    }

    if (action === 'filter-storage') {
      state.filterStorage = button.dataset.filter;
      render();
      return;
    }

    if (action === 'clear-notice') {
      clearNotice();
      return;
    }

    if (action === 'clear-error') {
      clearError();
      return;
    }

    if (action === 'reload') {
      await load();
      return;
    }

    if (action === 'toggle-edit') {
      const id = Number(button.dataset.id);
      state.editingId = state.editingId === id ? null : id;
      render();
      return;
    }

    if (action === 'close-edit') {
      state.editingId = null;
      render();
      return;
    }

    if (action === 'adjust') {
      const id = Number(button.dataset.id);
      const delta = Number(button.dataset.delta);
      const item = state.inventory.find((entry) => entry.id === id);
      if (!item) return;

      const currentQty = Number(item.quantity) || 0;
      const newQty = Math.max(0, Math.round((currentQty + delta) * 100) / 100);

      state.submitting = true;
      button.disabled = true;

      await api(`/api/inventory/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity: newQty }),
      });

      state.submitting = false;
      await load(true);
      return;
    }

    if (action === 'delete-inventory') {
      const id = Number(button.dataset.id);
      const item = state.inventory.find((entry) => entry.id === id);
      const itemName = item ? item.name : 'Item';

      state.submitting = true;
      button.disabled = true;

      await api(`/api/inventory/${id}`, { method: 'DELETE' });
      setNotice(`"${itemName}" removido do estoque.`);
      state.submitting = false;
      await load(true);
      return;
    }

    if (action === 'delete-shopping') {
      const id = Number(button.dataset.id);
      const item = state.shopping.find((entry) => entry.id === id);
      const itemName = item ? item.name : 'Item';

      state.submitting = true;
      button.disabled = true;

      await api(`/api/shopping/${id}`, { method: 'DELETE' });
      setNotice(`"${itemName}" removido da lista.`);
      state.submitting = false;
      await load(true);
      return;
    }

    if (action === 'restock') {
      const id = Number(button.dataset.id);
      const item = state.inventory.find((entry) => entry.id === id);
      if (!item) return;

      const missing = Number(item.min_quantity) - Number(item.quantity);
      const quantity = Math.max(Math.round(missing * 100) / 100, 1);

      state.submitting = true;
      button.disabled = true;

      await api('/api/shopping', {
        method: 'POST',
        body: JSON.stringify({ name: item.name, quantity, unit: item.unit }),
      });
      setNotice(`"${item.name}" adicionado à lista de compras.`);
      state.submitting = false;
      await load(true);
      return;
    }

    if (action === 'checkout-shopping') {
      state.submitting = true;
      render();

      const result = await api('/api/shopping/checkout', { method: 'POST', body: '{}' });
      setNotice(result.moved === 1
        ? `"${result.items[0].name}" foi para o estoque.`
        : `${result.moved} itens foram para o estoque.`);
      state.submitting = false;
      await load(true);
      return;
    }

    if (action === 'clear-completed-shopping') {
      const completed = state.shopping.filter((item) => item.checked);
      if (!completed.length) return;

      state.submitting = true;
      render();

      await Promise.all(completed.map((item) => api(`/api/shopping/${item.id}`, { method: 'DELETE' })));
      setNotice(`${completed.length} ${completed.length === 1 ? 'item comprado removido' : 'itens comprados removidos'}.`);
      state.submitting = false;
      await load(true);
      return;
    }

    if (action === 'cook') {
      state.cookLoading = true;
      render();
      const result = await api('/api/cook', { method: 'POST', body: '{}' });
      state.cookSuggestion = result.suggestion;
      state.cookLoading = false;
      render();
      return;
    }

    if (action === 'close-cook') {
      state.cookSuggestion = '';
      render();
      return;
    }
  } catch (error) {
    state.submitting = false;
    state.cookLoading = false;
    setError(error.message);
  }
});

app.addEventListener('change', async (event) => {
  const input = event.target.closest('[data-action="toggle-shopping"]');
  if (!input) return;

  try {
    const id = Number(input.dataset.id);
    const checked = input.checked;
    await api(`/api/shopping/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ checked }),
    });
    await load(true);
  } catch (error) {
    setError(error.message);
  }
});

app.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;

  try {
    state.submitting = true;

    if (form.id === 'command-form') {
      const text = state.commandDraft.trim();
      if (!text) {
        state.submitting = false;
        return;
      }

      const result = await api('/api/commands', {
        method: 'POST',
        body: JSON.stringify({ text }),
      });

      state.commandDraft = '';
      const count = result.items?.length || 1;
      setNotice(count > 1 ? `${count} itens registrados com sucesso!` : 'Item registrado com sucesso!');
      state.error = '';
      state.submitting = false;
      await load(true);
      return;
    }

    if (form.id === 'inventory-form') {
      const formData = new FormData(form);
      const body = Object.fromEntries(formData);
      body.auto_expiry = form.elements.auto_expiry.checked;

      const { item, merged } = await api('/api/inventory', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      form.reset();
      // Keep auto_expiry checked by default
      if (form.elements.auto_expiry) form.elements.auto_expiry.checked = true;

      setNotice(merged
        ? `Estoque de "${item.name}" atualizado para ${formatQuantity(item.quantity)} ${item.unit}.`
        : `"${item.name}" adicionado ao estoque.`);
      state.error = '';
      state.submitting = false;
      await load(true);
      return;
    }

    if (form.id === 'shopping-form') {
      const formData = new FormData(form);
      const body = Object.fromEntries(formData);

      const { item, merged } = await api('/api/shopping', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      form.reset();

      setNotice(merged
        ? `"${item.name}" atualizado para ${formatQuantity(item.quantity)} ${item.unit} na lista.`
        : `"${item.name}" adicionado à lista de compras.`);
      state.error = '';
      state.submitting = false;
      await load(true);
      return;
    }

    if (form.dataset.form === 'edit-inventory') {
      const id = Number(form.dataset.id);
      const formData = new FormData(form);
      const body = Object.fromEntries(formData);

      await api(`/api/inventory/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });

      state.editingId = null;
      setNotice('Detalhes do item atualizados com sucesso.');
      state.error = '';
      state.submitting = false;
      await load(true);
      return;
    }
  } catch (error) {
    state.submitting = false;
    setError(error.message);
  }
});

// Initial startup
render();
load();
