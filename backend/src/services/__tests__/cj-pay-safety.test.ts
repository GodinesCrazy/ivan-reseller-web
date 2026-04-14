import { evaluateCjPayConfirmToken, evaluateCjPayExecutionSafety } from '../cj-pay-safety';

describe('evaluateCjPayExecutionSafety', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it('allows when no allowlist and no max', () => {
    delete process.env.CJ_PAY_ORDER_ID_ALLOWLIST;
    delete process.env.CJ_PAY_MAX_ORDER_USD;
    expect(evaluateCjPayExecutionSafety({ id: 'order-1', price: 99 }).ok).toBe(true);
  });

  it('blocks when order not in allowlist', () => {
    process.env.CJ_PAY_ORDER_ID_ALLOWLIST = 'a,b';
    const r = evaluateCjPayExecutionSafety({ id: 'order-1', price: 1 });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.outcome).toBe('payment_unsafe_to_execute');
  });

  it('allows when order in allowlist', () => {
    process.env.CJ_PAY_ORDER_ID_ALLOWLIST = 'x,order-1';
    expect(evaluateCjPayExecutionSafety({ id: 'order-1', price: 1 }).ok).toBe(true);
  });

  it('blocks when price above max', () => {
    process.env.CJ_PAY_MAX_ORDER_USD = '50';
    const r = evaluateCjPayExecutionSafety({ id: 'order-1', price: 51 });
    expect(r.ok).toBe(false);
  });
});

describe('evaluateCjPayConfirmToken', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it('skips when confirm not required', () => {
    delete process.env.CJ_PAY_REQUIRE_CONFIRM_TOKEN;
    expect(evaluateCjPayConfirmToken(undefined).ok).toBe(true);
  });

  it('blocks when required but token missing', () => {
    process.env.CJ_PAY_REQUIRE_CONFIRM_TOKEN = 'true';
    process.env.CJ_PAY_CONFIRM_TOKEN = 'secret';
    expect(evaluateCjPayConfirmToken(undefined).ok).toBe(false);
  });

  it('allows when token matches', () => {
    process.env.CJ_PAY_REQUIRE_CONFIRM_TOKEN = 'true';
    process.env.CJ_PAY_CONFIRM_TOKEN = 'secret';
    expect(evaluateCjPayConfirmToken('secret').ok).toBe(true);
  });
});
