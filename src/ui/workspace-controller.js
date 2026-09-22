import { MOBILE_PRIMARY_VIEW_IDS } from '../core/route-contract.js';

const mobilePrimaryViewIds = new Set(MOBILE_PRIMARY_VIEW_IDS);

const ROUTE_ACTIONS = Object.freeze([
  { id: 'syncNowBtn', label: '立即同步', meta: '数据' },
  { id: 'authOpenBtn', label: '账号与云同步', meta: '账号' },
  { id: 'exportBtn', label: '导出数据备份', meta: '数据' },
]);

function routeItems() {
  return [...document.querySelectorAll('.nav-item[data-view]')].map((item) => ({
    view: item.dataset.view || '',
    label: item.dataset.title || item.textContent?.trim() || '',
    meta: item.closest('.nav-section')?.querySelector('.nav-label')?.textContent?.trim() || '页面',
    current: item.classList.contains('active'),
  })).filter((item) => item.view && item.label);
}

function commandButton({ label, meta, view = '', id = '', current = false }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'command-option';
  if (view) button.dataset.commandView = view;
  if (id) button.dataset.commandAction = id;
  if (current) button.setAttribute('aria-current', 'page');

  const copy = document.createElement('span');
  const title = document.createElement('strong');
  const detail = document.createElement('small');
  title.textContent = label;
  detail.textContent = meta;
  copy.append(title, detail);

  const indicator = document.createElement('em');
  indicator.textContent = current ? '当前' : view ? '打开' : '执行';
  button.append(copy, indicator);
  return button;
}

export function initWorkspaceController() {
  if (document.documentElement.dataset.workspaceBound === '1') return false;

  const dialog = document.getElementById('commandDialog');
  const input = document.getElementById('commandSearch');
  const results = document.getElementById('commandResults');
  const commandOpenButton = document.getElementById('commandOpenBtn');
  const mobileMoreButton = document.getElementById('mobileMoreBtn');
  const dialogTriggers = [commandOpenButton, mobileMoreButton].filter(Boolean);

  function syncMobileNavigationState() {
    if (!mobileMoreButton) return;
    const activeView = document.querySelector('.nav-item.active[data-view]')?.dataset.view || '';
    const active = Boolean(activeView && !mobilePrimaryViewIds.has(activeView));
    mobileMoreButton.classList.toggle('active', active);
    mobileMoreButton.setAttribute('aria-label', active ? `更多页面和操作，当前：${document.getElementById('viewTitle')?.textContent || activeView}` : '更多页面和操作');
    if (active) {
      mobileMoreButton.setAttribute('aria-current', 'page');
    } else {
      mobileMoreButton.removeAttribute('aria-current');
    }
  }

  function syncDialogState(isOpen) {
    dialogTriggers.forEach((trigger) => trigger.setAttribute('aria-expanded', String(isOpen)));
  }

  function renderCommands(query = '') {
    if (!results) return;
    const normalizedQuery = String(query).trim().toLowerCase();
    const items = [...routeItems(), ...ROUTE_ACTIONS]
      .filter((item) => `${item.label} ${item.meta}`.toLowerCase().includes(normalizedQuery));

    results.replaceChildren(...items.map(commandButton));
    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'command-empty';
      empty.textContent = '没有匹配的页面或操作。';
      results.append(empty);
    }
  }

  function openCommands() {
    if (!dialog) return;
    if (input) input.value = '';
    renderCommands();
    if (!dialog.open) dialog.showModal();
    syncDialogState(true);
    window.requestAnimationFrame(() => input?.focus());
  }

  function closeCommands() {
    if (dialog?.open) dialog.close();
    syncDialogState(false);
  }

  commandOpenButton?.addEventListener('click', openCommands);
  mobileMoreButton?.addEventListener('click', openCommands);
  document.getElementById('commandCloseBtn')?.addEventListener('click', closeCommands);
  document.getElementById('commandForm')?.addEventListener('submit', (event) => event.preventDefault());
  input?.addEventListener('input', () => renderCommands(input.value));
  results?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const option = target.closest('.command-option');
    if (!option) return;
    const view = option.dataset.commandView;
    const action = option.dataset.commandAction;
    closeCommands();
    if (view) document.querySelector(`.nav-item[data-view="${view}"]`)?.click();
    if (action) document.getElementById(action)?.click();
  });
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) closeCommands();
  });
  dialog?.addEventListener('close', () => syncDialogState(false));
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      dialog?.open ? closeCommands() : openCommands();
    }
  });

  const navigation = document.querySelector('.nav-list');
  const navigationObserver = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.target instanceof Element && mutation.target.matches('.nav-item[data-view]'))) {
      syncMobileNavigationState();
    }
  });
  if (navigation) {
    navigationObserver.observe(navigation, { subtree: true, attributes: true, attributeFilter: ['class'] });
  }
  syncMobileNavigationState();

  document.documentElement.dataset.workspaceBound = '1';
  return true;
}
