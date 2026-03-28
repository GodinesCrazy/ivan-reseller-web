/** AliExpress Affiliate `aliexpress.affiliate.product.query` caps page_size (see aliexpress-affiliate-api.service). */
export const OPPORTUNITY_AFFILIATE_MAX_PAGE_SIZE = 20;

/** Safe upper bound for page number to limit fan-out / abuse. */
export const OPPORTUNITY_MAX_PAGE = 500;

export function normalizeOpportunityPagination(
  maxItems: number | undefined,
  page: number | undefined
): { pageSize: number; pageNo: number } {
  const pageSize = Math.min(Math.max(Number(maxItems) || OPPORTUNITY_AFFILIATE_MAX_PAGE_SIZE, 1), OPPORTUNITY_AFFILIATE_MAX_PAGE_SIZE);
  const pageNo = Math.max(1, Math.min(Number(page) || 1, OPPORTUNITY_MAX_PAGE));
  return { pageSize, pageNo };
}
