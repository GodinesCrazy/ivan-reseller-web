import { z } from 'zod';

/**
 * Schema de validación para Opportunity
 * BAJA PRIORIDAD: Validación con Zod para interfaces críticas
 */
export const OpportunitySchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, 'Title is required').max(500, 'Title too long'),
  url: z.string().url('Invalid URL format'),
  price: z.number().positive('Price must be positive'),
  estimatedCost: z.number().positive('Estimated cost must be positive'),
  estimatedProfit: z.number().min(0, 'Estimated profit cannot be negative'),
  roi: z.number().min(0, 'ROI cannot be negative').max(10000, 'ROI too high'),
  category: z.string().optional(),
  images: z.array(z.string().url()).optional(),
  description: z.string().optional(),
  rating: z.number().min(0).max(5).optional(),
  orders: z.number().int().min(0).optional(),
  shipping: z.any().optional(),
  specifications: z.record(z.any()).optional(),
  confidence: z.number().min(0).max(100).optional(),
});

export type OpportunityInput = z.infer<typeof OpportunitySchema>;

