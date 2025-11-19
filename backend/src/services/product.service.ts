import { PrismaClient, ProductStatus } from '@prisma/client';
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
    if (!value || typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length < 3) return;
    
    // ✅ Normalizar URL a formato absoluto http/https
    let normalizedUrl = trimmed;
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      if (normalizedUrl.startsWith('//')) {
        normalizedUrl = `https:${normalizedUrl}`;
      } else if (normalizedUrl.startsWith('/')) {
        normalizedUrl = `https://www.aliexpress.com${normalizedUrl}`;
      } else if (!normalizedUrl.includes(' ') && normalizedUrl.length > 3) {
        normalizedUrl = `https://${normalizedUrl}`;
      } else {
        // URL inválida, saltar
        return;
      }
    }
    
    // Solo agregar si es una URL válida
    try {
      new URL(normalizedUrl);
      urls.add(normalizedUrl);
    } catch {
      // URL inválida, saltar
    }
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

    // ✅ Logging antes de crear el producto
    const logger = require('../config/logger').logger;
    logger.info('[PRODUCT-SERVICE] Creating product', {
      userId,
      title: rest.title?.substring(0, 50),
      aliexpressUrl: rest.aliexpressUrl?.substring(0, 80),
      aliexpressPrice: rest.aliexpressPrice,
      suggestedPrice: rest.suggestedPrice,
      hasImage: !!imageUrl || (imageUrls && imageUrls.length > 0),
      hasProductData: !!productData && Object.keys(productData).length > 0,
      status: 'PENDING'
    });

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

    // ✅ Logging después de crear el producto
    logger.info('[PRODUCT-SERVICE] Product created successfully', {
      productId: product.id,
      userId,
      title: product.title?.substring(0, 50),
      status: product.status,
      aliexpressPrice: product.aliexpressPrice,
      suggestedPrice: product.suggestedPrice
    });

    // Registrar actividad
    await prisma.activity.create({
      data: {
        userId,
        action: 'PRODUCT_CREATED',
        description: `Producto creado: ${product.title}`,
        metadata: JSON.stringify({ productId: product.id }),
      },
    }).catch(err => {
      // No fallar si no se puede crear la actividad
      logger.warn('[PRODUCT-SERVICE] Failed to create activity', { error: err instanceof Error ? err.message : String(err) });
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

  /**
   * Get product by ID with optional ownership validation
   * @param id - Product ID
   * @param userId - Optional user ID to validate ownership (if provided, non-admin users can only see their own products)
   * @param isAdmin - Whether the requesting user is an admin (admins can see all products)
   */
  async getProductById(id: number, userId?: number, isAdmin: boolean = false) {
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

    // ✅ C2: Validar ownership - usuarios no-admin solo pueden ver sus propios productos
    if (userId && !isAdmin && product.userId !== userId) {
      throw new AppError('No tienes permiso para ver este producto', 403);
    }

    return product;
  }

  async updateProduct(id: number, userId: number, data: UpdateProductDto) {
    // ✅ C2: Pasar userId e isAdmin para validar ownership
    const product = await this.getProductById(id, userId, false);

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

  async updateProductStatus(id: number, status: ProductStatus, adminId: number) {
    // ✅ C2: Admin puede ver todos los productos
    const product = await this.getProductById(id, adminId, true);

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
    // ✅ C2: Pasar userId e isAdmin para validar ownership
    const product = await this.getProductById(id, userId, isAdmin);

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
