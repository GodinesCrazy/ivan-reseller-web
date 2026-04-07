import { MercadoLibreService, type MLProduct } from '../mercadolibre.service';

function buildService(siteId: string = 'MLC') {
  return new MercadoLibreService({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    userId: 'seller-1',
    siteId,
  });
}

function baseProduct(overrides: Partial<MLProduct> = {}): MLProduct {
  return {
    __publishContext: 'marketplace_service',
    title: 'Producto de prueba',
    description: 'Descripcion de prueba',
    categoryId: 'MLC1234',
    price: 10000,
    quantity: 1,
    condition: 'new',
    images: ['https://images.example.com/1.jpg'],
    shipping: {
      mode: 'me2',
      freeShipping: false,
      handlingTime: 3,
      dimensions: '10x8x4,350',
    },
    ...overrides,
  };
}

describe('MercadoLibreService.createListing physical package guard (Phase 1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks listing when MLC/me2 shipping dimensions are missing', async () => {
    const service = buildService('MLC');
    await expect(
      service.createListing(
        baseProduct({
          shipping: {
            mode: 'me2',
            freeShipping: false,
            handlingTime: 2,
          },
        })
      )
    ).rejects.toThrow('shipping.dimensions is required');
  });

  it('blocks listing when shipping dimensions format is invalid', async () => {
    const service = buildService('MLC');
    await expect(
      service.createListing(
        baseProduct({
          shipping: {
            mode: 'me2',
            freeShipping: false,
            handlingTime: 2,
            dimensions: '10x8x0,0',
          },
        })
      )
    ).rejects.toThrow('shipping.dimensions values must be positive and non-zero');
  });

  it('allows listing when real package dimensions are present', async () => {
    const service = buildService('MLC');
    jest.spyOn(service, 'uploadImages').mockResolvedValue(['PIC-1']);
    jest.spyOn(service, 'validateListing').mockResolvedValue({ valid: true });
    jest.spyOn(service, 'getItemStatus').mockResolvedValue({
      status: 'active',
      permalink: 'https://articulo.mercadolibre.cl/MLC-ITEM-1',
    });

    const postMock = jest
      .spyOn((service as any).apiClient, 'post')
      .mockResolvedValue({ data: { id: 'MLC-ITEM-1', permalink: 'https://articulo.mercadolibre.cl/MLC-ITEM-1', status: 'active' } });
    jest.spyOn((service as any).apiClient, 'put').mockResolvedValue({ data: {} });

    const result = await service.createListing(baseProduct());

    expect(result.success).toBe(true);
    expect(result.itemId).toBe('MLC-ITEM-1');
    const itemPost = postMock.mock.calls.find((call) => call[0] === '/items');
    expect((itemPost?.[1] as any)?.shipping?.dimensions).toBe('10x8x4,350');
  });
});
