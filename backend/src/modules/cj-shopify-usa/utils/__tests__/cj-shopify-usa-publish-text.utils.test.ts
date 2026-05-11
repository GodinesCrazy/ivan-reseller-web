import {
  buildVariantLabel,
  inferOptionName,
  sanitizeHandle,
  stripHtmlToPlainText,
  toTitleCase,
} from '../cj-shopify-usa-publish-text.utils';

describe('cj-shopify-usa-publish-text.utils', () => {
  it('buildVariantLabel strips duplicate product title prefix', () => {
    expect(buildVariantLabel({ label: 'Dog Bowl — Red' }, 'Dog Bowl')).toBe('— Red');
  });

  it('inferOptionName prefers Color when many color-like labels', () => {
    expect(inferOptionName(['Red', 'Blue', 'Navy', 'Black'])).toBe('Color');
  });

  it('sanitizeHandle slugifies', () => {
    expect(sanitizeHandle('Hello World!!')).toBe('hello-world');
  });

  it('stripHtmlToPlainText removes tags and decodes entities', () => {
    expect(stripHtmlToPlainText('<p>Hi &amp; bye</p>')).toBe('Hi & bye');
  });

  it('toTitleCase keeps minor words lower after first word', () => {
    expect(toTitleCase('battle of the planets')).toBe('Battle of the Planets');
  });
});
