const { getTierFromPlan, getTierRank, compareTiers } = require('./tierHelper');

describe('tierHelper', () => {
  describe('getTierFromPlan', () => {
    it('should return "entry" for plans with "starter" in name', () => {
      const product = { name: 'Starter Plan' };
      expect(getTierFromPlan(product)).toBe('entry');
    });

    it('should return "entry" for plans with "lite" in name', () => {
      const product = { name: 'Lite Hosting' };
      expect(getTierFromPlan(product)).toBe('entry');
    });

    it('should return "entry" for plans with "basic" in name', () => {
      const product = { name: 'Basic Package' };
      expect(getTierFromPlan(product)).toBe('entry');
    });

    it('should return "mid" for plans with "plus" in name', () => {
      const product = { name: 'Plus Plan' };
      expect(getTierFromPlan(product)).toBe('mid');
    });

    it('should return "mid" for plans with "standard" in name', () => {
      const product = { name: 'Standard Hosting' };
      expect(getTierFromPlan(product)).toBe('mid');
    });

    it('should return "upper" for plans with "pro" in name', () => {
      const product = { name: 'Pro Plan' };
      expect(getTierFromPlan(product)).toBe('upper');
    });

    it('should return "upper" for plans with "advanced" in name', () => {
      const product = { name: 'Advanced Hosting' };
      expect(getTierFromPlan(product)).toBe('upper');
    });

    it('should return "upper" for plans with "ultimate" in name', () => {
      const product = { name: 'Ultimate Package' };
      expect(getTierFromPlan(product)).toBe('upper');
    });

    it('should return "upper" for plans with "enterprise" in name', () => {
      const product = { name: 'Enterprise Solution' };
      expect(getTierFromPlan(product)).toBe('upper');
    });

    it('should be case-insensitive', () => {
      expect(getTierFromPlan({ name: 'STARTER PLAN' })).toBe('entry');
      expect(getTierFromPlan({ name: 'PLUS HOSTING' })).toBe('mid');
      expect(getTierFromPlan({ name: 'PRO PACKAGE' })).toBe('upper');
    });

    it('should default to "upper" for unrecognized plan names', () => {
      const product = { name: 'Custom Plan' };
      expect(getTierFromPlan(product)).toBe('upper');
    });
  });

  describe('getTierRank', () => {
    it('should return 1 for "entry" tier', () => {
      expect(getTierRank('entry')).toBe(1);
    });

    it('should return 2 for "mid" tier', () => {
      expect(getTierRank('mid')).toBe(2);
    });

    it('should return 3 for "upper" tier', () => {
      expect(getTierRank('upper')).toBe(3);
    });

    it('should return 0 for unknown tier', () => {
      expect(getTierRank('unknown')).toBe(0);
    });

    it('should return 0 for null or undefined', () => {
      expect(getTierRank(null)).toBe(0);
      expect(getTierRank(undefined)).toBe(0);
    });
  });

  describe('compareTiers', () => {
    it('should return -1 when tier1 is lower than tier2', () => {
      expect(compareTiers('entry', 'mid')).toBe(-1);
      expect(compareTiers('entry', 'upper')).toBe(-1);
      expect(compareTiers('mid', 'upper')).toBe(-1);
    });

    it('should return 1 when tier1 is higher than tier2', () => {
      expect(compareTiers('mid', 'entry')).toBe(1);
      expect(compareTiers('upper', 'entry')).toBe(1);
      expect(compareTiers('upper', 'mid')).toBe(1);
    });

    it('should return 0 when tiers are equal', () => {
      expect(compareTiers('entry', 'entry')).toBe(0);
      expect(compareTiers('mid', 'mid')).toBe(0);
      expect(compareTiers('upper', 'upper')).toBe(0);
    });

    it('should handle unknown tiers', () => {
      expect(compareTiers('unknown', 'entry')).toBe(-1);
      expect(compareTiers('entry', 'unknown')).toBe(1);
      expect(compareTiers('unknown', 'unknown')).toBe(0);
    });
  });
});
