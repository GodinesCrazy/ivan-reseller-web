/**
 * Thrown when AliExpress Affiliate API returns 0 products for a common keyword
 * despite valid token. Indicates affiliate permission is missing or not approved.
 */
export class AffiliatePermissionMissingError extends Error {
  readonly code = 'AFFILIATE_PERMISSION_MISSING';
  readonly keyword: string;

  constructor(keyword: string) {
    super(`Affiliate permission missing: 0 products for common keyword "${keyword}"`);
    this.name = 'AffiliatePermissionMissingError';
    this.keyword = keyword;
  }
}

export default AffiliatePermissionMissingError;
