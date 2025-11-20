import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { jobService, ScrapingJobData, PublishingJobData, PayoutJobData, publishingQueue } from '../../services/job.service';
import { z } from 'zod';

const router = Router();

// Apply auth middleware to all routes
router.use(authenticate);

// Validation schemas
const scrapingJobSchema = z.object({
  aliexpressUrl: z.string().url(),
  customData: z.object({
    margin: z.number().optional(),
    category: z.string().optional(),
    title: z.string().optional(),
    quantity: z.number().optional(),
  }).optional(),
});

const publishingJobSchema = z.object({
  productId: z.number(),
  marketplaces: z.array(z.enum(['ebay', 'mercadolibre', 'amazon'])),
  customData: z.any().optional(),
});

const payoutJobSchema = z.object({
  userId: z.number().optional(),
  commissionIds: z.array(z.number()).optional(),
});

/**
 * POST /api/jobs/scraping
 * Add scraping job to queue
 */
router.post('/scraping', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = scrapingJobSchema.parse(req.body);
    
    const jobData: ScrapingJobData = {
      userId: req.user!.userId,
      aliexpressUrl: data.aliexpressUrl,
      customData: data.customData,
    };

    const job = await jobService.addScrapingJob(jobData);

    res.status(201).json({
      success: true,
      message: 'Scraping job added to queue',
      data: {
        jobId: job.id,
        status: 'queued',
      },
    });
  } catch (error: any) {
    next(error);
  }
});

/**
 * POST /api/jobs/publishing
 * Add publishing job to queue
 */
router.post('/publishing', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = publishingJobSchema.parse(req.body);
    
    const jobData: PublishingJobData = {
      userId: req.user!.userId,
      productId: data.productId,
      marketplaces: data.marketplaces,
      customData: data.customData,
    };

    const job = await jobService.addPublishingJob(jobData);

    res.status(201).json({
      success: true,
      message: 'Publishing job added to queue',
      data: {
        jobId: job.id,
        status: 'queued',
        marketplaces: data.marketplaces,
      },
    });
  } catch (error: any) {
    next(error);
  }
});

/**
 * POST /api/jobs/payout
 * Add payout job to queue (admin only)
 */
router.post('/payout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check if user is admin
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required',
      });
    }

    const data = payoutJobSchema.parse(req.body);
    
    const jobData: PayoutJobData = {
      userId: data.userId,
      commissionIds: data.commissionIds,
    };

    const job = await jobService.addPayoutJob(jobData);

    res.status(201).json({
      success: true,
      message: 'Payout job added to queue',
      data: {
        jobId: job.id,
        status: 'queued',
      },
    });
  } catch (error: any) {
    next(error);
  }
});

/**
 * POST /api/jobs/sync-inventory
 * Add inventory sync job to queue
 */
router.post('/sync-inventory', async (req: Request, res: Response) => {
  try {
    const { productId, quantity } = req.body;

    if (!productId || quantity === undefined) {
      return res.status(400).json({
        success: false,
        message: 'productId and quantity are required',
      });
    }

    const job = await jobService.addSyncJob({
      userId: req.user!.userId,
      productId,
      type: 'inventory',
      data: { quantity },
    });

    res.status(201).json({
      success: true,
      message: 'Inventory sync job added to queue',
      data: {
        jobId: job.id,
        status: 'queued',
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to add sync job',
      error: error.message,
    });
  }
});

/**
 * GET /api/jobs/stats
 * Get queue statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    // Only admin can see all stats
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required',
      });
    }

    const stats = await jobService.getQueueStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to get job stats',
      error: error.message,
    });
  }
});

/**
 * POST /api/jobs/schedule-payout
 * Schedule recurring payout job (admin only)
 */
router.post('/schedule-payout', async (req: Request, res: Response) => {
  try {
    // Check if user is admin
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required',
      });
    }

    const { cronPattern } = req.body;

    const job = await jobService.schedulePayoutJob(cronPattern);

    res.status(201).json({
      success: true,
      message: 'Recurring payout job scheduled',
      data: {
        jobId: job.id,
        pattern: cronPattern || '0 0 * * FRI',
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to schedule payout job',
      error: error.message,
    });
  }
});

/**
 * GET /api/jobs/publishing/recent
 * List recent publishing jobs with status/progress
 */
router.get('/publishing/recent', async (req: Request, res: Response) => {
  try {
    const jobs = await publishingQueue.getJobs(['waiting','active','completed','failed','delayed','paused'], 0, 50, true);
    const userId = req.user!.userId;
    const items = jobs
      .filter((j: any) => j?.data?.userId === userId)
      .map((j: any) => ({
        id: j.id,
        name: j.name,
        state: j.finishedOn ? 'completed' : (j.failedReason ? 'failed' : (j.processedOn ? 'active' : 'waiting')),
        progress: j.progress,
        timestamp: j.timestamp,
        processedOn: j.processedOn,
        finishedOn: j.finishedOn,
        data: j.data,
        failedReason: j.failedReason,
      }));
    res.json({ success: true, items, count: items.length });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to list publishing jobs', error: error.message });
  }
});

/**
 * GET /api/jobs/publishing/:id
 * Get publishing job detail
 */
router.get('/publishing/:id', async (req: Request, res: Response) => {
  try {
    const job = await publishingQueue.getJob(req.params.id);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
    if (job.data?.userId !== req.user!.userId && req.user!.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const state = await job.getState();
    res.json({ success: true, job: {
      id: job.id,
      name: job.name,
      progress: job.progress,
      state,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      data: job.data,
      failedReason: job.failedReason,
      returnvalue: job.returnvalue,
    }});
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to get job', error: error.message });
  }
});

export default router;
