/**
 * Domain Availability Service  –  PARALLEL + RDAP + WHOIS
 * Checks availability via RDAP **and** WHOIS in parallel,
 * returns the union of available alternatives from both sources.
 */

const axios   = require('axios');
const whois   = require('whois-json');
const cfg     = require('../config');
const { getPricingForTld } = require('./tldPricing');
/* ------------------------------------------------------------- */
/* tiny RDAP wrapper                                             */
/* ------------------------------------------------------------- */
async function rdapLookup(domain) {
  const { data } = await axios.get(
    `https://rdap.iana.org/domain/${domain}`,
    { timeout: 8000, validateStatus: s => s < 500 }
  );
  return data;          // 404 ⇒ axios throws ⇒ caught → null
}
/* ------------------------------------------------------------- */
/* 1.  Low-level single-domain check  (RDAP + WHOIS)             */
/* ------------------------------------------------------------- */
async function checkDomainAvailability(domain) {
  console.log(`🔍  RDAP+WHOIS check for: ${domain}`);

  // fire both clients at once
  const [rdapRes, whoisRes] = await Promise.allSettled([
   rdapLookup(domain).catch(() => null),
  whois(domain, { timeout: 5000, follow: 2, verbose: false }).catch(() => null)
]);

  const rdapData  = rdapRes.status === 'fulfilled' ? rdapRes.value : null;
  const whoisData = whoisRes.status === 'fulfilled' ? whoisRes.value : null;

  // decide availability from each source
  const rdapAv   = rdapData  ? analyzeRdap(rdapData, domain)            : null;
  const whoisAv  = whoisData ? analyzeDomainAvailability(whoisData, domain) : null;

  // final verdict: if **any** source says available → available
  const available = rdapAv === true || whoisAv === true;
  const source    = rdapAv === true ? 'rdap' : whoisAv === true ? 'whois' : 'consensus';

  return {
    domain,
    available,
    source,
    rdapData,
    whoisData,
    registrar: (whoisData?.registrar || rdapData?.handle || null),
    expirationDate: (whoisData?.expirationDate || rdapData?.events
                        ?.find(e => e.eventAction === 'expiration')?.eventDate || null),
    creationDate: (whoisData?.creationDate || rdapData?.events
                      ?.find(e => e.eventAction === 'registration')?.eventDate || null)
  };
}

/* ------------------------------------------------------------- */
/* 2.  RDAP analyser                                              */
/* ------------------------------------------------------------- */
function analyzeRdap(data, domain) {
  if (!data) return false;
  // nic.ru, verisign, etc. return 404 when domain is free – already caught above
  // if we **have** any entity, consider it taken
  return !!(data.handle || data.ldhName || (data.entities && data.entities.length));
}

/* ------------------------------------------------------------- */
/* 3.  WHOIS analyser (unchanged)                                 */
/* ------------------------------------------------------------- */
function analyzeDomainAvailability(whoisData, domain) {
  const whoisText = JSON.stringify(whoisData).toLowerCase();
  console.log(`🔍  Analysing WHOIS for ${domain} (${whoisText.length} chars)`);

  const availablePatterns = [
    'no match', 'not found', 'no data found', 'domain not found',
    'no matching record', 'available for registration', 'not registered',
    'no entries found', 'domain status: no object found', 'not found in database'
  ];
  for (const p of availablePatterns) if (whoisText.includes(p)) return true;

  const takenPatterns = [
    'registrar:', 'creation date:', 'created:', 'registry expiry date:',
    'expiry date:', 'expires:', 'name server:', 'nameserver:',
    'status: active', 'status: ok', 'registrant:', 'registrant name:',
    'admin contact:', 'technical contact:'
  ];
  const takenIndicators = takenPatterns.reduce((n, p) => n + (whoisText.includes(p) ? 1 : 0), 0);

  if (takenIndicators >= 2) return false;
  if (whoisText.length < 200 && takenIndicators === 0) return true;
  return false; // unclear → conservative
}

