import assert from 'node:assert/strict';
import { classifyAliExpressFreightCompatibility } from '../src/utils/aliexpress-freight-compatibility';
import { selectMlChileFreightOption } from '../src/utils/ml-chile-freight-selector';
import { normalizeAliExpressFreightQuoteResult } from '../src/utils/aliexpress-freight-normalizer';

function main() {
  const incompatible = classifyAliExpressFreightCompatibility({
    appFamily: 'dropshipping',
    tokenFamily: 'dropshipping_session',
    hasAccessToken: true,
    hasRefreshToken: true,
    aliSubCode: 'isv.appkey-not-exists',
    lastFailureReason: 'Invalid app Key',
    accountInfoUsable: true,
  });
  assert.equal(incompatible.freightCredentialCompatibility, 'freight_endpoint_incompatible');

  const normalized = normalizeAliExpressFreightQuoteResult({
    solutions: [
      {
        service_name: 'AliExpress Standard Shipping',
        freight: {
          amount: '2.55',
          currency_code: 'USD',
        },
        delivery_time: '7-14 day',
      },
    ],
  });
  assert.equal(normalized.options.length, 1);
  assert.equal(normalized.options[0]?.freightAmount, 2.55);

  const selected = selectMlChileFreightOption(normalized.options);
  assert.equal(selected.selected?.serviceName, 'AliExpress Standard Shipping');

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        status: 'ok',
        checks: [
          'compatibility_invalid_app_key',
          'freight_normalization_nested_amount',
          'selector_prefers_standard_shipping',
        ],
      },
      null,
      2,
    ),
  );
}

main();
