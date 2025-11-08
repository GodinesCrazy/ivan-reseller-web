// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/error.middleware';

const prisma = new PrismaClient();

export interface CreateProductDto {
  title: string;
  description?: string;
  aliexpressUrl: string;
  aliexpressPrice: number;
  suggestedPrice: number;
  finalPrice?: number;
  imageUrl?: string;
  imageUrls?: string[];
  category?: string;
  currency?: string;
  tags?: string[];
  shippingCost?: number;
  estimatedDeliveryDays?: number;
  productData?: Record<string, any>;
}

export interface UpdateProductDto {
  title?: string;
  description?: string;
  aliexpressPrice?: number;
  suggestedPrice?: number;
  finalPrice?: number;
  imageUrl?: string;
  imageUrls?: string[];
  category?: string;
  currency?: string;
  tags?: string[];
  shippingCost?: number;
  estimatedDeliveryDays?: number;
  productData?: Record<string, any>;
}

function buildImagePayload(primary?: string, additional?: string[]): string {
  const urls = new Set<string>();

  const addUrl = (value?: string) => {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    // Asegurar que sea URL absoluta http/https
    if (!/^https?:\/\//i.test(trimmed)) return;
    urls.add(trimmed);
  };

  addUrl(primary);
  if (Array.isArray(additional)) {
    for (const extra of additional) {
      addUrl(extra);
    }
  }

  if (urls.size === 0) {
    return JSON.stringify([]);
  }

  return JSON.stringify(Array.from(urls));
}

function mergeProductMetadata(dto: CreateProductDto | UpdateProductDto): Record<string, any> | undefined {
  const meta: Record<string, any> = {};
  if (dto.currency) meta.currency = dto.currency;
  if (dto.tags?.length) meta.tags = dto.tags;
  if (typeof dto.shippingCost === 'number') meta.shippingCost = dto.shippingCost;
  if (typeof dto.estimatedDeliveryDays === 'number') meta.estimatedDeliveryDays = dto.estimatedDeliveryDays;
  if (dto.productData && Object.keys(dto.productData).length) {
    meta.sourceData = dto.productData;
  }

  return Object.keys(meta).length ? meta : undefined;
}

export class ProductService {
  async createProduct(userId: number, data: CreateProductDto) {
    const {
      imageUrl,
      imageUrls,
      tags,
      shippingCost,
      estimatedDeliveryDays,
      currency,
      productData,
      finalPrice,
      ...rest
    } = data;

    const imagesPayload = buildImagePayload(imageUrl, imageUrls);
    const metadata = mergeProductMetadata(data) || {};
    if (!metadata.currency) {
      metadata.currency = currency || 'USD';
    }

    const metadataPayload = Object.keys(metadata).length ? JSON.stringify(metadata) : null;

    const product = await prisma.product.create({
      data: {
        userId,
        aliexpressUrl: rest.aliexpressUrl,
        title: rest.title,
        description: rest.description || null,
        aliexpressPrice: rest.aliexpressPrice,
        suggestedPrice: rest.suggestedPrice,
        finalPrice: finalPrice ?? rest.suggestedPrice,
        category: rest.category || null,
        images: imagesPayload,
        productData: metadataPayload,
        status: 'PENDING',
        isPublished: false,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });

    // Registrar actividad
    await prisma.activity.create({
      data: {
        userId,
        action: 'PRODUCT_CREATED',
        description: `Producto creado: ${product.title}`,
        metadata: JSON.stringify({ productId: product.id }),
      },
    });

    return product;
  }

  async getProducts(userId?: number, status?: string) {
    const where: any = {};
    
    if (userId) {
      where.userId = userId;
    }
    
    if (status) {
      where.status = status;
    }

    return prisma.product.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        sales: {
          select: {
            id: true,
            orderId: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getProductById(id: number) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        sales: {
          include: {
            commission: true,
          },
        },
      },
    });

    if (!product) {
      throw new AppError('Producto no encontrado', 404);
    }

    return product;
  }

  async updateProduct(id: number, userId: number, data: UpdateProductDto) {
    const product = await this.getProductById(id);

    if (product.userId !== userId) {
      throw new AppError('No tienes permiso para editar este producto', 403);
    }

    const {
      imageUrl,
      imageUrls,
      tags,
      shippingCost,
      estimatedDeliveryDays,
      currency,
      productData,
      ...rest
    } = data;

    const updateData: any = {};

    if (typeof rest.title === 'string') updateData.title = rest.title;
    if (typeof rest.description === 'string') updateData.description = rest.description;
    if (typeof rest.aliexpressPrice === 'number') updateData.aliexpressPrice = rest.aliexpressPrice;
    if (typeof rest.suggestedPrice === 'number') updateData.suggestedPrice = rest.suggestedPrice;
    if (typeof rest.finalPrice === 'number') {
      updateData.finalPrice = rest.finalPrice;
    } else if (typeof rest.suggestedPrice === 'number') {
      updateData.finalPrice = rest.suggestedPrice;
    }
    if (typeof rest.category === 'string') updateData.category = rest.category;

    if (imageUrl || imageUrls?.length) {
      updateData.images = buildImagePayload(imageUrl, imageUrls);
    }

    const newMeta = mergeProductMetadata({
      imageUrl,
      imageUrls,
      tags,
      shippingCost,
      estimatedDeliveryDays,
      currency,
      productData,
    });

    if (newMeta) {
      let currentMeta: Record<string, any> = {};
      if (typeof product.productData === 'string' && product.productData.trim()) {
        try {
          const parsed = JSON.parse(product.productData);
          if (parsed && typeof parsed === 'object') {
            currentMeta = parsed;
          }
        } catch {
          currentMeta = {};
        }
      }
      updateData.productData = JSON.stringify({ ...currentMeta, ...newMeta });
    }

    const updated = await prisma.product.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });

    // Registrar actividad
    await prisma.activity.create({
      data: {
        userId,
        action: 'PRODUCT_UPDATED',
        description: `Producto actualizado: ${updated.title}`,
        metadata: JSON.stringify({ productId: id }),
      },
    });

    return updated;
  }

  async updateProductStatus(id: string, status: ProductStatus, adminId: string) {
    const product = await this.getProductById(id);

    const updated = await prisma.product.update({
      where: { id },
      data: { status },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });

    // Registrar actividad del admin
    await prisma.activity.create({
      data: {
        userId: adminId,
        action: 'PRODUCT_STATUS_CHANGED',
        description: `Estado del producto "${product.title}" cambiado a ${status}`,
        metadata: { productId: id, newStatus: status },
      },
    });

    // Registrar actividad del usuario dueño
    await prisma.activity.create({
      data: {
        userId: product.userId,
        action: 'PRODUCT_STATUS_CHANGED',
        description: `Tu producto "${product.title}" ahora está ${status}`,
        metadata: { productId: id, newStatus: status },
      },
    });

    return updated;
  }

  async deleteProduct(id: number, userId: number, isAdmin: boolean = false) {
    const product = await this.getProductById(id);

    if (!isAdmin && product.userId !== userId) {
      throw new AppError('No tienes permiso para eliminar este producto', 403);
    }

    // Verificar que no tenga ventas asociadas
    const salesCount = await prisma.sale.count({
      where: { productId: id }
    });
    if (salesCount > 0) {
      throw new AppError('No se puede eliminar un producto con ventas asociadas', 400);
    }

    await prisma.product.delete({
      where: { id },
    });

    // Registrar actividad
    await prisma.activity.create({
      data: {
        userId,
        action: 'PRODUCT_DELETED',
        description: `Producto eliminado: ${product.title}`,
        metadata: JSON.stringify({ productId: id }),
      },
    });

    return { message: 'Producto eliminado exitosamente' };
  }

  async getProductStats(userId?: number) {
    const where = userId ? { userId } : {};

    const [total, pending, approved, rejected, published] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.count({ where: { ...where, status: 'PENDING' } }),
      prisma.product.count({ where: { ...where, status: 'APPROVED' } }),
      prisma.product.count({ where: { ...where, status: 'REJECTED' } }),
      prisma.product.count({ where: { ...where, status: 'PUBLISHED' } }),
    ]);

    return {
      total,
      pending,
      approved,
      rejected,
      published,
    };
  }
}

export const productService = new ProductService();
