import axios from 'axios';
import { MercadoLibreService } from '../mercadolibre.service';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));
jest.mock('../marketplace-rate-limit.service', () => ({
  acquireMarketplaceRateLimit: jest.fn().mockResolvedValue(undefined),
}));

const mockedGet = axios.get as jest.MockedFunction<typeof axios.get>;

describe('MercadoLibreService.searchSiteCatalogPublic', () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  it('maps ML site search results without OAuth', async () => {
    mockedGet.mockResolvedValueOnce({
      data: {
        results: [
          {
            id: 'MLC123',
            title: 'Test item',
            price: 19990,
            currency_id: 'CLP',
            permalink: 'https://articulo.mercadolibre.cl/MLC-123',
            seller: { id: 1 },
          },
        ],
      },
    } as any);

    const rows = await MercadoLibreService.searchSiteCatalogPublic({
      siteId: 'MLC',
      q: 'auriculares bluetooth',
      limit: 10,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe(19990);
    expect(rows[0].currency_id).toBe('CLP');
    expect(mockedGet).toHaveBeenCalledWith(
      expect.stringContaining('/sites/MLC/search?'),
      expect.any(Object)
    );
  });
});
