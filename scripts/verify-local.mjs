import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { VIEW_IDS } from '../src/core/route-contract.js';

const messages = [];
const networkRequests = [];
const screenshotRoot = resolve('output/ui-review3');
let browser;
let server;

const routeSentinels = Object.freeze({
  dashboard: '#daysLeft',
  today: '#dailyPlan',
  week: '#weekPlanner',
  foundation: '#foundationGrid',
  syllabus: '#syllabusBoard',
  records: '#recordsTable',
  review: '#weeklyReview',
  scores: '#scoreSummary',
  resources: '#resourceGrid',
  settings: '#standardsList',
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  await mkdir(screenshotRoot, { recursive: true });
  server = await createServer({
    logLevel: 'error',
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
    },
  });
  await server.listen();

  const url = server.resolvedUrls?.local?.[0];
  assert(url, 'Vite did not expose a local verification URL.');

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      messages.push({ type: message.type(), text: message.text() });
    }
  });
  page.on('pageerror', (error) => messages.push({ type: 'pageerror', text: error.message }));
  page.on('request', (request) => networkRequests.push(request.url()));

  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.evaluate(() => localStorage.clear());
  networkRequests.length = 0;
  await page.reload({ waitUntil: 'networkidle' });

  const unexpectedCloudRequests = networkRequests.filter((requestUrl) => /@supabase|supabase-js|vendor-supabase/i.test(requestUrl));
  assert(unexpectedCloudRequests.length === 0, `Supabase SDK loaded without a persisted session: ${JSON.stringify(unexpectedCloudRequests)}`);

  const shell = await page.evaluate(() => ({
    activeView: document.querySelector('.view.active')?.id || '',
    title: document.title,
    workspaceBound: document.documentElement.dataset.workspaceBound || '',
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  }));
  assert(shell.title.includes('软微 420'), `Unexpected title: ${shell.title}`);
  assert(shell.activeView === 'dashboard', `Unexpected initial view: ${shell.activeView}`);
  assert(shell.workspaceBound === '1', 'Workspace controller did not initialize.');
  assert(!shell.horizontalOverflow, 'Mobile viewport has horizontal page overflow.');

  const mobileNavigation = await page.evaluate(() => {
    const navigation = document.querySelector('.nav-list');
    const visibleButtons = [...(navigation?.querySelectorAll('button') || [])]
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        return getComputedStyle(button).display !== 'none' && rect.width > 0 && rect.height > 0;
      });
    return {
      labels: visibleButtons.map((button) => button.querySelector('.nav-text')?.textContent?.trim() || ''),
      horizontalOverflow: navigation ? navigation.scrollWidth > navigation.clientWidth + 1 : true,
      contentViewportGap: (() => {
        const main = document.getElementById('main-content')?.getBoundingClientRect();
        const sidebar = document.querySelector('.sidebar')?.getBoundingClientRect();
        return main && sidebar ? sidebar.top - main.bottom : -1;
      })(),
    };
  });
  assert(JSON.stringify(mobileNavigation.labels) === JSON.stringify(['总览', '今日', '周计划', '记录', '更多']), `Unexpected mobile navigation: ${JSON.stringify(mobileNavigation.labels)}`);
  assert(!mobileNavigation.horizontalOverflow, 'Mobile navigation still scrolls horizontally.');
  assert(mobileNavigation.contentViewportGap >= 0, `Mobile content viewport extends behind navigation: gap=${mobileNavigation.contentViewportGap}`);

  const focusDashboard = await page.evaluate(() => {
    const visible = (selector) => {
      const element = document.querySelector(selector);
      return Boolean(element && getComputedStyle(element).display !== 'none' && element.getClientRects().length);
    };
    return {
      weeklyCardVisible: visible('.focus-board > .focus-card:nth-child(4)'),
      targetStatusVisible: visible('.target-lane > .target-status-card'),
      scoreSplitVisible: visible('.target-lane > .score-split-card'),
      loopAuditVisible: visible('.target-lane > .loop-audit-card'),
      visibleMetrics: [...document.querySelectorAll('#dashboard > .metric-grid > .metric-card')]
        .filter((card) => getComputedStyle(card).display !== 'none' && card.getClientRects().length)
        .map((card) => card.classList.contains('risk') ? 'risk' : 'metric'),
      strategyVisible: visible('#dashboard > .strategy-board'),
    };
  });
  assert(!focusDashboard.weeklyCardVisible, 'Mobile focus mode still repeats the weekly status card.');
  assert(!focusDashboard.targetStatusVisible && !focusDashboard.scoreSplitVisible, 'Mobile focus mode still shows secondary target calibration cards.');
  assert(focusDashboard.loopAuditVisible, 'Mobile focus mode hid the actionable daily audit.');
  assert(JSON.stringify(focusDashboard.visibleMetrics) === JSON.stringify(['risk']), `Unexpected mobile focus metrics: ${JSON.stringify(focusDashboard.visibleMetrics)}`);
  assert(!focusDashboard.strategyVisible, 'Mobile focus mode still shows the full strategy board.');

  const mobileToolbar = await page.evaluate(() => [...document.querySelectorAll('.top-actions .toolbar-icon-button')]
    .filter((button) => getComputedStyle(button).display !== 'none' && button.getClientRects().length)
    .map((button) => {
      const buttonRect = button.getBoundingClientRect();
      const iconRect = button.querySelector('svg')?.getBoundingClientRect();
      return {
        name: button.id || button.getAttribute('aria-label') || button.tagName,
        width: buttonRect.width,
        height: buttonRect.height,
        offsetX: iconRect ? iconRect.left + iconRect.width / 2 - (buttonRect.left + buttonRect.width / 2) : null,
        offsetY: iconRect ? iconRect.top + iconRect.height / 2 - (buttonRect.top + buttonRect.height / 2) : null,
        visibleText: [...button.querySelectorAll('span')].some((span) => getComputedStyle(span).display !== 'none' && span.getClientRects().length),
      };
    }));
  assert(JSON.stringify(mobileToolbar.map((control) => control.name)) === JSON.stringify(['commandOpenBtn', 'syncNowBtn', 'authOpenBtn']), `Unexpected mobile toolbar controls: ${JSON.stringify(mobileToolbar)}.`);
  mobileToolbar.forEach((control) => {
    assert(control.width === 38 && control.height === 38, `${control.name} is not a stable 38px mobile control.`);
    assert(control.offsetX !== null && Math.abs(control.offsetX) <= 0.5 && control.offsetY !== null && Math.abs(control.offsetY) <= 0.25, `${control.name} mobile icon is off-center: ${JSON.stringify(control)}.`);
    assert(!control.visibleText, `${control.name} exposes a text label inside the compact mobile toolbar.`);
  });

  for (const viewport of [{ width: 320, height: 700 }, { width: 768, height: 900 }]) {
    await page.setViewportSize(viewport);
    const responsiveState = await page.evaluate(() => ({
      pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      navigationOverflow: (() => {
        const navigation = document.querySelector('.nav-list');
        return navigation ? navigation.scrollWidth > navigation.clientWidth + 1 : true;
      })(),
      visibleNavigationButtons: [...document.querySelectorAll('.nav-list button')]
        .filter((button) => getComputedStyle(button).display !== 'none' && button.getClientRects().length).length,
    }));
    assert(!responsiveState.pageOverflow, `${viewport.width}px viewport has horizontal page overflow.`);
    assert(!responsiveState.navigationOverflow, `${viewport.width}px mobile navigation overflows.`);
    assert(responsiveState.visibleNavigationButtons === 5, `${viewport.width}px viewport does not expose exactly five navigation buttons.`);
  }
  await page.setViewportSize({ width: 390, height: 844 });

  await page.getByRole('button', { name: '更多页面和操作' }).click();
  const commandDialog = page.getByRole('dialog', { name: '前往页面或执行操作' });
  const mobileDialogClearance = await page.evaluate(() => {
    const dialog = document.getElementById('commandDialog')?.getBoundingClientRect();
    const sidebar = document.querySelector('.sidebar')?.getBoundingClientRect();
    return dialog && sidebar ? sidebar.top - dialog.bottom : -1;
  });
  assert(mobileDialogClearance >= 8, `Mobile command dialog overlaps the bottom navigation: gap=${mobileDialogClearance}`);
  await commandDialog.getByRole('searchbox').fill('设置');
  await commandDialog.getByRole('button', { name: /设置.*打开/ }).click();
  await page.waitForFunction(() => document.querySelector('.view.active')?.id === 'settings');
  assert(new URL(page.url()).hash === '#settings', `Command navigation did not update the hash: ${page.url()}`);
  await page.waitForFunction(() => document.getElementById('mobileMoreBtn')?.getAttribute('aria-current') === 'page');
  assert((await page.getByRole('button', { name: /更多页面和操作，当前：设置/ }).getAttribute('aria-expanded')) === 'false', 'Mobile More trigger kept an expanded state after navigation.');

  await page.getByRole('button', { name: '今日', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.view.active')?.id === 'today');
  await page.locator('.density-toggle [data-density="balanced"]').click();
  await page.waitForFunction(() => document.body.dataset.density === 'balanced');
  assert(await page.locator('#entryForm').isVisible(), 'Today entry form is not visible after navigation.');
  await page.waitForFunction(() => !document.getElementById('mobileMoreBtn')?.hasAttribute('aria-current'));
  await page.waitForTimeout(220);
  await page.locator('#note').evaluate((element) => {
    document.documentElement.style.scrollBehavior = 'auto';
    element.scrollIntoView({ block: 'end', behavior: 'instant' });
  });
  await page.waitForTimeout(50);
  const formClearance = await page.evaluate(() => {
    const field = document.getElementById('note')?.getBoundingClientRect();
    const sidebar = document.querySelector('.sidebar')?.getBoundingClientRect();
    return field && sidebar ? sidebar.top - field.bottom : -1;
  });
  assert(formClearance >= 8, `Focused form field can be obscured by mobile navigation: gap=${formClearance}`);
  await page.waitForFunction(() => !document.getElementById('toast')?.classList.contains('show'));

  await page.setViewportSize({ width: 1440, height: 1000 });
  const desktopNavigation = await page.evaluate(() => {
    const sidebar = document.querySelector('.sidebar');
    const items = [...document.querySelectorAll('.nav-item')];
    const rect = sidebar?.getBoundingClientRect();
    const firstItem = items[0]?.getBoundingClientRect();
    const lastItem = items.at(-1)?.getBoundingClientRect();
    return {
      position: sidebar ? getComputedStyle(sidebar).position : '',
      height: rect?.height || 0,
      viewportHeight: window.innerHeight,
      navCenter: firstItem && lastItem ? (firstItem.top + lastItem.bottom) / 2 : 0,
      viewportCenter: window.innerHeight / 2,
      peripheralNotesHidden: ['.sidebar-status', '.side-card', '.nav-label', '.topbar .eyebrow']
        .every((selector) => {
          const element = document.querySelector(selector);
          return !element || element.getClientRects().length === 0;
      }),
      fontFamily: getComputedStyle(document.body).fontFamily,
      monoFamily: getComputedStyle(document.documentElement).getPropertyValue('--workspace-mono'),
      moreButtonVisible: document.getElementById('mobileMoreBtn')?.getClientRects().length > 0,
      vertical: items.every((item, index) => index === 0
        || item.getBoundingClientRect().top > items[index - 1].getBoundingClientRect().top),
    };
  });
  assert(desktopNavigation.position === 'sticky', 'Desktop navigation is not sticky.');
  assert(Math.abs(desktopNavigation.height - (desktopNavigation.viewportHeight - 28)) <= 2, 'Desktop navigation does not fill the available viewport.');
  assert(Math.abs(desktopNavigation.navCenter - desktopNavigation.viewportCenter) <= 12, 'Desktop navigation items are not visually centered.');
  assert(desktopNavigation.peripheralNotesHidden, 'Peripheral desktop annotations are still visible.');
  assert(desktopNavigation.fontFamily.startsWith('"Noto Sans SC Variable"'), 'Chinese-first workspace font stack is not active.');
  assert(desktopNavigation.monoFamily.includes('Geist Variable'), 'Numeric workspace font stack is not active.');
  assert(desktopNavigation.vertical, 'Desktop navigation items are not vertically arranged.');
  assert(!desktopNavigation.moreButtonVisible, 'Mobile More trigger is visible on desktop.');

  const toolbarAlignment = await page.evaluate(() => {
    const visible = (element) => Boolean(element && getComputedStyle(element).display !== 'none' && element.getClientRects().length);
    const controls = [...document.querySelectorAll('.top-actions .toolbar-icon-button')]
      .filter(visible)
      .map((button) => {
        const buttonRect = button.getBoundingClientRect();
        const iconRect = button.querySelector('svg')?.getBoundingClientRect();
        return {
          name: button.id || button.getAttribute('aria-label') || button.tagName,
          width: buttonRect.width,
          height: buttonRect.height,
          offsetX: iconRect ? iconRect.left + iconRect.width / 2 - (buttonRect.left + buttonRect.width / 2) : null,
          offsetY: iconRect ? iconRect.top + iconRect.height / 2 - (buttonRect.top + buttonRect.height / 2) : null,
        };
      });
    const syncPillRect = document.getElementById('syncPill')?.getBoundingClientRect();
    const syncButtonRect = document.getElementById('syncNowBtn')?.getBoundingClientRect();
    return {
      controls,
      syncShellOffsetX: syncPillRect && syncButtonRect
        ? syncButtonRect.left + syncButtonRect.width / 2 - (syncPillRect.left + syncPillRect.width / 2)
        : null,
      syncShellOffsetY: syncPillRect && syncButtonRect
        ? syncButtonRect.top + syncButtonRect.height / 2 - (syncPillRect.top + syncPillRect.height / 2)
        : null,
    };
  });
  assert(toolbarAlignment.controls.length === 5, `Expected five visible toolbar icon controls, found ${toolbarAlignment.controls.length}.`);
  toolbarAlignment.controls.forEach((control) => {
    assert(control.width === 40 && control.height === 40, `${control.name} is not a stable 40px control: ${control.width}x${control.height}.`);
    assert(control.offsetX !== null && Math.abs(control.offsetX) <= 0.5, `${control.name} icon is horizontally off-center: ${control.offsetX}px.`);
    assert(control.offsetY !== null && Math.abs(control.offsetY) <= 0.25, `${control.name} icon is vertically off-center: ${control.offsetY}px.`);
  });
  assert(Math.abs(toolbarAlignment.syncShellOffsetX) <= 0.25 && Math.abs(toolbarAlignment.syncShellOffsetY) <= 0.25, `Sync button is not centered in its status shell: ${JSON.stringify(toolbarAlignment)}.`);

  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    document.documentElement.scrollTop = 480;
  });
  await page.waitForTimeout(50);
  const stickyTop = await page.locator('.sidebar').evaluate((element) => element.getBoundingClientRect().top);
  assert(stickyTop >= 13 && stickyTop <= 15, `Desktop navigation did not remain visible: top=${stickyTop}`);

  await page.setViewportSize({ width: 1024, height: 900 });
  const tabletDesktopState = await page.evaluate(() => ({
    pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    sidebarPosition: getComputedStyle(document.querySelector('.sidebar')).position,
    moreButtonVisible: document.getElementById('mobileMoreBtn')?.getClientRects().length > 0,
  }));
  assert(!tabletDesktopState.pageOverflow, '1024px viewport has horizontal page overflow.');
  assert(tabletDesktopState.sidebarPosition === 'sticky', '1024px viewport did not use desktop navigation.');
  assert(!tabletDesktopState.moreButtonVisible, '1024px viewport shows the mobile More trigger.');

  const checkedViews = [];
  for (const viewId of VIEW_IDS) {
    const routeChanged = await page.evaluate((nextViewId) => window.__rwDebug?.route(nextViewId), viewId);
    assert(routeChanged === true, `Route controller rejected ${viewId}.`);
    await page.waitForFunction((nextViewId) => document.querySelector('.view.active')?.id === nextViewId, viewId);
    const viewState = await page.evaluate(({ nextViewId, sentinelSelector }) => {
      const view = document.getElementById(nextViewId);
      const sentinel = document.querySelector(sentinelSelector);
      // Dynamic bar/ring values are carried on data-* attributes and applied
      // through CSSOM by applyDeferredStyles(). A render path that forgets to
      // call it leaves those elements un-styled — and, because the inline
      // `style` attribute is refused by the production CSP, silently flat.
      const unappliedStyles =
        [...document.querySelectorAll('[data-fill]')].filter((element) => !element.style.width).length +
        [...document.querySelectorAll('[data-height]')].filter((element) => !element.style.height).length +
        [...document.querySelectorAll('[data-var-value]')].filter((element) => !element.style.getPropertyValue('--value')).length;
      return {
        active: view?.classList.contains('active') || false,
        hidden: view?.hidden ?? true,
        ariaHidden: view?.getAttribute('aria-hidden'),
        visible: Boolean(view && getComputedStyle(view).display !== 'none' && view.getClientRects().length),
        sentinelContent: sentinel?.textContent?.trim().length || sentinel?.childElementCount || 0,
        pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        unappliedStyles,
      };
    }, { nextViewId: viewId, sentinelSelector: routeSentinels[viewId] });
    assert(viewState.active && !viewState.hidden && viewState.ariaHidden === 'false' && viewState.visible, `${viewId} did not become the visible active view: ${JSON.stringify(viewState)}.`);
    assert(viewState.sentinelContent > 0, `${viewId} renderer left ${routeSentinels[viewId]} empty.`);
    assert(!viewState.pageOverflow, `${viewId} has horizontal page overflow at 1024px.`);
    assert(viewState.unappliedStyles === 0, `${viewId} left ${viewState.unappliedStyles} data-fill/data-height/data-var-value element(s) without their computed style applied — a render path is bypassing applyDeferredStyles().`);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileView = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      visible: Boolean(document.querySelector('.view.active')?.getClientRects().length),
      focusPrimaryWidth: document.querySelector('#dashboard .focus-primary')?.getBoundingClientRect().width || 0,
    }));
    assert(!mobileView.overflow && mobileView.visible, `${viewId} is not laid out cleanly at 390px.`);
    if (viewId === 'dashboard') {
      assert(mobileView.focusPrimaryWidth >= 350, `Dashboard action panel collapsed at 390px: ${mobileView.focusPrimaryWidth}px.`);
    }
    await page.waitForTimeout(260);
    await page.screenshot({ path: resolve(screenshotRoot, `mobile-${viewId}.png`), fullPage: false });

    await page.setViewportSize({ width: 1440, height: 1000 });
    const wideView = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      visible: Boolean(document.querySelector('.view.active')?.getClientRects().length),
    }));
    assert(!wideView.overflow && wideView.visible, `${viewId} is not laid out cleanly at 1440px.`);
    await page.waitForTimeout(260);
    await page.screenshot({ path: resolve(screenshotRoot, `desktop-${viewId}.png`), fullPage: false });
    await page.setViewportSize({ width: 1024, height: 900 });
    checkedViews.push(viewId);
  }

  assert(messages.length === 0, `Browser warnings/errors found: ${JSON.stringify(messages)}`);
  console.log(JSON.stringify({ ok: true, url, shell, checkedViews, checkedWidths: [320, 390, 768, 1024, 1440], toolbarAlignment, lazyCloudSdk: true }, null, 2));
} finally {
  await browser?.close();
  await server?.close();
}
