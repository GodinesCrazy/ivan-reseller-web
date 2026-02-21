import api from './api';

export interface Product {
  id: number;
  title: string;
  description: string;
  price: number;
  originalPrice: number;
  margin: number;
  imageUrl: string;
  category: string;
  aliexpressUrl?: string;
  sku: string;
  stock: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductRequest {
  title: string;
  description?: string;
  price: number;
  originalPrice?: number;
  margin?: number;
  imageUrl?: string;
  aliexpressUrl?: string;
  category?: string;
  sku?: string;
  stock?: number;
  isActive?: boolean;
}

export interface ScrapeProductRequest {
  aliexpressUrl: string;
  margin?: number;
  category?: string;
}

function toProduct(raw: any): Product {
  return {
    id: raw.id,
    title: raw.title || '',
    description: raw.description || '',
    price: raw.price ?? raw.finalPrice ?? raw.suggestedPrice ?? 0,
    originalPrice: raw.originalPrice ?? raw.aliexpressPrice ?? 0,
    margin: raw.margin ?? 0,
    imageUrl: raw.imageUrl || '',
    category: raw.category || '',
    aliexpressUrl: raw.aliexpressUrl,
    sku: raw.sku ?? String(raw.id),
    stock: raw.stock ?? 0,
    isActive: raw.isActive ?? true,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

class ProductsAPI {
  async getAllProducts(): Promise<Product[]> {
    const response = await api.get('/api/products');
    const data = response.data?.data?.products ?? response.data?.products ?? response.data;
    const arr = Array.isArray(data) ? data : [];
    return arr.map(toProduct);
  }

  async getProduct(id: number): Promise<Product> {
    const response = await api.get(`/api/products/${id}`);
    const raw = response.data?.data ?? response.data;
    return toProduct(raw);
  }

  async createProduct(productData: CreateProductRequest): Promise<Product> {
    const response = await api.post('/api/products', {
      title: productData.title,
      description: productData.description,
      aliexpressUrl: productData.aliexpressUrl || productData.imageUrl || '',
      aliexpressPrice: productData.originalPrice || productData.price,
      suggestedPrice: productData.price || productData.originalPrice * 1.5,
      imageUrl: productData.imageUrl,
      category: productData.category,
    });
    const raw = response.data?.data ?? response.data;
    return toProduct(raw);
  }

  async updateProduct(id: number, productData: Partial<CreateProductRequest>): Promise<Product> {
    const response = await api.put(`/api/products/${id}`, productData);
    const raw = response.data?.data ?? response.data;
    return toProduct(raw);
  }

  async deleteProduct(id: number): Promise<void> {
    await api.delete(`/api/products/${id}`);
  }

  async scrapeProduct(scrapeData: ScrapeProductRequest): Promise<Product> {
    const response = await api.post('/api/products/scrape', scrapeData);
    const raw = response.data?.data ?? response.data;
    return toProduct(raw);
  }

  async updateProductStatus(id: number, status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PUBLISHED'): Promise<Product> {
    const response = await api.patch(`/api/products/${id}/status`, { status });
    const raw = response.data?.data ?? response.data;
    return toProduct(raw);
  }
}

export const productsAPI = new ProductsAPI();