/* ------------------------------------------------------------- */
/* 4.  Suggestion generator – now returns up to 20                */
/* ------------------------------------------------------------- */
function generateDomainSuggestions(baseDomain) {
  const [name, originalTld] = baseDomain.split('.');

  const tlds = ['.com', '.net', '.org', '.pk', '.co', '.io', '.biz', '.info', '.app', '.dev', '.tech', '.online'];
  const prefixes = ['my', 'get', 'the', 'new', 'best', 'top', 'go', 'try'];
  const suffixes = ['app', 'web', 'site', 'online', 'pro', 'hub', 'zone', 'now', '365', '24'];

  const sugg = new Set();

  tlds.forEach(tld => { if (tld !== `.${originalTld}`) sugg.add(`${name}${tld}`); });
  prefixes.forEach(pre => {
    sugg.add(`${pre}${name}.${originalTld}`);
    sugg.add(`${pre}${name}.com`);
  });
  suffixes.forEach(suf => {
    sugg.add(`${name}${suf}.${originalTld}`);
    sugg.add(`${name}${suf}.com`);
  });
  if (!name.includes('-')) {
    sugg.add(`${name}-online.${originalTld}`);
    sugg.add(`${name}-web.com`);
    sugg.add(`get-${name}.com`);
  }
  for (let i = 1; i <= 9; i++) {
    sugg.add(`${name}${i}.${originalTld}`);
    sugg.add(`${name}${i}.com`);
  }
  return [...sugg].slice(0, 20);   // ← bigger pool
}

/* ------------------------------------------------------------- */
/* 5.  Parallel multi-domain checker (1 s throttle)               */
/* ------------------------------------------------------------- */
async function checkMultipleDomains(domains, concurrency = 5) {
  console.log(`🔍  Parallel check of ${domains.length} domains (concurrency=${concurrency})`);

  const results = new Array(domains.length);
  const queue   = domains.map((d, i) => ({ d, i }));

  const runWindow = async () => {
    const chunk = queue.splice(0, concurrency);
    if (!chunk.length) return;
    await Promise.all(
      chunk.map(async ({ d, i }) => { results[i] = await checkDomainAvailability(d); })
    );
  };

  while (queue.length) {
    const t0 = Date.now();
    await runWindow();
    const dt = Date.now() - t0;
  }
  return results;
}

/* ------------------------------------------------------------- */
/* 6.  Main public wrapper (unchanged signature)                  */
/* ------------------------------------------------------------- */
async function getDomainAvailability(domain) {
  try {
    console.log(`\n🔍  Real-time check for: ${domain}\n`);
    const primary = await checkDomainAvailability(domain);

    if (primary.available) {
      // fetch price for the base domain's TLD in parallel
      const tld = `.${domain.split('.').pop()}`;
      const [pricingDoc] = await Promise.all([
        getPricingForTld(tld)
      ]);
      console.log(`✅  ${domain} is available!`);
      return {
        success: true,
        domain,
        available: true,
        message: 'Domain is available for registration!',
        suggestions: [],
        source: primary.source,
        pricing: pricingDoc ? {
          tld: pricingDoc.tld,
          register: pricingDoc.register,
          renew: pricingDoc.renew,
          transfer: pricingDoc.transfer,
          grace_period: pricingDoc.grace_period,
          redemption_period: pricingDoc.redemption_period,
          exchange_rate: pricingDoc.exchange_rate,
          exchange_rate_date: pricingDoc.exchange_rate_date
        } : null
      };
    }

    console.log(`❌  ${domain} is taken. Generating alternatives…`);
    const suggestions = generateDomainSuggestions(domain);

    // check first 10 suggestions in parallel
    const checked = await checkMultipleDomains(suggestions.slice(0, 10), 10);
    const available = checked.filter(r => r.available).map(r => r.domain);

    // parallel TLD pricing lookup for available suggestions
    const uniqueTlds = [...new Set(available.map(d => `.${d.split('.').pop()}`))];
    const pricingDocs = await Promise.all(uniqueTlds.map(t => getPricingForTld(t)));
    const tldToPricing = new Map();
    uniqueTlds.forEach((tld, i) => { if (pricingDocs[i]) tldToPricing.set(pricingDocs[i].tld, pricingDocs[i]); });

    const pricedSuggestions = available.map(d => {
      const t = (d.split('.').pop());
      const p = tldToPricing.get(t);
      return {
        domain: d,
        tld: t,
        pricing: p ? {
          register: p.register,
          renew: p.renew,
          transfer: p.transfer,
          grace_period: p.grace_period,
          redemption_period: p.redemption_period,
          exchange_rate: p.exchange_rate,
          exchange_rate_date: p.exchange_rate_date
        } : null
      };
    });

    console.log(`📊  Found ${available.length} available alternatives out of ${checked.length} checked`);

    return {
      success: true,
      domain,
      available: false,
      message: 'Domain is not available',
      suggestions: available,
      suggestionsCount: available.length,
      pricedSuggestions,
      checkedSuggestions: checked.length,
      registrar: primary.registrar,
      expirationDate: primary.expirationDate,
      creationDate: primary.creationDate
    };
  } catch (error) {
    console.error('❌  Domain check failed:', error);
    return { success: false, domain, error: error.message, message: 'Unable to check domain availability' };
  }
}

