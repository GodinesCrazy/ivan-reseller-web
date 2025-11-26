import axios from 'axios';
import { logger } from '../config/logger';
import { AppError } from '../middleware/error.middleware';

/**
 * Image Validation Service
 * Valida calidad de imágenes antes de publicar productos:
 * - Resolución mínima
 * - Formato válido
 * - Tamaño máximo
 * - URL accesible
 */

export interface ImageValidationConfig {
  minWidth?: number; // Ancho mínimo en píxeles (default: 500)
  minHeight?: number; // Alto mínimo en píxeles (default: 500)
  maxWidth?: number; // Ancho máximo en píxeles (default: 5000)
  maxHeight?: number; // Alto máximo en píxeles (default: 5000)
  maxFileSize?: number; // Tamaño máximo en bytes (default: 10MB)
  allowedFormats?: string[]; // Formatos permitidos (default: ['jpeg', 'jpg', 'png', 'webp'])
  requireAspectRatio?: boolean; // Requerir ratio de aspecto razonable (default: false)
  minAspectRatio?: number; // Ratio mínimo (ancho/alto) (default: 0.5)
  maxAspectRatio?: number; // Ratio máximo (ancho/alto) (default: 2.0)
}

export interface ImageValidationResult {
  valid: boolean;
  url: string;
  width?: number;
  height?: number;
  format?: string;
  fileSize?: number;
  aspectRatio?: number;
  errors: string[];
  warnings: string[];
}

export class ImageValidationService {
  private config: Required<ImageValidationConfig>;

  constructor(config?: ImageValidationConfig) {
    this.config = {
      minWidth: config?.minWidth ?? 500,
      minHeight: config?.minHeight ?? 500,
      maxWidth: config?.maxWidth ?? 5000,
      maxHeight: config?.maxHeight ?? 5000,
      maxFileSize: config?.maxFileSize ?? 10 * 1024 * 1024, // 10MB
      allowedFormats: config?.allowedFormats ?? ['jpeg', 'jpg', 'png', 'webp'],
      requireAspectRatio: config?.requireAspectRatio ?? false,
      minAspectRatio: config?.minAspectRatio ?? 0.5,
      maxAspectRatio: config?.maxAspectRatio ?? 2.0
    };
  }

  /**
   * Validar una imagen por URL
   */
  async validateImage(imageUrl: string): Promise<ImageValidationResult> {
    const result: ImageValidationResult = {
      valid: true,
      url: imageUrl,
      errors: [],
      warnings: []
    };

    try {
      // 1. Validar formato de URL
      if (!this.isValidUrl(imageUrl)) {
        result.valid = false;
        result.errors.push('URL de imagen inválida');
        return result;
      }

      // 2. Obtener información de la imagen
      const imageInfo = await this.getImageInfo(imageUrl);
      
      if (!imageInfo) {
        result.valid = false;
        result.errors.push('No se pudo acceder a la imagen o formato no soportado');
        return result;
      }

      result.width = imageInfo.width;
      result.height = imageInfo.height;
      result.format = imageInfo.format;
      result.fileSize = imageInfo.fileSize;
      result.aspectRatio = imageInfo.width / imageInfo.height;

      // 3. Validar formato
      if (!this.config.allowedFormats.includes(imageInfo.format.toLowerCase())) {
        result.valid = false;
        result.errors.push(
          `Formato no permitido: ${imageInfo.format}. Formatos permitidos: ${this.config.allowedFormats.join(', ')}`
        );
      }

      // 4. Validar resolución mínima
      if (imageInfo.width < this.config.minWidth) {
        result.valid = false;
        result.errors.push(
          `Ancho insuficiente: ${imageInfo.width}px (mínimo: ${this.config.minWidth}px)`
        );
      }

      if (imageInfo.height < this.config.minHeight) {
        result.valid = false;
        result.errors.push(
          `Alto insuficiente: ${imageInfo.height}px (mínimo: ${this.config.minHeight}px)`
        );
      }

      // 5. Validar resolución máxima (advertencia si es muy grande)
      if (imageInfo.width > this.config.maxWidth || imageInfo.height > this.config.maxHeight) {
        result.warnings.push(
          `Resolución muy alta: ${imageInfo.width}x${imageInfo.height}px (recomendado: max ${this.config.maxWidth}x${this.config.maxHeight}px)`
        );
      }

      // 6. Validar tamaño de archivo
      if (imageInfo.fileSize > this.config.maxFileSize) {
        result.warnings.push(
          `Tamaño de archivo grande: ${(imageInfo.fileSize / 1024 / 1024).toFixed(2)}MB (máximo recomendado: ${(this.config.maxFileSize / 1024 / 1024).toFixed(2)}MB)`
        );
      }

      // 7. Validar ratio de aspecto (si está habilitado)
      if (this.config.requireAspectRatio) {
        const aspectRatio = imageInfo.width / imageInfo.height;
        if (aspectRatio < this.config.minAspectRatio || aspectRatio > this.config.maxAspectRatio) {
          result.warnings.push(
            `Ratio de aspecto inusual: ${aspectRatio.toFixed(2)} (recomendado: entre ${this.config.minAspectRatio} y ${this.config.maxAspectRatio})`
          );
        }
      }

      // Advertencia si la resolución es exactamente la mínima
      if (imageInfo.width === this.config.minWidth || imageInfo.height === this.config.minHeight) {
        result.warnings.push('Resolución mínima detectada. Se recomienda usar imágenes de mayor calidad.');
      }

    } catch (error: any) {
      logger.error('Error validando imagen', {
        url: imageUrl,
        error: error.message
      });
      
      result.valid = false;
      result.errors.push(`Error validando imagen: ${error.message}`);
    }

    return result;
  }

