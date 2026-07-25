/**
 * Ticket Deduplication Service
 *
 * Within a 30-minute window, if the same client makes the SAME TYPE of request
 * that would create a ticket, the new content is appended as a reply to the
 * existing ticket instead of creating a new one.
 *
 * Cache key: `<clientIdentifier>:<ticketType>`
 * This ensures a payment confirmation and a service issue for the same client
 * are NEVER merged — only identical ticket types merge.
 *
 * Ticket types (pass as `ticketType` param):
 *   'payment_confirmation'  - confirmPayment endpoint
 *   'service_renewal'       - early/overdue service renewal
 *   'domain_renewal'        - early/overdue domain renewal
 *   'service_issue'         - service status / tech support
 *   'auto_chat'             - auto-ticket from unanswered chat
 *   'manual'                - manual ticket via /tickets endpoint
 *   'password_reset'        - password reset support
 *   'wordpress_diagnostic'  - WP diagnostic issues
 *   'cphulk_security'       - cPHulk IP unblock
 */

const { openTicket, addTicketReply } = require('./whmcsService');
const { createLogger } = require('../utils/logger');

const logger = createLogger('TICKET_DEDUP');

const WINDOW_MS = 30 * 60 * 1000; // 30 minutes

// In-memory cache: cacheKey → { ticketId, ticketNumber, clientId, email, domain, ticketType, createdAt }
const cache = new Map();

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalise a ticket type string into a stable slug.
 */
function normaliseType(ticketType) {
  return (ticketType || 'manual').toLowerCase().replace(/\s+/g, '_');
}

/**
 * Build all lookup keys for a client+type combination.
 * Multiple keys let any identifier (clientId, email, domain) find the entry.
 */
function keysFor({ clientId, email, domain, ticketType }) {
  const type = normaliseType(ticketType);
  const keys = [];
  if (clientId) keys.push(`cid:${String(clientId).toLowerCase()}:${type}`);
  if (email && !email.includes('@uchat.generated') && !email.startsWith('client@')) {
    keys.push(`email:${email.toLowerCase()}:${type}`);
  }
  if (domain) keys.push(`domain:${domain.toLowerCase()}:${type}`);
  return keys;
}

/**
 * Find an unexpired cache entry matching any of the provided identifiers + type.
 */
function findCached({ clientId, email, domain, ticketType }) {
  const now = Date.now();
  for (const key of keysFor({ clientId, email, domain, ticketType })) {
    const entry = cache.get(key);
    if (entry && now - entry.createdAt < WINDOW_MS) return entry;
    if (entry) cache.delete(key); // expired — clean up
  }
  return null;
}

/**
 * Store a ticket entry under all applicable keys.
 */
function storeEntry({ ticketId, ticketNumber, clientId, email, domain, ticketType }) {
  const entry = { ticketId, ticketNumber, clientId, email, domain, ticketType, createdAt: Date.now() };
  for (const key of keysFor({ clientId, email, domain, ticketType })) {
    cache.set(key, entry);
  }
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Open a ticket or append to an existing one of the SAME TYPE within 30 minutes.
 *
 * @param {object} params
 * @param {string} params.ticketType   - Category slug (see file header for values)
 * @param {string} [params.clientid]   - WHMCS client ID
 * @param {string} [params.email]      - Client email (for guest tickets / cache lookup)
 * @param {string} [params.domain]     - Domain (for cache lookup only)
 * @param {string} params.message      - Ticket / reply body
 * @param {*}      ...rest             - All other openTicket params (deptid, subject, priority…)
 *
 * @returns {Promise<{ ticketId, ticketNumber, merged: boolean }>}
 */
async function openOrMergeTicket(params) {
  const { ticketType, clientid, email, domain, message, ...rest } = params;

  const existing = findCached({ clientId: clientid, email, domain, ticketType });

  if (existing) {
    logger.info('🔀 Merging into existing ticket (same type, within 30-min window)', {
      ticketId: existing.ticketId,
      ticketNumber: existing.ticketNumber,
      ticketType: normaliseType(ticketType),
      matchedBy: clientid ? 'clientId' : email ? 'email' : 'domain',
    });

    const separator = '\n\n---\n**Additional message (same session):**\n';
    await addTicketReply(
      existing.ticketId,
      `${separator}${message}`,
      clientid || existing.clientId
    );

    return { ticketId: existing.ticketId, ticketNumber: existing.ticketNumber, merged: true };
  }

  // No matching ticket — create a new one
  const result = await openTicket({ clientid, email, message, ...rest });
  const ticketId = result.id || result.ticketid;
  const ticketNumber = result.tid || result.ticketid;

  storeEntry({ ticketId, ticketNumber, clientId: clientid, email, domain, ticketType });

  logger.info('🎫 New ticket created and cached', {
    ticketId,
    ticketNumber,
    ticketType: normaliseType(ticketType),
  });

  return { ticketId, ticketNumber, merged: false };
}

/**
 * Manually invalidate cache for a client+type (e.g. ticket closed).
 */
function invalidate({ clientId, email, domain, ticketType }) {
  for (const key of keysFor({ clientId, email, domain, ticketType })) {
    cache.delete(key);
  }
}

module.exports = { openOrMergeTicket, invalidate };