/* ------------------------------------------------------------- */
/* 7.  Exports                                                    */
/* ------------------------------------------------------------- */
module.exports = {
  getDomainAvailability,
  checkDomainAvailability,
  generateDomainSuggestions,
  checkMultipleDomains
};
/**
 * Domain Availability Service
 * Checks domain availability via real-time WHOIS lookups and suggests alternatives
 * --------------  PARALLEL VERSION  --------------
 */

// const axios = require('axios');
// const whois = require('whois-json');
// const cfg = require('../config');

// /* ------------------------------------------------------------------ */
// /*  1.  Single-domain check (unchanged)                               */
// /* ------------------------------------------------------------------ */
// async function checkDomainAvailability(domain) {
//   console.log(`🔍 Real-time WHOIS check for: ${domain}`);

//   try {
//     const whoisData = await whois(domain, {
//       timeout: 10000,
//       follow: 2,
//       verbose: false
//     });

//     const isAvailable = analyzeDomainAvailability(whoisData, domain);

//     return {
//       domain,
//       available: isAvailable,
//       whoisData,
//       registrar: whoisData.registrar || null,
//       expirationDate: whoisData.expirationDate || null,
//       creationDate: whoisData.creationDate || null
//     };

//   } catch (error) {
//     console.log(`⚠️ WHOIS lookup failed for ${domain}: ${error.message}`);

//     const errorMsg = error.message.toLowerCase();

//     const availablePatterns = [
//       'no match', 'not found', 'no data found',
//       'domain not found', 'no matching record'
//     ];

//     if (availablePatterns.some(p => errorMsg.includes(p))) {
//       return {
//         domain,
//         available: true,
//         message: 'Domain appears to be available (WHOIS indicates not found)',
//         source: 'whois_error_analysis'
//       };
//     }

//     return {
//       domain,
//       available: false,
//       message: 'Unable to verify availability - assuming taken',
//       error: error.message,
//       source: 'whois_error_fallback'
//     };
//   }
// }

// /* ------------------------------------------------------------------ */
// /*  2.  WHOIS-data analyser (unchanged)                               */
// /* ------------------------------------------------------------------ */
// function analyzeDomainAvailability(whoisData, domain) {
//   const whoisText = JSON.stringify(whoisData).toLowerCase();
//   console.log(`🔍 Analyzing WHOIS data for ${domain} (${whoisText.length} chars)`);

//   const availablePatterns = [
//     'no match', 'not found', 'no data found', 'domain not found',
//     'no matching record', 'available for registration', 'not registered',
//     'no entries found', 'domain status: no object found', 'not found in database'
//   ];

//   for (const pattern of availablePatterns) {
//     if (whoisText.includes(pattern)) {
//       console.log(`✅ Domain ${domain} is AVAILABLE (found: "${pattern}")`);
//       return true;
//     }
//   }

//   const takenPatterns = [
//     'registrar:', 'creation date:', 'created:', 'registry expiry date:',
//     'expiry date:', 'expires:', 'name server:', 'nameserver:',
//     'status: active', 'status: ok', 'registrant:', 'registrant name:',
//     'admin contact:', 'technical contact:'
//   ];

//   let takenIndicators = 0;
//   takenPatterns.forEach(p => { if (whoisText.includes(p)) takenIndicators++; });

//   if (takenIndicators >= 2) {
//     console.log(`❌ Domain ${domain} is TAKEN (${takenIndicators} indicators found)`);
//     return false;
//   }

//   if (whoisText.length < 200 && takenIndicators === 0) {
//     console.log(`✅ Domain ${domain} appears AVAILABLE (minimal data, no taken indicators)`);
//     return true;
//   }

//   console.log(`❌ Domain ${domain} status UNCLEAR - assuming taken for safety (${takenIndicators} indicators)`);
//   return false;
// }

