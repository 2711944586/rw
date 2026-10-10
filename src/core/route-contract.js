export const VIEW_IDS = Object.freeze([
  'dashboard',
  'today',
  'week',
  'foundation',
  'syllabus',
  'records',
  'review',
  'scores',
  'resources',
  'settings',
]);

export const DEFAULT_VIEW_ID = 'dashboard';

/** Desktop sidebar and the mobile bar share these six workspaces. */
export const WORKSPACES = Object.freeze([
  {
    id: 'desk',
    label: '工作台',
    views: Object.freeze(['dashboard', 'today', 'review']),
    mobileView: 'dashboard',
    mobileLabel: '首页',
  },
  {
    id: 'plan',
    label: '学习计划',
    views: Object.freeze(['week', 'foundation']),
    mobileView: 'week',
    mobileLabel: '计划',
  },
  {
    id: 'knowledge',
    label: '知识与复习',
    views: Object.freeze(['syllabus', 'resources']),
    mobileView: 'review',
    mobileLabel: '复习',
  },
  {
    id: 'analytics',
    label: '学习分析',
    views: Object.freeze(['records', 'scores']),
    mobileView: null,
    mobileLabel: '',
  },
  {
    id: 'admissions',
    label: '报考信息',
    views: Object.freeze([]),
    mobileView: null,
    mobileLabel: '',
  },
  {
    id: 'system',
    label: '系统设置',
    views: Object.freeze(['settings']),
    mobileView: 'settings',
    mobileLabel: '我的',
  },
]);

export const MOBILE_PRIMARY_VIEW_IDS = Object.freeze([
  'dashboard',
  'today',
  'review',
  'week',
  'settings',
]);

export function workspaceForView(viewId) {
  return WORKSPACES.find((workspace) => workspace.views.includes(viewId)) || null;
}

const viewIdSet = new Set(VIEW_IDS);

export function isKnownViewId(viewId) {
  return typeof viewId === 'string' && viewIdSet.has(viewId);
}
