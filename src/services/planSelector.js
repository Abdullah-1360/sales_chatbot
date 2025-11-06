/**
 * Plan Selector - Select 3 plans: best fit, one cheaper, one higher
 */

/**
 * Select 3 plans: best fit at budget, one cheaper, one higher
 * @param {Array} plans - Plans with confidence scores and prices
 * @param {number} budget - User's monthly budget
 * @returns {Array} Up to 3 plans
 */
function selectThreePlans(plans, budget) {
  if (!plans || plans.length === 0) return [];
  
  // Add price as number for easier comparison
  const plansWithPrice = plans.map(p => ({
    ...p,
    priceNum: Number(p.pricing.USD.monthly)
  }));
  
  // Sort by confidence (desc), then price (asc)
  plansWithPrice.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.priceNum - b.priceNum;
  });
  
  // If 3 or fewer plans, return all
  if (plansWithPrice.length <= 3) {
    plansWithPrice.forEach(p => delete p.priceNum);
    return plansWithPrice;
  }
  
  // Find best fit at budget (highest confidence within budget)
  const withinBudget = plansWithPrice.filter(p => p.priceNum <= budget);
  const bestFit = withinBudget.length > 0 ? withinBudget[0] : plansWithPrice[0];
  
  const selected = [bestFit];
  const selectedIds = new Set([bestFit.pid]);
  
  // Find one cheaper (if exists)
  const cheaper = plansWithPrice.find(p => 
    !selectedIds.has(p.pid) && p.priceNum < bestFit.priceNum
  );
  if (cheaper) {
    selected.push(cheaper);
    selectedIds.add(cheaper.pid);
  }
  
  // Find one higher (if exists)
  const higher = plansWithPrice.find(p => 
    !selectedIds.has(p.pid) && p.priceNum > bestFit.priceNum
  );
  if (higher) {
    selected.push(higher);
    selectedIds.add(higher.pid);
  }
  
  // If we don't have 3 yet, fill with next best by confidence
  while (selected.length < 3 && selected.length < plansWithPrice.length) {
    const next = plansWithPrice.find(p => !selectedIds.has(p.pid));
    if (next) {
      selected.push(next);
      selectedIds.add(next.pid);
    } else {
      break;
    }
  }
  
  // Sort final selection by confidence desc, then price asc
  selected.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.priceNum - b.priceNum;
  });
  
  // Clean up priceNum
  selected.forEach(p => delete p.priceNum);
  
  return selected;
}

module.exports = {
  selectThreePlans
};