// /* ------------------------------------------------------------------ */
// /*  3.  Suggestion generator (unchanged)                              */
// /* ------------------------------------------------------------------ */
// function generateDomainSuggestions(baseDomain) {
//   const [name, originalTld] = baseDomain.split('.');

//   const tlds = ['.com', '.net', '.org', '.pk', '.co', '.io', '.biz', '.info'];
//   const prefixes = ['my', 'get', 'the', 'new', 'best', 'top'];
//   const suffixes = ['app', 'web', 'site', 'online', 'pro', 'hub', 'zone'];

//   const suggestions = [];

//   tlds.forEach(tld => {
//     if (tld !== `.${originalTld}`) suggestions.push(`${name}${tld}`);
//   });

//   prefixes.forEach(pre => {
//     suggestions.push(`${pre}${name}.${originalTld}`, `${pre}${name}.com`);
//   });

//   suffixes.forEach(suf => {
//     suggestions.push(`${name}${suf}.${originalTld}`, `${name}${suf}.com`);
//   });

//   if (!name.includes('-')) {
//     suggestions.push(
//       `${name}-online.${originalTld}`,
//       `${name}-web.com`,
//       `get-${name}.com`
//     );
//   }

//   for (let i = 1; i <= 5; i++) {
//     suggestions.push(`${name}${i}.${originalTld}`, `${name}${i}.com`);
//   }

//   return [...new Set(suggestions)].slice(0, 10);
// }

// /* ------------------------------------------------------------------ */
// /*  4.  PARALLEL multi-domain checker (NEW)                          */
// /* ------------------------------------------------------------------ */
// async function checkMultipleDomains(domains, concurrency = 3) {
//   console.log(`🔍 Checking ${domains.length} domains (parallel, concurrency=${concurrency})…`);

//   const results = new Array(domains.length);
//   const queue   = domains.map((d, idx) => ({ d, idx }));

//   const runWindow = async () => {
//     const chunk = queue.splice(0, concurrency);
//     if (!chunk.length) return;

//     const promises = chunk.map(async ({ d, idx }) => {
//       const res = await checkDomainAvailability(d);
//       results[idx] = res;
//     });

//     await Promise.all(promises);
//   };

//   while (queue.length) {
//     const t0 = Date.now();
//     await runWindow();
//     const dt = Date.now() - t0;
//     if (dt < 1000) await new Promise(r => setTimeout(r, 1000 - dt));
//   }

//   console.log(`📋 Finished ${domains.length} lookups`);
//   return results;
// }

// /* ------------------------------------------------------------------ */
// /*  5.  Main entry point (parallel)                                   */
// /* ------------------------------------------------------------------ */
// async function getDomainAvailability(domain) {
//   try {
//     console.log(`\n🔍 Real-time domain availability check for: ${domain}\n`);

//     const primaryCheck = await checkDomainAvailability(domain);

//     if (primaryCheck.available) {
//       console.log(`✅ ${domain} is available!`);
//       return {
//         success: true,
//         domain,
//         available: true,
//         message: 'Domain is available for registration!',
//         suggestions: [],
//         source: primaryCheck.source || 'whois_lookup'
//       };
//     }

//     console.log(`❌ ${domain} is taken. Generating alternatives…`);
//     const suggestions = generateDomainSuggestions(domain);

//     const suggestionResults = await checkMultipleDomains(suggestions.slice(0, 5), 5);

//     const availableSuggestions = suggestionResults
//       .filter(r => r.available)
//       .map(r => r.domain);

//     console.log(`📊 Found ${availableSuggestions.length} available alternatives out of ${suggestionResults.length} checked`);

//     return {
//       success: true,
//       domain,
//       available: false,
//       message: 'Domain is not available',
//       suggestions: availableSuggestions,
//       suggestionsCount: availableSuggestions.length,
//       checkedSuggestions: suggestionResults.length,
//       registrar: primaryCheck.registrar,
//       expirationDate: primaryCheck.expirationDate
//     };

//   } catch (error) {
//     console.error('❌ Domain check failed:', error);
//     return {
//       success: false,
//       domain,
//       error: error.message,
//       message: 'Unable to check domain availability'
//     };
//   }
// }

// /* ------------------------------------------------------------------ */
// /*  6.  Exports                                                         */
// /* ------------------------------------------------------------------ */
// module.exports = {
//   getDomainAvailability,
//   checkDomainAvailability,
//   generateDomainSuggestions,
//   checkMultipleDomains
// };