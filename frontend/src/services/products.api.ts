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
  description: string;
  price: number;
  originalPrice: number;
  margin: number;
  imageUrl: string;
  category: string;
  sku: string;
  stock: number;
  isActive: boolean;
}

export interface ScrapeProductRequest {
  aliexpressUrl: string;
  margin?: number;
  category?: string;
}

class ProductsAPI {
  async getAllProducts(): Promise<Product[]> {
    const response = await api.get('/products');
    return response.data;
  }

  async getProduct(id: number): Promise<Product> {
    const response = await api.get(`/products/${id}`);
    return response.data;
  }

  async createProduct(productData: CreateProductRequest): Promise<Product> {
    const response = await api.post('/products', productData);
    return response.data;
  }

  async updateProduct(id: number, productData: Partial<CreateProductRequest>): Promise<Product> {
    const response = await api.put(`/products/${id}`, productData);
    return response.data;
  }

  async deleteProduct(id: number): Promise<void> {
    await api.delete(`/products/${id}`);
  }

  async scrapeProduct(scrapeData: ScrapeProductRequest): Promise<Product> {
    const response = await api.post('/products/scrape', scrapeData);
    return response.data;
  }

  async toggleProductStatus(id: number): Promise<Product> {
    const response = await api.patch(`/products/${id}/toggle-status`);
    return response.data;
  }
}

export const productsAPI = new ProductsAPI();