/**
 * Project Showcase Module
 * Pure functions for data desensitization and showcase item validation.
 * No side effects — all functions are pure.
 */

/**
 * Fields to completely remove from user data during desensitization.
 */
const SENSITIVE_FIELDS = ['email', 'phone', 'real_name'];

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

  // Deep clone to avoid mutating original
  const clone = JSON.parse(JSON.stringify(userData));

  // Remove top-level sensitive fields
  for (const field of SENSITIVE_FIELDS) {
    delete clone[field];
  }

  // Remove source_registry internal notes
  if (clone.source_registry && Array.isArray(clone.source_registry)) {
    for (const entry of clone.source_registry) {
      delete entry.notes;
      delete entry.internal_notes;
    }
  } else if (clone.source_registry && typeof clone.source_registry === 'object') {
    delete clone.source_registry.notes;
    delete clone.source_registry.internal_notes;
  }
  delete clone.source_registry_notes;

  // Remove conflicts table data entirely
  delete clone.conflicts;

  // Redact specific topic names
  if (Array.isArray(clone.topics)) {
    for (const topic of clone.topics) {
      delete topic.name;
      delete topic.topic_name;
    }
  }
  if (Array.isArray(clone.topic_progress)) {
    for (const tp of clone.topic_progress) {
      delete tp.name;
      delete tp.topic_name;
    }
  }

  // Redact mistake/error content
  if (Array.isArray(clone.mistakes)) {
    for (const mistake of clone.mistakes) {
      delete mistake.content;
      delete mistake.error_content;
      delete mistake.description;
    }
  }
  if (Array.isArray(clone.errors)) {
    for (const error of clone.errors) {
      delete error.content;
      delete error.error_content;
      delete error.description;
    }
  }

  // Redact personal retro text
  if (Array.isArray(clone.retrospectives)) {
    for (const retro of clone.retrospectives) {
      delete retro.text;
      delete retro.reflection;
      delete retro.personal_notes;
    }
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
  const requiredFields = ['artifact_type', 'item_date', 'output_link'];

  for (const field of requiredFields) {
    const value = item[field];
    if (value !== undefined && value !== null && value !== '') {
      filledFields.push(field);
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
