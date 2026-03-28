import {
  normalizeOpportunityPagination,
  OPPORTUNITY_AFFILIATE_MAX_PAGE_SIZE,
  OPPORTUNITY_MAX_PAGE,
} from '../opportunity-search-pagination';

describe('normalizeOpportunityPagination', () => {
  it('defaults to page 1 and max page size when args missing', () => {
    expect(normalizeOpportunityPagination(undefined, undefined)).toEqual({
      pageSize: OPPORTUNITY_AFFILIATE_MAX_PAGE_SIZE,
      pageNo: 1,
    });
  });

  it('clamps page size to affiliate max', () => {
    expect(normalizeOpportunityPagination(999, 1).pageSize).toBe(OPPORTUNITY_AFFILIATE_MAX_PAGE_SIZE);
    expect(normalizeOpportunityPagination(5, 1).pageSize).toBe(5);
  });

  it('clamps page number', () => {
    expect(normalizeOpportunityPagination(20, 0).pageNo).toBe(1);
    expect(normalizeOpportunityPagination(20, OPPORTUNITY_MAX_PAGE + 1).pageNo).toBe(OPPORTUNITY_MAX_PAGE);
  });
});
