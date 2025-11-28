import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/error.middleware';
import logger from '../config/logger';

const prisma = new PrismaClient();

// ✅ Definir ProductStatus localmente si no está en Prisma
type ProductStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PUBLISHED' | 'INACTIVE';

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
  // ✅ MEJORADO: Costos adicionales para cálculo preciso
  shippingCost?: number;
  importTax?: number;
  totalCost?: number;
  targetCountry?: string;
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
  // ✅ MEJORADO: Costos adicionales para cálculo preciso
  shippingCost?: number;
  importTax?: number;
  totalCost?: number;
  targetCountry?: string;
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
        normalizedUrl = `https://www.aliexpress.com${normalizedUrl}`; else if (normalizedUrl.startsWith('/')) {
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

/**
 * Extraer imageUrl del campo images (JSON string)
 */
function extractImageUrl(imagesString: string | null | undefined): string | null {
  if (!imagesString) return null;
  
  try {
    const images = JSON.parse(imagesString);
    if (Array.isArray(images) && images.length > 0 && typeof images[0] === 'string') {
      return images[0];
    }
  } catch (error) {
    // Si no es JSON válido, retornar null
  }
  
  return null;
}

export class ProductService {
  async createProduct(userId: number, data: CreateProductDto, isAdmin: boolean = false) {
    const {
      imageUrl,
      imageUrls,
      tags,
      shippingCost,
      importTax,
      totalCost,
      targetCountry,
      estimatedDeliveryDays,
      currency,
      productData,
      finalPrice,
      ...rest
    } = data;

    // ✅ CORREGIDO: Declarar variables mutables para poder actualizarlas después de la validación
    let finalImageUrl = imageUrl;
    let finalImageUrls = imageUrls;

    // ✅ LÍMITE DE PRODUCTOS PENDIENTES: Validar antes de crear
    const { pendingProductsLimitService } = await import('./pending-products-limit.service');
    await pendingProductsLimitService.ensurePendingLimitNotExceeded(userId, isAdmin);

    // ✅ VALIDACIÓN DE IMÁGENES: Validar calidad antes de crear producto
    const allImageUrls: string[] = [];
    if (finalImageUrl) allImageUrls.push(finalImageUrl);
    if (finalImageUrls && Array.isArray(finalImageUrls)) allImageUrls.push(...finalImageUrls);

    if (allImageUrls.length > 0) {
      try {
        const { getImageValidationService } = await import('./image-validation.service');
        const imageValidator = getImageValidationService();
        const validationResults = await imageValidator.validateAndFilterImages(allImageUrls);

        // Si hay imágenes inválidas, registrar warning pero continuar (compatibilidad retroactiva)
        if (validationResults.invalid.length > 0) {
          logger.warn('[PRODUCT-SERVICE] Algunas imágenes no pasaron validación', {
            userId,
            invalidImages: validationResults.invalid.map(i => ({
              url: i.url.substring(0, 80),
              errors: i.errors
            }))
          });

          // Si TODAS las imágenes son inválidas, lanzar error
          if (validationResults.valid.length === 0) {
            throw new AppError(
              `Todas las imágenes proporcionadas fallaron la validación. Errores: ${validationResults.invalid.map(i => i.errors.join('; ')).join(' | ')}`,
              400
            );
          }
        }

        // Si hay advertencias, registrar
        if (validationResults.warnings.length > 0) {
          logger.info('[PRODUCT-SERVICE] Advertencias en validación de imágenes', {
            userId,
            warnings: validationResults.warnings.map(w => ({
              url: w.url.substring(0, 80),
              warnings: w.warnings
            }))
          });
        }

        // Usar solo imágenes válidas
        // ✅ CORREGIDO: validationResults.valid ya es un array de strings (URLs válidas)
        const validImageUrls = validationResults.valid;
        if (validImageUrls.length > 0) {
          // Actualizar imageUrl e imageUrls con solo las válidas
          const primaryUrl = validImageUrls[0];
          const additionalUrls = validImageUrls.slice(1);
          // ✅ CORREGIDO: Actualizar variables locales mutables para usarlas en buildImagePayload
          finalImageUrl = primaryUrl;
          finalImageUrls = additionalUrls;
          // También actualizar data para mantener consistencia
          data.imageUrl = primaryUrl;
          data.imageUrls = additionalUrls;
        }
      } catch (validationError: any) {
        // Si la validación falla por error técnico (no por imágenes inválidas), registrar y continuar
        if (validationError instanceof AppError) {
          throw validationError;
        }
        logger.warn('[PRODUCT-SERVICE] Error técnico en validación de imágenes, continuando sin validación', {
          userId,
          error: validationError.message
        });
      }
    }

    // ✅ CORREGIDO: Usar variables locales mutables que pueden haber sido actualizadas después de la validación
    const imagesPayload = buildImagePayload(finalImageUrl, finalImageUrls);
    
    // ✅ LOGGING: Verificar qué se está enviando a buildImagePayload
    logger.debug('[PRODUCT-SERVICE] Building image payload', {
      userId,
      finalImageUrl: finalImageUrl?.substring(0, 80) || 'none',
      finalImageUrls: finalImageUrls?.length || 0,
      finalImageUrlsPreview: finalImageUrls?.slice(0, 3).map(img => img?.substring(0, 60)) || [],
      imagesPayloadLength: imagesPayload.length,
      imagesPayloadPreview: imagesPayload.substring(0, 200)
    });
    const metadata = mergeProductMetadata(data) || {};
    if (!metadata.currency) {
      metadata.currency = currency || 'USD';
    }

    const metadataPayload = Object.keys(metadata).length ? JSON.stringify(metadata) : null;

    // ✅ P7: Validar que suggestedPrice sea mayor que aliexpressPrice
    if (rest.suggestedPrice <= rest.aliexpressPrice) {
      throw new AppError(
        `Suggested price (${rest.suggestedPrice}) must be greater than AliExpress price (${rest.aliexpressPrice}) to generate profit.`,
        400
      );
    }

    // ✅ P7: Validar que finalPrice (si se proporciona) sea mayor que aliexpressPrice
    if (finalPrice !== undefined && finalPrice <= rest.aliexpressPrice) {
      throw new AppError(
        `Final price (${finalPrice}) must be greater than AliExpress price (${rest.aliexpressPrice}) to generate profit.`,
        400
      );
    }

    // ✅ Logging antes de crear el producto
    logger.info('[PRODUCT-SERVICE] Creating product', {
      userId,
      title: rest.title?.substring(0, 50),
      aliexpressUrl: rest.aliexpressUrl?.substring(0, 80),
      aliexpressPrice: rest.aliexpressPrice,
      suggestedPrice: rest.suggestedPrice,
      hasImage: !!finalImageUrl || (finalImageUrls && finalImageUrls.length > 0),
      imageCount: (finalImageUrl ? 1 : 0) + (finalImageUrls?.length || 0), // ✅ MEJORADO: Incluir conteo de imágenes
      hasProductData: !!productData && Object.keys(productData).length > 0,
      status: 'PENDING'
    });

    // ✅ RESILIENCIA: Intentar crear producto con currency, si falla (migración no ejecutada), intentar sin currency
    let product;
    try {
      product = await prisma.product.create({
        data: {
          userId,
          aliexpressUrl: rest.aliexpressUrl,
          title: rest.title,
          description: rest.description || null,
          aliexpressPrice: rest.aliexpressPrice,
          suggestedPrice: rest.suggestedPrice,
          // ✅ CORREGIDO: Asegurar que finalPrice siempre tenga un valor válido
          // Si no se proporciona finalPrice, usar suggestedPrice o aliexpressPrice * 1.45 como fallback
          finalPrice: finalPrice ?? rest.suggestedPrice ?? (rest.aliexpressPrice ? Math.round(rest.aliexpressPrice * 1.45 * 100) / 100 : 0),
          currency: currency || 'USD', // ✅ Guardar moneda original del precio de AliExpress
          category: rest.category || null,
          images: imagesPayload,
          productData: metadataPayload,
          // ✅ MEJORADO: Guardar costos adicionales
          shippingCost: shippingCost !== undefined ? shippingCost : null,
          importTax: importTax !== undefined ? importTax : null,
          totalCost: totalCost !== undefined ? totalCost : null,
          targetCountry: targetCountry || null,
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
    } catch (error: any) {
      // ✅ Si falla por campo currency (migración no ejecutada), intentar sin currency
      if (error?.code === 'P2009' || error?.message?.includes('currency') || error?.message?.includes('Unknown column')) {
        logger.warn('[PRODUCT-SERVICE] Currency field not found in database, creating product without currency field (migration may not be executed)', {
          error: error?.message?.substring(0, 200),
          userId
        });
        // Intentar sin el campo currency
        product = await prisma.product.create({
          data: {
            userId,
            aliexpressUrl: rest.aliexpressUrl,
            title: rest.title,
            description: rest.description || null,
            aliexpressPrice: rest.aliexpressPrice,
            suggestedPrice: rest.suggestedPrice,
            finalPrice: finalPrice ?? rest.suggestedPrice ?? (rest.aliexpressPrice ? Math.round(rest.aliexpressPrice * 1.45 * 100) / 100 : 0),
            // currency: omitido temporalmente hasta que se ejecute la migración
            category: rest.category || null,
            images: imagesPayload,
            productData: metadataPayload,
            // ✅ MEJORADO: Guardar costos adicionales (si la migración está ejecutada)
            shippingCost: shippingCost !== undefined ? shippingCost : null,
            importTax: importTax !== undefined ? importTax : null,
            totalCost: totalCost !== undefined ? totalCost : null,
            targetCountry: targetCountry || null,
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
      } else {
        // Re-lanzar el error si no es por currency
        throw error;
      }
    }

    // ✅ Logging después de crear el producto
    // ✅ MEJORADO: Parsear imágenes guardadas para verificar que se guardaron múltiples
    let savedImagesCount = 0;
    try {
      if (product.images) {
        const parsedImages = JSON.parse(product.images);
        if (Array.isArray(parsedImages)) {
          savedImagesCount = parsedImages.length;
        }
      }
    } catch {
      // Ignorar errores de parsing
    }

    logger.info('[PRODUCT-SERVICE] Product created successfully', {
      productId: product.id,
      userId,
      title: product.title?.substring(0, 50),
      status: product.status,
      aliexpressPrice: product.aliexpressPrice,
      suggestedPrice: product.suggestedPrice,
      imagesCount: savedImagesCount, // ✅ MEJORADO: Incluir conteo de imágenes guardadas
      imagesSaved: savedImagesCount > 1 ? 'multiple' : savedImagesCount === 1 ? 'single' : 'none'
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
        marketplaceListings: {
          select: {
            id: true,
            marketplace: true,
            listingId: true,
            listingUrl: true,
            publishedAt: true,
          },
          orderBy: {
            publishedAt: 'desc',
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
      importTax,
      totalCost,
      targetCountry,
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
    // ✅ CORREGIDO: Sincronizar finalPrice cuando se actualiza suggestedPrice
    // Si se actualiza suggestedPrice pero no finalPrice, sincronizar finalPrice
    if (typeof rest.finalPrice === 'number') {
      updateData.finalPrice = rest.finalPrice;
    } else if (typeof rest.suggestedPrice === 'number') {
      // Sincronizar finalPrice con suggestedPrice si no se proporciona explícitamente
      updateData.finalPrice = rest.suggestedPrice;
    } else if (typeof updateData.suggestedPrice === 'number') {
      // Si solo se actualizó suggestedPrice en este mismo update, sincronizar
      updateData.finalPrice = updateData.suggestedPrice;
    }
    if (typeof rest.category === 'string') updateData.category = rest.category;
    
    // ✅ MEJORADO: Actualizar costos adicionales si se proporcionan
    if (typeof shippingCost === 'number') updateData.shippingCost = shippingCost;
    if (typeof importTax === 'number') updateData.importTax = importTax;
    if (typeof totalCost === 'number') updateData.totalCost = totalCost;
    if (typeof targetCountry === 'string') updateData.targetCountry = targetCountry;

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

  /**
   * ✅ P3: Función helper para actualizar estado y isPublished de forma sincronizada
   * Asegura que: status === 'PUBLISHED' → isPublished === true
   * Detecta y corrige inconsistencias automáticamente
   */
  async updateProductStatusSafely(
    id: number,
    status: ProductStatus,
    isPublished?: boolean,
    adminId?: number
  ) {
    // ✅ Obtener producto actual para verificar estado actual y detectar inconsistencias
    const currentProduct = await prisma.product.findUnique({
      where: { id },
      select: { 
        status: true,
        isPublished: true,
        publishedAt: true, 
        title: true, 
        userId: true 
      }
    });

    if (!currentProduct) {
      throw new AppError('Product not found', 404);
    }

    // ✅ P3: Detectar y corregir inconsistencias existentes antes de actualizar
    const hasInconsistency = 
      (currentProduct.status === 'PUBLISHED' && !currentProduct.isPublished) ||
      (currentProduct.status !== 'PUBLISHED' && currentProduct.isPublished);
    
    if (hasInconsistency) {
      logger.warn('Product status inconsistency detected and will be corrected', {
        productId: id,
        currentStatus: currentProduct.status,
        currentIsPublished: currentProduct.isPublished,
        newStatus: status,
        userId: currentProduct.userId
      });
    }

    // ✅ Validar consistencia: si status es PUBLISHED, isPublished debe ser true
    const shouldBePublished = status === 'PUBLISHED';
    const finalIsPublished = isPublished !== undefined ? isPublished : shouldBePublished;

    // ✅ P3: Corrección mejorada de isPublished basada en status
    // Si status es PUBLISHED, isPublished DEBE ser true
    // Si status no es PUBLISHED pero es APPROVED y había listings, mantener isPublished si corresponde
    // Si status es REJECTED o INACTIVE, isPublished DEBE ser false
    let correctedIsPublished: boolean;
    if (status === 'PUBLISHED') {
      correctedIsPublished = true; // Siempre true para PUBLISHED
    } else if (status === 'REJECTED' || status === 'INACTIVE') {
      correctedIsPublished = false; // Siempre false para REJECTED/INACTIVE
    } else if (status === 'APPROVED') {
      // Para APPROVED, usar el valor proporcionado o mantener el actual si tenía listings
      // Pero mejor usar el valor proporcionado explícitamente
      correctedIsPublished = finalIsPublished;
    } else {
      // Para PENDING u otros estados, false por defecto
      correctedIsPublished = false;
    }

    // ✅ Preparar datos de actualización
    const updateData: any = {
      status,
      isPublished: correctedIsPublished,
    };

    // ✅ CORREGIDO: Actualizar publishedAt solo si cambia el estado a PUBLISHED o desde PUBLISHED
    // Asegurar que publishedAt se limpia cuando status !== 'PUBLISHED'
    if (status === 'PUBLISHED' && !currentProduct.publishedAt) {
      updateData.publishedAt = new Date();
    } else if (status !== 'PUBLISHED') {
      // ✅ Limpiar publishedAt si el estado no es PUBLISHED
      updateData.publishedAt = null;
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

    // Registrar actividad si hay adminId
    if (adminId) {
      const metadataString = JSON.stringify({ productId: id, newStatus: status, isPublished: correctedIsPublished });

      await prisma.activity.create({
        data: {
          userId: adminId,
          action: 'PRODUCT_STATUS_CHANGED',
          description: `Estado del producto "${updated.title}" cambiado a ${status}`,
          metadata: metadataString,
        },
      }).catch(() => {});

      await prisma.activity.create({
        data: {
          userId: updated.userId,
          action: 'PRODUCT_STATUS_CHANGED',
          description: `Tu producto "${updated.title}" ahora está ${status}`,
          metadata: metadataString,
        },
      }).catch(() => {});
    }

    return updated;
  }

  /**
   * ✅ P3: Detectar productos con inconsistencias entre status e isPublished
   * @returns Array de productos inconsistentes
   */
  async detectInconsistencies(): Promise<Array<{ id: number; userId: number; status: string; isPublished: boolean; title: string }>> {
    const inconsistentProducts = await prisma.product.findMany({
      where: {
        OR: [
          { status: 'PUBLISHED', isPublished: false }, // PUBLISHED pero isPublished = false
          { status: { notIn: ['PUBLISHED', 'APPROVED'] }, isPublished: true }, // No PUBLISHED/APPROVED pero isPublished = true (excepto APPROVED que puede tener listings)
        ]
      },
      select: {
        id: true,
        userId: true,
        status: true,
        isPublished: true,
        title: true
      }
    });

    // También detectar APPROVED con isPublished = true pero sin listings activos
    const approvedWithIsPublished = await prisma.product.findMany({
      where: {
        status: 'APPROVED',
        isPublished: true
      },
      include: {
        marketplaceListings: {
          where: {
            // Listings activos
          }
        }
      }
    });

    const approvedWithoutListings = approvedWithIsPublished
      .filter(p => p.marketplaceListings.length === 0)
      .map(p => ({
        id: p.id,
        userId: p.userId,
        status: p.status,
        isPublished: p.isPublished,
        title: p.title
      }));

    return [...inconsistentProducts, ...approvedWithoutListings];
  }

  /**
   * ✅ P3: Corregir inconsistencias detectadas en productos
   * @returns Número de productos corregidos
   */
  async fixInconsistencies(): Promise<{ fixed: number; errors: number }> {
    const inconsistencies = await this.detectInconsistencies();
    let fixed = 0;
    let errors = 0;

    for (const product of inconsistencies) {
      try {
        // Determinar el estado correcto basado en isPublished y listings
        let correctStatus: ProductStatus = product.status as ProductStatus;
        let correctIsPublished = product.isPublished;

        if (product.status === 'PUBLISHED' && !product.isPublished) {
          // Si está marcado como PUBLISHED pero isPublished = false, verificar si realmente tiene listings
          const productWithListings = await prisma.product.findUnique({
            where: { id: product.id },
            include: { marketplaceListings: true }
          });
          
          if (productWithListings && productWithListings.marketplaceListings.length > 0) {
            // Tiene listings, corregir isPublished a true
            correctIsPublished = true;
          } else {
            // No tiene listings, cambiar status a APPROVED
            correctStatus = 'APPROVED';
            correctIsPublished = false;
          }
        } else if (product.status !== 'PUBLISHED' && product.isPublished) {
          // Si isPublished = true pero status no es PUBLISHED
          if (product.status === 'APPROVED') {
            // Verificar si tiene listings
            const productWithListings = await prisma.product.findUnique({
              where: { id: product.id },
              include: { marketplaceListings: true }
            });
            
            if (!productWithListings || productWithListings.marketplaceListings.length === 0) {
              // No tiene listings, corregir isPublished a false
              correctIsPublished = false;
            }
          } else {
            // Para otros estados (PENDING, REJECTED, INACTIVE), isPublished debe ser false
            correctIsPublished = false;
          }
        }

        // Aplicar corrección usando updateProductStatusSafely
        if (correctStatus !== product.status || correctIsPublished !== product.isPublished) {
          await this.updateProductStatusSafely(
            product.id,
            correctStatus,
            correctIsPublished,
            undefined // Sin adminId para correcciones automáticas
          );
          fixed++;
          logger.info('Product inconsistency fixed', {
            productId: product.id,
            oldStatus: product.status,
            oldIsPublished: product.isPublished,
            newStatus: correctStatus,
            newIsPublished: correctIsPublished
          });
        }
      } catch (error: any) {
        errors++;
        logger.error('Error fixing product inconsistency', {
          productId: product.id,
          error: error.message
        });
      }
    }

    return { fixed, errors };
  }

  async updateProductStatus(id: number, status: ProductStatus, adminId: number) {
    // ✅ C2: Admin puede ver todos los productos
    const product = await this.getProductById(id, adminId, true);

    // ✅ CORREGIDO: Si se rechaza el producto, limpiar listings existentes
    if (status === 'REJECTED') {
      try {
        // Eliminar listings del marketplace si existen
        await prisma.marketplaceListing.deleteMany({
          where: { productId: id }
        });
        logger.info('[PRODUCT-SERVICE] Cleaned up marketplace listings for rejected product', {
          productId: id,
          adminId
        });
      } catch (error) {
        // No fallar si no se pueden eliminar listings, solo loguear
        logger.warn('[PRODUCT-SERVICE] Failed to cleanup marketplace listings', {
          productId: id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // ✅ Usar updateProductStatusSafely para sincronizar estado e isPublished
    const updated = await this.updateProductStatusSafely(
      id,
      status,
      status === 'PUBLISHED' ? true : false, // isPublished solo si es PUBLISHED
      adminId
    );

    // ✅ Preparar metadata como string JSON explícitamente
    const metadataString = JSON.stringify({ productId: id, newStatus: status });

    // Registrar actividad del admin
    await prisma.activity.create({
      data: {
        userId: adminId,
        action: 'PRODUCT_STATUS_CHANGED',
        description: `Estado del producto "${product.title}" cambiado a ${status}`,
        metadata: metadataString, // ✅ Asegurar que es string, no objeto
      },
    }).catch(err => {
      // No fallar si no se puede crear la actividad
      logger.warn('[PRODUCT-SERVICE] Failed to create admin activity', { error: err instanceof Error ? err.message : String(err) });
    });

    // Registrar actividad del usuario dueño
    await prisma.activity.create({
      data: {
        userId: product.userId,
        action: 'PRODUCT_STATUS_CHANGED',
        description: `Tu producto "${product.title}" ahora está ${status}`,
        metadata: metadataString, // ✅ Asegurar que es string, no objeto
      },
    }).catch(err => {
      // No fallar si no se puede crear la actividad
      logger.warn('[PRODUCT-SERVICE] Failed to create user activity', { error: err instanceof Error ? err.message : String(err) });
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
