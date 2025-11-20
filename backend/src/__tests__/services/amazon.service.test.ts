import { AmazonService } from '../../../backend/src/services/amazon.service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AmazonService', () => {
  let service: AmazonService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new AmazonService();
    // @ts-expect-error set private field for testing
    service.credentials = {
      clientId: 'cid',
      clientSecret: 'csec',
      refreshToken: 'rtok',
      accessToken: 'atk',
      region: 'us-east-1',
      marketplace: 'ATVPDKIKX0DER',
    };
    // @ts-expect-error override base URL
    service.httpClient = axios.create();
    mockedAxios.create.mockReturnValue(mockedAxios as any);
  });

  test('authenticate sets access token header', async () => {
    // force authenticate to use axios.post
    // @ts-expect-error
    service.credentials.accessToken = undefined;

    mockedAxios.post.mockResolvedValue({ data: { access_token: 'newtoken' } } as any);
    // @ts-expect-error access private
    service.httpClient = mockedAxios as any;

    const token = await service.authenticate();
    expect(token).toBe('newtoken');
  });

  test('updatePrice returns true on 200 response', async () => {
    mockedAxios.patch.mockResolvedValue({ status: 200 } as any);
    // @ts-expect-error access private
    service.httpClient = mockedAxios as any;

    const ok = await service.updatePrice('SKU1', 19.99, 'USD');
    expect(ok).toBe(true);
  });

  test('getMyListings returns items and nextToken', async () => {
    mockedAxios.get.mockResolvedValue({ data: { items: [{ sku: 'A' }], nextToken: 'NEXT' } } as any);
    // @ts-expect-error access private
    service.httpClient = mockedAxios as any;

    const res = await service.getMyListings(10);
    expect(res.items.length).toBe(1);
    expect(res.nextToken).toBe('NEXT');
  });

  test('updatePrice returns false on error', async () => {
    mockedAxios.patch.mockRejectedValue(new Error('Bad Request'));
    // @ts-expect-error access private
    service.httpClient = mockedAxios as any;

    const ok = await service.updatePrice('SKU1', 19.99, 'USD');
    expect(ok).toBe(false);
  });

  test('searchCatalog returns empty array on error', async () => {
    mockedAxios.get.mockRejectedValue(new Error('Network error'));
    // @ts-expect-error access private
    service.httpClient = mockedAxios as any;

    const res = await service.searchCatalog({ keywords: 'watch' });
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBe(0);
  });

  test('createListing returns error result when feed submission fails', async () => {
    // Simular error en feed doc o post del feed
    mockedAxios.post.mockRejectedValue(new Error('Feed error'));
    // @ts-expect-error access private
    service.httpClient = mockedAxios as any;

    const result = await service.createListing({
      sku: 'SKU-ERR',
      title: 'Test',
      description: 'Desc',
      price: 10,
      currency: 'USD',
      quantity: 1,
      images: [],
      category: 'cat',
      attributes: {}
    } as any);

    expect(result.success).toBe(false);
    expect(result.status).toBe('ERROR');
  });
});
