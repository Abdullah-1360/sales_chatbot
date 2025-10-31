const { PURPOSE, CMS, TECH_STACK } = require('../config/constants');

module.exports = function planMatcher(answers) {
  const { purpose, cms, tech_stack: tech } = answers;

  // --- primary rules (highest → lowest priority) ---
  if (cms === CMS.WOO || purpose === PURPOSE.ECOM)       return { gid: 21, tierPref: tierOf(answers) };
  if (cms === CMS.WP)                                    return { gid: 20, tierPref: tierOf(answers) };
  if (tech === TECH_STACK.WIN)                           return { gid: 28, tierPref: tierOf(answers) };
  if (answers.isBusiness || answers.email_deliverability_priority) return { gid: 25, tierPref: tierOf(answers) };
  return { gid: 1, tierPref: tierOf(answers) };               // default Linux shared
};

/* helper: websites_count → tier string */
function tierOf(ans) {
  const wc = ans.websites_count;
  if (wc === '1') return 'entry';
  if (wc === '2-3') return 'mid';
  if (['4-10', '10+'].includes(wc)) return 'upper';
  return 'entry';
}