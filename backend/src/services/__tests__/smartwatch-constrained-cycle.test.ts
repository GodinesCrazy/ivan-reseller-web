import { isSmartwatchTitleForConstrainedCycle } from '../smartwatch-constrained-cycle.utils';

describe('smartwatch constrained cycle — title filter', () => {
  it('matches smartwatch / smart watch variants', () => {
    expect(isSmartwatchTitleForConstrainedCycle('Xiaomi Smart Watch Band')).toBe(true);
    expect(isSmartwatchTitleForConstrainedCycle('smartwatch kids')).toBe(true);
    expect(isSmartwatchTitleForConstrainedCycle('SMART-WATCH Pro')).toBe(true);
    expect(isSmartwatchTitleForConstrainedCycle('reloj deportivo')).toBe(false);
  });
});