  /**
   * Validar múltiples imágenes
   */
  async validateImages(imageUrls: string[]): Promise<ImageValidationResult[]> {
    const results = await Promise.all(
      imageUrls.map(url => this.validateImage(url))
    );
    return results;
  }

  /**
   * Validar y filtrar imágenes válidas
   */
  async validateAndFilterImages(imageUrls: string[]): Promise<{
    valid: string[];
    invalid: Array<{ url: string; errors: string[] }>;
    warnings: Array<{ url: string; warnings: string[] }>;
  }> {
    const results = await this.validateImages(imageUrls);
    
    const valid: string[] = [];
    const invalid: Array<{ url: string; errors: string[] }> = [];
    const warnings: Array<{ url: string; warnings: string[] }> = [];

    for (const result of results) {
      if (result.valid) {
        valid.push(result.url);
        if (result.warnings.length > 0) {
          warnings.push({
            url: result.url,
            warnings: result.warnings
          });
        }
      } else {
        invalid.push({
          url: result.url,
          errors: result.errors
        });
      }
    }

    return { valid, invalid, warnings };
  }

  /**
   * Obtener información básica de una imagen
   */
  private async getImageInfo(imageUrl: string): Promise<{
    width: number;
    height: number;
    format: string;
    fileSize: number;
  } | null> {
    try {
      // Hacer HEAD request primero para obtener headers
      const headResponse = await axios.head(imageUrl, {
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: (status) => status < 400
      });

      const contentType = headResponse.headers['content-type'] || '';
      const contentLength = parseInt(headResponse.headers['content-length'] || '0', 10);

      // Detectar formato desde content-type o extensión
      let format = 'unknown';
      if (contentType.includes('jpeg') || contentType.includes('jpg')) {
        format = 'jpg';
      } else if (contentType.includes('png')) {
        format = 'png';
      } else if (contentType.includes('webp')) {
        format = 'webp';
      } else if (contentType.includes('gif')) {
        format = 'gif';
      } else {
        // Intentar desde extensión de URL
        const match = imageUrl.match(/\.(jpg|jpeg|png|webp|gif)/i);
        if (match) {
          format = match[1].toLowerCase();
        }
      }

      // Obtener dimensiones haciendo GET parcial (primeros bytes)
      // Para imágenes JPEG/PNG/WebP, podemos leer los headers
      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 15000,
        maxRedirects: 5,
        headers: {
          'Range': 'bytes=0-8192' // Primeros 8KB deberían contener headers de imagen
        },
        validateStatus: (status) => status === 200 || status === 206
      });

      const buffer = Buffer.from(imageResponse.data);
      const dimensions = this.parseImageDimensions(buffer, format);

