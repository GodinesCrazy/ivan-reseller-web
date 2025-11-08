export class ManualAuthRequiredError extends Error {
  provider: string;
  token: string;
  loginUrl: string;
  expiresAt: Date;

  constructor(provider: string, token: string, loginUrl: string, expiresAt: Date) {
    super(`Manual authentication required for ${provider}`);
    this.name = 'ManualAuthRequiredError';
    this.provider = provider;
    this.token = token;
    this.loginUrl = loginUrl;
    this.expiresAt = expiresAt;
  }
}

export default ManualAuthRequiredError;

