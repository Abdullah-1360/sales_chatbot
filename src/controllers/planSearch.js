/**
 * Plan Search Controller
 */

const { searchPlansWithFilters, parseNaturalLanguageQuery } = require('../services/planSearch');

/**
 * Search plans with natural language query
 * Supports queries like:
 * - "wp pro" - simple plan name
 * - "wp pro with 2 years" - plan with billing period
 * - "biz plan under 2000" - plan with price filter
 * - "reseller with free domain" - plan with feature filter
 * - "wordpress 10gb annually" - plan with space and period
 * - "ssl certificate under 5000 annually" - multiple filters
 * 
 * GET /api/plans/search?q=wp pro with 2 years
 */
async function searchPlans(req, res) {
  try {
    const query = req.query.q || req.query.query || req.query.name;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required. Use ?q=your search query',
        count: 0,
        results: []
      });
    }

    // Parse the natural language query
    const parsedFilters = parseNaturalLanguageQuery(query);

    // Search with filters
    const results = await searchPlansWithFilters(query);

    // Ensure results is always an array
    const safeResults = Array.isArray(results) ? results : [];

    res.json({
      success: true,
      query,
      parsed: {
        planName: parsedFilters.planName,
        filters: Object.fromEntries(
          Object.entries(parsedFilters)
            .filter(([k, v]) => k !== 'planName' && v !== null && v !== undefined && v !== 'monthly')
        )
      },
      count: safeResults.length,
      results: safeResults
    });

  } catch (error) {
    console.error('Search controller error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      count: 0,
      results: []
    });
  }
}

module.exports = {
  searchPlans
};
