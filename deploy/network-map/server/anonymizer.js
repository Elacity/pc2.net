/**
 * Anonymizer - Generates hash-based, non-reversible node identifiers
 * 
 * CRITICAL: This protects users from doxing by never exposing usernames.
 * "alice" + ".ela.city" = "alice.ela.city" which is an attack vector.
 * Instead, we show "node_abc123" which cannot be reversed.
 */

import { createHash } from 'crypto';

/**
 * Generate an anonymized node identifier from a username
 * 
 * @param {string} username - The username (e.g., "alice")
 * @returns {string} Anonymized identifier (e.g., "node_abc12345")
 * 
 * Properties:
 * - Consistent: Same username always produces same identifier
 * - Non-reversible: Cannot derive username from identifier
 * - Unique: Very low collision probability with 8 hex chars
 */
export function generateNodeIdentifier(username) {
  if (!username || typeof username !== 'string') {
    throw new Error('Username is required');
  }
  
  // Use SHA-256 for strong one-way hashing
  const hash = createHash('sha256')
    .update(username.toLowerCase().trim())
    .digest('hex');
  
  // Use first 8 characters (32 bits = ~4 billion possibilities)
  // Format: node_xxxxxxxx
  return `node_${hash.substring(0, 8)}`;
}

/**
 * Validate a node identifier format
 * 
 * @param {string} identifier - The identifier to validate
 * @returns {boolean} True if valid format
 */
export function isValidNodeIdentifier(identifier) {
  if (!identifier || typeof identifier !== 'string') {
    return false;
  }
  
  // Must match: node_[8 hex chars]
  return /^node_[a-f0-9]{8}$/.test(identifier);
}

/**
 * Strip all identifying information from node data
 * Returns only safe-to-display public data
 * 
 * @param {Object} node - Full node data (internal)
 * @returns {Object} Public node info (anonymized)
 */
export function toPublicNodeInfo(node) {
  return {
    nodeIdentifier: node.nodeIdentifier || node.node_identifier,
    status: node.status,
    activityType: node.activityType || node.activity_type
    // NEVER include: username, publicUrl, endpoint, nodeId, timestamps, etc.
  };
}

/**
 * Strip identifying info from an array of nodes
 * 
 * @param {Array} nodes - Array of full node data
 * @returns {Array} Array of public node info
 */
export function toPublicNodeList(nodes) {
  return nodes.map(toPublicNodeInfo);
}