      if (!dimensions) {
        // Si no pudimos parsear, intentar sin Range header (imagen completa pequeña)
        const fullResponse = await axios.get(imageUrl, {
          responseType: 'arraybuffer',
          timeout: 15000,
          maxRedirects: 5,
          maxContentLength: 5 * 1024 * 1024 // Max 5MB para obtener dimensiones
        });
        const fullBuffer = Buffer.from(fullResponse.data);
        const fullDimensions = this.parseImageDimensions(fullBuffer, format);
        
        if (!fullDimensions) {
          // Fallback: asumir dimensiones mínimas válidas si no podemos determinar
          return {
            width: this.config.minWidth,
            height: this.config.minHeight,
            format,
            fileSize: fullResponse.data.byteLength || contentLength
          };
        }

        return {
          ...fullDimensions,
          format,
          fileSize: fullResponse.data.byteLength || contentLength
        };
      }

      return {
        ...dimensions,
        format,
        fileSize: contentLength || buffer.length
      };

    } catch (error: any) {
      logger.warn('Error obteniendo información de imagen', {
        url: imageUrl,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Parsear dimensiones de imagen desde buffer
   */
  private parseImageDimensions(buffer: Buffer, format: string): { width: number; height: number } | null {
    try {
      if (format === 'jpg' || format === 'jpeg') {
        return this.parseJPEGDimensions(buffer);
      } else if (format === 'png') {
        return this.parsePNGDimensions(buffer);
      } else if (format === 'webp') {
        return this.parseWebPDimensions(buffer);
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Parsear dimensiones JPEG
   */
  private parseJPEGDimensions(buffer: Buffer): { width: number; height: number } | null {
    let offset = 0;
    while (offset < buffer.length) {
      if (buffer[offset] === 0xFF && buffer[offset + 1] === 0xC0) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        return { width, height };
      }
      offset++;
    }
    return null;
  }

  /**
   * Parsear dimensiones PNG
   */
  private parsePNGDimensions(buffer: Buffer): { width: number; height: number } | null {
    if (buffer.length < 24) return null;
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  }

  /**
   * Parsear dimensiones WebP
   */
  private parseWebPDimensions(buffer: Buffer): { width: number; height: number } | null {
    if (buffer.length < 30) return null;
    // WebP tiene estructura más compleja, intentar leer desde RIFF header
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
      // VP8/VP8L/VP8X header
      const chunkType = buffer.toString('ascii', 12, 16);
      if (chunkType === 'VP8 ') {
        // Simple VP8
        const width = buffer.readUInt16LE(26) & 0x3FFF;
        const height = buffer.readUInt16LE(28) & 0x3FFF;
        return { width, height };
      } else if (chunkType === 'VP8L') {
        // Lossless VP8
        const bits = buffer.readUInt32LE(21);
        const width = (bits & 0x3FFF) + 1;
        const height = ((bits >> 14) & 0x3FFF) + 1;
        return { width, height };
      }
    }
    return null;
  }

  /**
   * Validar formato de URL
   */
  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Validar rápidamente si una URL parece ser de imagen (sin hacer request)
   */
  static isImageUrl(url: string): boolean {
    const imageExtensions = /\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/i;
    return imageExtensions.test(url);
  }
}

// Singleton instance
let imageValidationServiceInstance: ImageValidationService | null = null;

export function getImageValidationService(): ImageValidationService {
  if (!imageValidationServiceInstance) {
    imageValidationServiceInstance = new ImageValidationService({
      minWidth: Number(process.env.MIN_IMAGE_WIDTH || '500'),
      minHeight: Number(process.env.MIN_IMAGE_HEIGHT || '500'),
      maxWidth: Number(process.env.MAX_IMAGE_WIDTH || '5000'),
      maxHeight: Number(process.env.MAX_IMAGE_HEIGHT || '5000'),
      maxFileSize: Number(process.env.MAX_IMAGE_SIZE || (10 * 1024 * 1024)),
      allowedFormats: process.env.ALLOWED_IMAGE_FORMATS?.split(',') || ['jpeg', 'jpg', 'png', 'webp'],
      requireAspectRatio: process.env.REQUIRE_IMAGE_ASPECT_RATIO === 'true',
      minAspectRatio: Number(process.env.MIN_IMAGE_ASPECT_RATIO || '0.5'),
      maxAspectRatio: Number(process.env.MAX_IMAGE_ASPECT_RATIO || '2.0')
    });
  }
  return imageValidationServiceInstance;
}

export default getImageValidationService();

