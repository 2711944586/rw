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

export const MOBILE_PRIMARY_VIEW_IDS = Object.freeze([
  'dashboard',
  'today',
  'week',
  'records',
]);

const viewIdSet = new Set(VIEW_IDS);

export function isKnownViewId(viewId) {
  return typeof viewId === 'string' && viewIdSet.has(viewId);
}
