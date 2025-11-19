import { PrismaClient } from '@prisma/client';
import { logger } from '../config/logger';
import reportsService from './reports.service';
import { ReportFilters } from './reports.service';
import { Queue, Worker, Job } from 'bullmq';
import { getBullMQRedisConnection, isRedisAvailable } from '../config/redis';

const prisma = new PrismaClient();

export interface CreateScheduledReportDto {
  userId: number;
  reportType: 'sales' | 'products' | 'users' | 'marketplace-analytics' | 'executive';
  reportFormat: 'json' | 'excel' | 'pdf' | 'html';
  scheduleType: 'daily' | 'weekly' | 'monthly';
  scheduleValue: string; // "08:00", "monday", "1" (day of month)
  filters?: ReportFilters;
  recipients?: string[]; // Email addresses
}

interface ScheduledReportJobData {
  reportId: number;
  userId: number;
  reportType: string;
  reportFormat: string;
  scheduleType: string;
  scheduleValue: string;
  filters?: string; // JSON string
  recipients?: string; // JSON string
}

class ScheduledReportsService {
  private reportsQueue: Queue<ScheduledReportJobData> | null = null;
  private reportsWorker: Worker<ScheduledReportJobData> | null = null;
  private bullMQRedis: ReturnType<typeof getBullMQRedisConnection>;

  constructor() {
    this.bullMQRedis = getBullMQRedisConnection();
    
    if (isRedisAvailable && this.bullMQRedis) {
      this.initializeQueue();
      this.initializeWorker();
    } else {
      logger.warn('Scheduled Reports: Redis not available - scheduled reports disabled');
    }
  }

  /**
   * ✅ A5: Initialize BullMQ queue for scheduled reports
   */
  private initializeQueue(): void {
    if (!this.bullMQRedis) return;

    this.reportsQueue = new Queue<ScheduledReportJobData>('scheduled-reports', {
      connection: this.bullMQRedis as any,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 50,
        removeOnFail: 20,
      },
    });

