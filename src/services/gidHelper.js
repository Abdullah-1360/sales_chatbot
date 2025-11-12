/**
 * GID Helper Service
 * Provides utilities for working with WHMCS Product Group IDs
 */

const cfg = require('../config');

/**
 * Get all configured GIDs
 * @returns {Array<number>} - Array of GID numbers
 */
function getAllGids() {
  return [1, 2, 6, 20, 21, 25, 26, 28];
}

/**
 * Get GID name/description
 * @param {number} gid - GID number
 * @returns {string} - GID name
 */
function getGidName(gid) {
  return cfg.GID_NAMES[gid] || `Unknown GID ${gid}`;
}

/**
 * Get all GIDs with their names
 * @returns {Array<Object>} - Array of {gid, name} objects
 */
function getAllGidsWithNames() {
  return getAllGids().map(gid => ({
    gid,
    name: getGidName(gid)
  }));
}

/**
 * Check if a GID is valid
 * @param {number} gid - GID to check
 * @returns {boolean} - True if valid
 */
function isValidGid(gid) {
  return getAllGids().includes(Number(gid));
}

/**
 * Get GID category
 * @param {number} gid - GID number
 * @returns {string} - Category name
 */
function getGidCategory(gid) {
  const categories = {
    1: 'hosting',
    2: 'reseller',
    6: 'ssl',
    20: 'hosting',
    21: 'hosting',
    25: 'hosting',
    26: 'reseller',
    28: 'hosting'
  };
  return categories[gid] || 'other';
}

/**
 * Get hosting GIDs only (excludes SSL, reseller, etc.)
 * @returns {Array<number>} - Array of hosting GID numbers
 */
function getHostingGids() {
  return [1, 20, 21, 25, 28];
}

/**
 * Get reseller GIDs only
 * @returns {Array<number>} - Array of reseller GID numbers
 */
function getResellerGids() {
  return [2, 26];
}

/**
 * Get SSL certificate GIDs only
 * @returns {Array<number>} - Array of SSL GID numbers
 */
function getSslGids() {
  return [6];
}

module.exports = {
  getAllGids,
  getGidName,
  getAllGidsWithNames,
  isValidGid,
  getGidCategory,
  getHostingGids,
  getResellerGids,
  getSslGids
};
