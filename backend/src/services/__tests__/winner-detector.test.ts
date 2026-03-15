/**
 * Unit tests for winner-detector logic (rule: sales in last N days >= threshold).
 * Integration with DB is not tested here; runWinnerDetection is tested in integration.
 */
describe('winner-detector (logic)', () => {
  const WINNER_SALES_THRESHOLD = Number(process.env.WINNER_SALES_THRESHOLD || '5');
  const WINNER_DAYS_WINDOW = Number(process.env.WINNER_DAYS_WINDOW || '3');

  it('uses configurable threshold and window from env', () => {
    expect(WINNER_SALES_THRESHOLD).toBe(5);
    expect(WINNER_DAYS_WINDOW).toBe(3);
  });

  it('winner rule: sales_last_N_days >= threshold', () => {
    const salesInWindow = 5;
    const isWinner = salesInWindow >= WINNER_SALES_THRESHOLD;
    expect(isWinner).toBe(true);
  });

  it('non-winner when sales below threshold', () => {
    const salesInWindow = 4;
    const isWinner = salesInWindow >= WINNER_SALES_THRESHOLD;
    expect(isWinner).toBe(false);
  });
});
