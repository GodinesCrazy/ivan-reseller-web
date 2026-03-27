import { classifyMlChileAuthState, requiresMlChileOauthReauth } from './ml-chile-auth-truth';

describe('ML Chile auth truth', () => {
  it('detects usable access token', () => {
    expect(
      classifyMlChileAuthState({
        credentialCount: 1,
        hasAccessToken: true,
        hasRefreshToken: true,
      }),
    ).toBe('access_token_present');
  });

  it('detects broken active credential rows with no tokens', () => {
    expect(
      classifyMlChileAuthState({
        credentialCount: 1,
        hasAccessToken: false,
        hasRefreshToken: false,
      }),
    ).toBe('credential_row_present_but_tokens_missing');
  });

  it('detects full absence of credential', () => {
    expect(
      classifyMlChileAuthState({
        credentialCount: 0,
        hasAccessToken: false,
        hasRefreshToken: false,
      }),
    ).toBe('credential_missing');
  });

  it('flags only tokenless states as requiring OAuth reauth', () => {
    expect(requiresMlChileOauthReauth('credential_row_present_but_tokens_missing')).toBe(true);
    expect(requiresMlChileOauthReauth('credential_missing')).toBe(true);
    expect(requiresMlChileOauthReauth('refresh_only')).toBe(false);
    expect(requiresMlChileOauthReauth('access_token_present')).toBe(false);
  });
});
