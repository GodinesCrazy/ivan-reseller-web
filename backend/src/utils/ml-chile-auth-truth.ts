export type MlChileAuthState =
  | 'access_token_present'
  | 'refresh_only'
  | 'credential_row_present_but_tokens_missing'
  | 'credential_missing';

export function classifyMlChileAuthState(params: {
  credentialCount: number;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
}): MlChileAuthState {
  if (params.hasAccessToken) return 'access_token_present';
  if (params.hasRefreshToken) return 'refresh_only';
  if (params.credentialCount > 0) return 'credential_row_present_but_tokens_missing';
  return 'credential_missing';
}

export function requiresMlChileOauthReauth(state: MlChileAuthState): boolean {
  return state === 'credential_row_present_but_tokens_missing' || state === 'credential_missing';
}