    logger.info('Scheduled Reports: Queue initialized');
  }

  /**
   * ✅ A5: Initialize BullMQ worker for processing scheduled reports
   */
  private initializeWorker(): void {
    if (!isRedisAvailable || !this.bullMQRedis) return;

    this.reportsWorker = new Worker<ScheduledReportJobData>(
      'scheduled-reports',
      async (job: Job<ScheduledReportJobData>) => {
        logger.info('Scheduled Reports: Processing report job', { 
          jobId: job.id, 
          reportId: job.data.reportId,
          userId: job.data.userId 
        });
        
        return await this.executeScheduledReport(job.data.reportId, job.data.userId);
      },
      {
        connection: this.bullMQRedis as any,
        concurrency: 2, // Process 2 reports concurrently
      }
    );

    // Event listeners
    this.reportsWorker.on('completed', (job) => {
      logger.info('Scheduled Reports: Report job completed', { 
        jobId: job.id, 
        reportId: job.data.reportId 
      });
    });

    this.reportsWorker.on('failed', (job, err) => {
      logger.error('Scheduled Reports: Report job failed', {
        jobId: job?.id,
        reportId: job?.data.reportId,
        userId: job?.data.userId,
        error: err.message,
        stack: err.stack,
      });
    });

    logger.info('Scheduled Reports: Worker initialized');
  }

  /**
   * Create a scheduled report
   */
  async createScheduledReport(data: CreateScheduledReportDto): Promise<any> {
    try {
      // Calculate next run time
      const nextRunAt = this.calculateNextRunTime(data.scheduleType, data.scheduleValue);

      // Create scheduled report in database
      const scheduledReport = await prisma.scheduledReport.create({
        data: {
          userId: data.userId,
          reportType: data.reportType,
          reportFormat: data.reportFormat,
          scheduleType: data.scheduleType,
          scheduleValue: data.scheduleValue,
          filters: data.filters ? JSON.stringify(data.filters) : null,
          recipients: data.recipients ? JSON.stringify(data.recipients) : null,
          nextRunAt
        }
      });

      // ✅ A5: Schedule the report using BullMQ instead of node-cron
      await this.scheduleReport(scheduledReport.id, scheduledReport);

      return scheduledReport;
    } catch (error) {
      logger.error('Error creating scheduled report', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        userId: data.userId
      });
      throw new Error('Failed to create scheduled report');
    }
  }

  /**
   * Get scheduled reports for a user
   */
  async getScheduledReports(userId: number, isActive?: boolean): Promise<any[]> {
    try {
      const where: any = { userId };
      if (isActive !== undefined) {
        where.isActive = isActive;
      }

      const reports = await prisma.scheduledReport.findMany({
        where,
        orderBy: {
          createdAt: 'desc'
        }
      });

      return reports.map(report => ({
        ...report,
        filters: report.filters ? JSON.parse(report.filters) : null,
        recipients: report.recipients ? JSON.parse(report.recipients) : null
      }));
    } catch (error) {
      logger.error('Error getting scheduled reports', {
        error: error instanceof Error ? error.message : String(error),
        userId
      });
      throw new Error('Failed to get scheduled reports');
    }
  }

  /**
   * Update a scheduled report
   */
  async updateScheduledReport(id: number, userId: number, updates: Partial<CreateScheduledReportDto>): Promise<any> {
    try {
      // Verify ownership
      const existing = await prisma.scheduledReport.findFirst({
        where: { id, userId }
      });

      if (!existing) {
        throw new Error('Scheduled report not found');
      }

      // Calculate next run time if schedule changed
      let nextRunAt = existing.nextRunAt;
      if (updates.scheduleType || updates.scheduleValue) {
        const scheduleType = updates.scheduleType || existing.scheduleType;
        const scheduleValue = updates.scheduleValue || existing.scheduleValue;
        nextRunAt = this.calculateNextRunTime(scheduleType, scheduleValue);
      }

      // ✅ A5: Remove existing BullMQ repeat job
      await this.unscheduleReport(id);

      // Update in database
      const updated = await prisma.scheduledReport.update({
        where: { id },
        data: {
          ...(updates.reportType && { reportType: updates.reportType }),
          ...(updates.reportFormat && { reportFormat: updates.reportFormat }),
          ...(updates.scheduleType && { scheduleType: updates.scheduleType }),
          ...(updates.scheduleValue && { scheduleValue: updates.scheduleValue }),
          ...(updates.filters !== undefined && { filters: updates.filters ? JSON.stringify(updates.filters) : null }),
          ...(updates.recipients !== undefined && { recipients: updates.recipients ? JSON.stringify(updates.recipients) : null }),
          ...(updates.isActive !== undefined && { isActive: updates.isActive }),
          nextRunAt
        }
      });

      // ✅ A5: Schedule new BullMQ job if active
      if (updated.isActive) {
        await this.scheduleReport(id, updated);
      }

      return {
        ...updated,
        filters: updated.filters ? JSON.parse(updated.filters) : null,
        recipients: updated.recipients ? JSON.parse(updated.recipients) : null
      };
    } catch (error) {
      logger.error('Error updating scheduled report', {
        error: error instanceof Error ? error.message : String(error),
        id,
        userId
      });
      throw new Error('Failed to update scheduled report');
    }
  }

  /**
   * Delete a scheduled report
   */
  async deleteScheduledReport(id: number, userId: number): Promise<void> {
    try {
      // Verify ownership
      const existing = await prisma.scheduledReport.findFirst({
        where: { id, userId }
      });

      if (!existing) {
        throw new Error('Scheduled report not found');
      }

      // ✅ A5: Remove BullMQ repeat job
      await this.unscheduleReport(id);

      // Delete from database
      await prisma.scheduledReport.delete({
        where: { id }
      });
    } catch (error) {
      logger.error('Error deleting scheduled report', {
        error: error instanceof Error ? error.message : String(error),
        id,
        userId
      });
      throw new Error('Failed to delete scheduled report');
    }
  }

  /**
   * Calculate next run time based on schedule type and value
   */
  private calculateNextRunTime(scheduleType: string, scheduleValue: string): Date {
    const now = new Date();
    const nextRun = new Date(now);

    switch (scheduleType) {
      case 'daily': {
        // scheduleValue format: "HH:mm" (e.g., "08:00")
        const [hours, minutes] = scheduleValue.split(':').map(Number);
        nextRun.setHours(hours || 0, minutes || 0, 0, 0);
        
        // If time has passed today, schedule for tomorrow
        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 1);
        }
        break;
      }

      case 'weekly': {
        // scheduleValue format: day name (e.g., "monday", "tuesday")
        const dayMap: { [key: string]: number } = {
          'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
          'thursday': 4, 'friday': 5, 'saturday': 6
        };
        const targetDay = dayMap[scheduleValue.toLowerCase()] ?? 1;
        const currentDay = now.getDay();
        const daysUntilTarget = (targetDay - currentDay + 7) % 7 || 7;
        
        nextRun.setDate(now.getDate() + daysUntilTarget);
        nextRun.setHours(8, 0, 0, 0); // Default to 8:00 AM
        break;
      }

      case 'monthly': {
        // scheduleValue format: day of month (e.g., "1", "15")
        const dayOfMonth = parseInt(scheduleValue) || 1;
        nextRun.setDate(dayOfMonth);
        nextRun.setHours(8, 0, 0, 0); // Default to 8:00 AM
        
        // If day has passed this month, schedule for next month
        if (nextRun <= now) {
          nextRun.setMonth(nextRun.getMonth() + 1);
        }
        break;
      }

      default:
        // Default to daily at 8:00 AM
        nextRun.setDate(now.getDate() + 1);
        nextRun.setHours(8, 0, 0, 0);
    }

    return nextRun;
  }

  /**
   * ✅ A5: Schedule a BullMQ repeat job for a report
   */
  private async scheduleReport(id: number, scheduledReport: any): Promise<void> {
    if (!scheduledReport.isActive || !this.reportsQueue) {
      return;
    }

    let cronPattern = '';

    switch (scheduledReport.scheduleType) {
      case 'daily': {
        // scheduleValue format: "HH:mm"
        const [hours, minutes] = scheduledReport.scheduleValue.split(':').map(Number);
        cronPattern = `${minutes || 0} ${hours || 0} * * *`; // Every day at HH:mm
        break;
      }

      case 'weekly': {
        // scheduleValue format: day name
        const dayMap: { [key: string]: number } = {
          'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
          'thursday': 4, 'friday': 5, 'saturday': 6
        };
        const day = dayMap[scheduledReport.scheduleValue.toLowerCase()] ?? 1;
        cronPattern = `0 8 * * ${day}`; // Every week on day at 8:00 AM
        break;
      }

      case 'monthly': {
        // scheduleValue format: day of month
        const dayOfMonth = parseInt(scheduledReport.scheduleValue) || 1;
        cronPattern = `0 8 ${dayOfMonth} * *`; // Every month on day at 8:00 AM
        break;
      }

      default:
        logger.warn('Scheduled Reports: Invalid schedule type', { id, scheduleType: scheduledReport.scheduleType });
        return; // Invalid schedule type
    }

    // ✅ A5: Create BullMQ repeat job with userId in job data (multi-tenant)
    const jobData: ScheduledReportJobData = {
      reportId: id,
      userId: scheduledReport.userId, // ✅ Multi-tenant: userId en job data
      reportType: scheduledReport.reportType,
      reportFormat: scheduledReport.reportFormat,
      scheduleType: scheduledReport.scheduleType,
      scheduleValue: scheduledReport.scheduleValue,
      filters: scheduledReport.filters || null,
      recipients: scheduledReport.recipients || null,
    };

    try {
      // Remove any existing repeat job for this report
      await this.unscheduleReport(id);

      // Add new repeat job
      await this.reportsQueue.add(
        `report-${id}`,
        jobData,
        {
          repeat: {
            pattern: cronPattern,
            tz: 'America/Argentina/Buenos_Aires', // Or configurable timezone
          },
          jobId: `scheduled-report-${id}`, // Unique job ID for this report
          removeOnComplete: 10,
          removeOnFail: 5,
        }
      );

      logger.info('Scheduled Reports: Report job scheduled', { id, cronPattern, userId: scheduledReport.userId });
    } catch (error) {
      logger.error('Scheduled Reports: Error scheduling report job', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        id,
        userId: scheduledReport.userId,
      });
      throw error;
    }
  }

  /**
   * ✅ A5: Unschedule a report (remove repeat job)
   */
  private async unscheduleReport(id: number): Promise<void> {
    if (!this.reportsQueue) return;

    try {
      const repeatableJobs = await this.reportsQueue.getRepeatableJobs();
      const jobToRemove = repeatableJobs.find(job => job.id === `scheduled-report-${id}`);

      if (jobToRemove) {
        await this.reportsQueue.removeRepeatableByKey(jobToRemove.key);
        logger.info('Scheduled Reports: Report job unscheduled', { id });
      }
    } catch (error) {
      logger.error('Scheduled Reports: Error unscheduling report job', {
        error: error instanceof Error ? error.message : String(error),
        id,
      });
    }
  }

  /**
   * ✅ A5: Execute a scheduled report (called by BullMQ worker)
   */
  private async executeScheduledReport(id: number, userId?: number): Promise<void> {
    try {
      const scheduledReport = await prisma.scheduledReport.findUnique({
        where: { id }
      });

      if (!scheduledReport || !scheduledReport.isActive) {
        logger.warn('Scheduled Reports: Report not found or inactive', { id, userId });
        return;
      }

      // ✅ A5: Multi-tenant check - ensure userId matches
      if (userId && scheduledReport.userId !== userId) {
        logger.error('Scheduled Reports: User ID mismatch', { 
          id, 
          expectedUserId: userId, 
          reportUserId: scheduledReport.userId 
        });
        throw new Error('User ID mismatch - unauthorized access');
      }

      logger.info('Executing scheduled report', { id, reportType: scheduledReport.reportType });

      // Parse filters
      const filters: ReportFilters = scheduledReport.filters 
        ? JSON.parse(scheduledReport.filters) 
        : {};

      // Generate report based on type
      let reportData: any;
      let fileName: string;

      switch (scheduledReport.reportType) {
        case 'sales':
          reportData = await reportsService.generateSalesReport(filters);
          fileName = `ventas_${new Date().toISOString().split('T')[0]}`;
          break;
        case 'products':
          reportData = await reportsService.generateProductReport(filters);
          fileName = `productos_${new Date().toISOString().split('T')[0]}`;
          break;
        case 'users':
          reportData = await reportsService.generateUserPerformanceReport();
          fileName = `usuarios_${new Date().toISOString().split('T')[0]}`;
          break;
        case 'marketplace-analytics':
          reportData = await reportsService.generateMarketplaceAnalytics();
          fileName = `marketplaces_${new Date().toISOString().split('T')[0]}`;
          break;
        case 'executive':
          reportData = await reportsService.generateExecutiveReport();
          fileName = `ejecutivo_${new Date().toISOString().split('T')[0]}`;
          break;
        default:
          throw new Error(`Unknown report type: ${scheduledReport.reportType}`);
      }

      // Generate file based on format
      let buffer: Buffer | undefined;
      const format = scheduledReport.reportFormat;
      const fullFileName = `${fileName}.${format === 'excel' ? 'xlsx' : format}`;

      if (format === 'excel') {
        buffer = await reportsService.exportToExcel(reportData, `Reporte ${scheduledReport.reportType}`);
      } else if (format === 'pdf') {
        const htmlContent = reportsService.generateHTMLReport(
          `Reporte ${scheduledReport.reportType}`,
          reportData,
          scheduledReport.reportType as any
        );
        buffer = await reportsService.generatePDFReport(htmlContent);
      }

      // Save to history
      if (buffer) {
        await reportsService.saveReportHistory(
          scheduledReport.userId,
          scheduledReport.reportType,
          format,
          fullFileName,
          buffer.length,
          undefined,
          filters,
          reportData
        );
      }

      // ✅ Enviar email con reporte adjunto si hay destinatarios
      if (buffer && scheduledReport.recipients) {
        try {
          const recipients = JSON.parse(scheduledReport.recipients) as string[];
          if (recipients && recipients.length > 0) {
            const emailService = (await import('./email.service')).default;
            const emailSent = await emailService.sendReportEmail(
              recipients,
              scheduledReport.reportType,
              fileName,
              buffer,
              format as 'excel' | 'pdf'
            );

            if (emailSent) {
              logger.info('Scheduled report email sent successfully', {
                id,
                recipients: recipients.join(', '),
                reportType: scheduledReport.reportType
              });
            } else {
              logger.warn('Failed to send scheduled report email', {
                id,
                recipients: recipients.join(', '),
                reportType: scheduledReport.reportType
              });
            }
          }
        } catch (emailError) {
          logger.error('Error sending scheduled report email', {
            error: emailError instanceof Error ? emailError.message : String(emailError),
            id,
            reportType: scheduledReport.reportType
          });
          // No fallar la ejecución del reporte si el email falla
        }
      }

      // Update last run and calculate next run
      const nextRunAt = this.calculateNextRunTime(
        scheduledReport.scheduleType,
        scheduledReport.scheduleValue
      );

      await prisma.scheduledReport.update({
        where: { id },
        data: {
          lastRunAt: new Date(),
          nextRunAt,
          error: null
        }
      });

      logger.info('Scheduled report executed successfully', { id, fileName });
    } catch (error) {
      logger.error('Error executing scheduled report', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        id
      });

      // Update error in database
      await prisma.scheduledReport.update({
        where: { id },
        data: {
          error: error instanceof Error ? error.message : String(error)
        }
      }).catch(() => {
        // Ignore errors updating error status
      });
    }
  }

  /**
   * Initialize all active scheduled reports on server start
   */
  async initializeScheduledReports(): Promise<void> {
    try {
      const activeReports = await prisma.scheduledReport.findMany({
        where: { isActive: true }
      });

      for (const report of activeReports) {
        await this.scheduleReport(report.id, report);
      }

      logger.info('Initialized scheduled reports', { count: activeReports.length });
    } catch (error) {
      logger.error('Error initializing scheduled reports', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

export { ScheduledReportsService };
export default new ScheduledReportsService();

