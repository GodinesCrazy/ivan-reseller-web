import { extractAliExpressItemIdFromUrl } from '../aliexpress-item-id';

describe('extractAliExpressItemIdFromUrl', () => {
  it('parses standard item URLs', () => {
    expect(extractAliExpressItemIdFromUrl('https://www.aliexpress.com/item/1005001234567.html')).toBe('1005001234567');
  });

  it('parses query item_id', () => {
    expect(extractAliExpressItemIdFromUrl('https://a.aliexpress.com/_foo?item_id=1005001234567')).toBe('1005001234567');
  });
});
