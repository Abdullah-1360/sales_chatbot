/**
 * WHMCS Client Resolver
 * Resolves a client from WHMCS using email and/or domain.
 * Priority: email → domain registration → hosting service
 * Returns full client data { clientId, email, firstname, lastname, phone } or null.
 */

const { getClientsDetails, callApi } = require('../services/whmcsService');

async function resolveClientFromWhmcs(email, domain) {
  const tasks = [];

  if (email && email.trim() !== '') {
    tasks.push(
      getClientsDetails({ email: email.trim() })
        .then(r => r && r.userid ? { source: 'email', clientId: r.userid, data: r } : null)
        .catch(() => null)
    );
  }

  if (domain && domain.trim() !== '') {
    const cleanDomain = domain.trim().toLowerCase();

    tasks.push(
      callApi('GetClientsDomains', { domain: cleanDomain })
        .then(r => {
          const arr = r?.domains?.domain;
          const list = Array.isArray(arr) ? arr : (arr ? [arr] : []);
          if (list.length > 0) return { source: 'domain', clientId: String(list[0].userid || list[0].clientid), data: null };
          return null;
        })
        .catch(() => null)
    );

    tasks.push(
      callApi('GetClientsProducts', { domain: cleanDomain })
        .then(r => {
          const arr = r?.products?.product;
          const list = Array.isArray(arr) ? arr : (arr ? [arr] : []);
          if (list.length > 0) return { source: 'hosting', clientId: String(list[0].userid || list[0].clientid), data: null };
          return null;
        })
        .catch(() => null)
    );
  }

  if (tasks.length === 0) return null;

  const results = await Promise.all(tasks);
  const resolved = results.find(r => r !== null);
  if (!resolved) return null;

  // Email lookup already returns full data
  if (resolved.data && resolved.data.email) {
    return {
      clientId: resolved.clientId,
      email: resolved.data.email,
      firstname: resolved.data.firstname || '',
      lastname: resolved.data.lastname || '',
      phone: resolved.data.phonenumber || '',
    };
  }

  // Domain/hosting lookup — fetch full details by clientId
  try {
    const details = await getClientsDetails({ clientid: resolved.clientId });
    if (details && details.email) {
      return {
        clientId: resolved.clientId,
        email: details.email,
        firstname: details.firstname || '',
        lastname: details.lastname || '',
        phone: details.phonenumber || '',
      };
    }
  } catch (_) {}

  return { clientId: resolved.clientId, email: null, firstname: '', lastname: '', phone: '' };
}

module.exports = { resolveClientFromWhmcs };
