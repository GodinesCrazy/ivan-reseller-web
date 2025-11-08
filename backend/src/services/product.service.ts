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
  currency?: string;
  imageUrl?: string;
  category?: string;
  tags?: string[];
  shippingCost?: number;
  estimatedDeliveryDays?: number;
}

export interface UpdateProductDto {
  title?: string;
  description?: string;
  aliexpressPrice?: number;
  suggestedPrice?: number;
  imageUrl?: string;
  category?: string;
  tags?: string[];
  shippingCost?: number;
  estimatedDeliveryDays?: number;
}

export class ProductService {
  async createProduct(userId: number, data: CreateProductDto) {
    const product = await prisma.product.create({
      data: {
        ...data,
        userId,
        status: 'PENDING',
        currency: data.currency || 'USD',
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

    const updated = await prisma.product.update({
      where: { id },
      data,
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
