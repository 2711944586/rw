/**
 * Project Showcase Module
 * Pure functions for data desensitization and showcase item validation.
 * No side effects — all functions are pure.
 */

import { safeExternalUrl } from '../utils/html.js';

/**
 * Fields to completely remove from user data during desensitization.
 */
const SENSITIVE_FIELDS = ['email', 'phone', 'real_name'];
const ROW_REDACTIONS = {
  source_registry: ['notes', 'internal_notes'],
  topics: ['name', 'topic_name'],
  topic_progress: ['name', 'topic_name'],
  mistakes: ['content', 'error_content', 'description'],
  errors: ['content', 'error_content', 'description'],
  retrospectives: ['text', 'reflection', 'personal_notes'],
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneForDesensitize(value) {
  const seen = new WeakSet();
  try {
    const serialized = JSON.stringify(value, (_key, current) => {
      if (current && typeof current === 'object') {
        if (seen.has(current)) return undefined;
        seen.add(current);
      }
      return current;
    });
    if (!serialized) return {};
    const clone = JSON.parse(serialized);
    return clone && typeof clone === 'object' ? clone : {};
  } catch {
    return {};
  }
}

function redactRowFields(rows, fields) {
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    for (const field of fields) {
      delete row[field];
    }
  }
}

/**
 * Desensitizes user data for public showcase display.
 * Deep clones the input, then removes/redacts sensitive fields:
 * - email, phone, real_name (deleted)
 * - source_registry internal notes (deleted)
 * - conflicts table data (deleted)
 * - specific topic names (redacted)
 * - mistake/error content (redacted)
 * - personal retro text (redacted)
 *
 * @param {Object} userData - The raw user data object
 * @returns {Object} A sanitized deep copy with sensitive data removed
 */
export function desensitizeData(userData) {
  if (userData === null || userData === undefined) {
    return {};
  }

  // Deep clone to avoid mutating original. Circular references are dropped.
  const clone = cloneForDesensitize(userData);

  // Remove top-level sensitive fields
  for (const field of SENSITIVE_FIELDS) {
    delete clone[field];
  }

  // Remove source_registry internal notes
  if (Array.isArray(clone.source_registry)) {
    redactRowFields(clone.source_registry, ROW_REDACTIONS.source_registry);
  } else if (isPlainObject(clone.source_registry)) {
    delete clone.source_registry.notes;
    delete clone.source_registry.internal_notes;
  }
  delete clone.source_registry_notes;

  // Remove conflicts table data entirely
  delete clone.conflicts;

  // Redact row-level sensitive fields while tolerating malformed rows.
  for (const [table, fields] of Object.entries(ROW_REDACTIONS)) {
    redactRowFields(clone[table], fields);
  }

  if (clone.retro_text !== undefined) {
    delete clone.retro_text;
  }

  return clone;
}

/**
 * Validates a showcase item for submission.
 * The item must have at least 2 of the 3 fields filled (non-empty):
 * artifact_type, item_date, output_link.
 *
 * @param {Object} item - The showcase item to validate
 * @param {string} [item.artifact_type] - Type of artifact
 * @param {string|Date} [item.item_date] - Date of the item
 * @param {string} [item.output_link] - Link to the output
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateShowcaseItem(item) {
  const errors = [];

  if (!item || typeof item !== 'object') {
    return { valid: false, errors: ['Item is required and must be an object'] };
  }

  const filledFields = [];
  const requiredFields = ['artifact_type', 'item_date'];

  for (const field of requiredFields) {
    const value = item[field];
    if (field === 'item_date' ? isValidDateKey(value) : isFilled(value)) {
      filledFields.push(field);
    } else if (field === 'item_date' && isFilled(value)) {
      errors.push('item_date must be a valid YYYY-MM-DD date.');
    }
  }

  if (isFilled(item.output_link)) {
    if (typeof item.output_link === 'string' && safeExternalUrl(item.output_link) !== '#') {
      filledFields.push('output_link');
    } else {
      errors.push('output_link must be an absolute http(s) URL.');
    }
  }

  if (filledFields.length < 2) {
    const missingCount = 2 - filledFields.length;
    errors.push(
      `At least 2 of {artifact_type, item_date, output_link} must be filled. Currently only ${filledFields.length} filled, need ${missingCount} more.`
    );
  }

  return { valid: errors.length === 0, errors };
}

function isFilled(value) {
  if (value === undefined || value === null) return false;
  const type = typeof value;
  if (!['string', 'number', 'bigint'].includes(type)) return false;
  return String(value).trim().length > 0;
}

function isValidDateKey(value) {
  let text = '';
  if (value instanceof Date) {
    text = Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : '';
  } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    text = String(value).trim().slice(0, 10);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text;
}
