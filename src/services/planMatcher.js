// src/services/planMatcher.js
const { PURPOSE, CMS, TECH_STACK } = require('../config/constants');

module.exports = function planMatcher(answers) {
  const { purpose, cms, tech_stack, websites_count } = answers;

  // 1.  canonical range string
  const cleanCount = normaliseCount(websites_count);
  const minTier    = tierOf(cleanCount);

  // 2.  original mapping rules
  if (cms === CMS.WOO || purpose === PURPOSE.ECOM)       return { gid: 21, minTier };
  if (cms === CMS.WP)                                    return { gid: 20, minTier };
  if (tech_stack === TECH_STACK.WIN || wantsWindows(answers)) return { gid: 28, minTier };
  if (isBusinessy(answers))                              return { gid: 25, minTier };
  return { gid: 1, minTier };                            // default Linux shared
};

/* ---------- helpers ---------- */
function normaliseCount(raw) {
  const str = String(raw || '').toLowerCase().replace(/\s+/g, ''); // lower-case, no spaces

  if (str === '1' || str === 'one' || str === 'single') return '1';
  if (str === '2-3' || str === '2' || str === '3' || str === 'two' || str === 'three') return '2-3';
  if (str === '4-10' || str === '4' || str === '5' || str === '6' || str === '7' || str === '8' || str === '9' || str === '10' ||
      str === 'four' || str === 'five' || str === 'six' || str === 'seven' || str === 'eight' || str === 'nine' || str === 'ten') return '4-10';
  if (str === '10+' || str === 'unlimited' || str === 'infinity' || str === 'plus' || str.includes('unlimited')) return '10+';

  return '1'; // safe fallback
}

function tierOf(count) {
  if (count === '1')     return 'entry';
  if (count === '2-3')   return 'mid';
  return 'upper';        // 4-10 or 10+
}

function wantsWindows(a) {
  const str = JSON.stringify(a).toLowerCase();
  return ['asp', '.net', 'mssql', 'windows'].some(k => str.includes(k));
}

function isBusinessy(a) {
  return a.purpose === PURPOSE.BUSINESS ||
         a.email_deliverability_priority === true ||
         (a.monthly_budget && a.monthly_budget > 20);
}