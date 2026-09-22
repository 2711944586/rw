export const SYNCED_TABLES = Object.freeze([
  'daily_records',
  'study_tasks',
  'review_items',
  'topic_progress',
  'mock_scores',
  'resources',
  'source_registry',
  'calibration_snapshots',
  'project_showcase_items',
]);

export const SYNC_CONFLICT_KEYS = Object.freeze({
  profiles: 'user_id',
  daily_records: 'user_id,study_date',
  study_tasks: 'user_id,id',
  review_items: 'user_id,id',
  topic_progress: 'user_id,topic_id',
  mock_scores: 'user_id,id',
  resources: 'user_id,resource_key',
  source_registry: 'user_id,claim_id',
  calibration_snapshots: 'id',
  project_showcase_items: 'user_id,id',
});

export function getSyncConflictKey(table) {
  return SYNC_CONFLICT_KEYS[table] || '';
}
