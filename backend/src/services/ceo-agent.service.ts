import { trace } from '../utils/boot-trace';
trace('loading ceo-agent.service');

import { EventEmitter } from 'events';
import axios from 'axios';
import { logger } from '../config/logger';
import { aiLearningSystem } from './ai-learning.service';
import { prisma } from '../config/database';
import env from '../config/env';
import { toNumber } from '../utils/decimal.utils';

/**
 * CEO Agent Configuration
 */
export interface CEOAgentConfig {
  enabled: boolean;
  analysisIntervalHours: number;
  minProductsForDecisions: number;
  capitalOptimizationEnabled: boolean;
  strategicAdjustmentsEnabled: boolean;
  groqApiKey?: string;
  groqModel: string;
}

/**
 * Performance Analysis Result
 */
export interface PerformanceAnalysis {
  totalProductsAnalyzed: number;
  successfulSales: number;
  failedPredictions: number;
  accuracyRatePct: number;
  productPatterns: Record<string, any>;
  averageProfit: number;
  averageROI: number;
  bestCategory: string;
  worstCategory: string;
}

/**
 * Strategic Decision
 */
export interface StrategicDecision {
  type: 'capital' | 'pricing' | 'category' | 'inventory' | 'policy';
  description: string;
  rationale: string;
  impact: 'high' | 'medium' | 'low';
  implementation: Record<string, any>;
  timestamp: Date;
}

/**
 * Capital Suggestion
 */
export interface CapitalSuggestion {
  currentCapital: number;
  suggestedCapital: number;
  reason: string;
  expectedImpact: string;
  confidence: number;
}

/**
 * AI-Powered Strategic Insights
 */
export interface AIInsights {
  marketTrends: string[];
  opportunityAreas: string[];
  riskFactors: string[];
  recommendations: string[];
  confidenceScore: number;
}

/**
 * CEO Agent - Strategic Decision Making System
 * 
 * The CEO Agent uses AI (Groq API) to make strategic business decisions:
 * - Analyzes performance data from sales and learning system
 * - Optimizes working capital allocation
 * - Adjusts business rules dynamically
 * - Identifies market opportunities and risks
 * - Provides strategic recommendations
 */
export class CEOAgent extends EventEmitter {
  private config: CEOAgentConfig;
  private lastAnalysis: Date | null = null;
  private decisions: StrategicDecision[] = [];
  private analysisTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor() {
    super();

    this.config = {
      enabled: false,
      analysisIntervalHours: 24,
      minProductsForDecisions: 20,
      capitalOptimizationEnabled: true,
      strategicAdjustmentsEnabled: true,
      groqApiKey: env.GROQ_API_KEY,
      groqModel: 'mixtral-8x7b-32768'
    };

    this.loadConfig();
  }

  /**
   * Load configuration from database
   */
  private async loadConfig(): Promise<void> {
    try {
      const configRecord = await prisma.systemConfig.findUnique({
        where: { key: 'ceo_agent_config' }
      });

      if (configRecord?.value) {
        const savedConfig = JSON.parse(configRecord.value as string);
        this.config = { ...this.config, ...savedConfig };
      }

      logger.info('CEO Agent: Configuration loaded');
    } catch (error) {
      logger.error('CEO Agent: Error loading configuration', { error });
    }
  }

  /**
   * Save configuration to database
   */
  private async saveConfig(): Promise<void> {
    try {
      await prisma.systemConfig.upsert({
        where: { key: 'ceo_agent_config' },
        create: {
          key: 'ceo_agent_config',
          value: JSON.stringify(this.config)
        },
        update: {
          value: JSON.stringify(this.config)
        }
      });

      logger.debug('CEO Agent: Configuration saved');
    } catch (error) {
      logger.error('CEO Agent: Error saving configuration', { error });
    }
  }

  /**
   * Start the CEO Agent
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('CEO Agent: Already running');
      return;
    }

    if (!this.config.enabled) {
      logger.warn('CEO Agent: System is disabled');
      return;
    }

    this.isRunning = true;
    logger.info('CEO Agent: System started');
    this.emit('started', { timestamp: new Date() });

    // Run first analysis
    await this.runStrategicAnalysis();

    // Schedule recurring analysis
    this.scheduleNextAnalysis();
  }

  /**
   * Stop the CEO Agent
   */
  public stop(): void {
    if (!this.isRunning) {
      logger.warn('CEO Agent: Not running');
      return;
    }

    this.isRunning = false;

    if (this.analysisTimer) {
      clearTimeout(this.analysisTimer);
      this.analysisTimer = null;
    }

    logger.info('CEO Agent: System stopped');
    this.emit('stopped', { timestamp: new Date() });
  }

  /**
   * Schedule next analysis
   */
  private scheduleNextAnalysis(): void {
    if (!this.isRunning) return;

    const intervalMs = this.config.analysisIntervalHours * 60 * 60 * 1000;

    this.analysisTimer = setTimeout(async () => {
      await this.runStrategicAnalysis();
      this.scheduleNextAnalysis();
    }, intervalMs);

    logger.debug('CEO Agent: Next analysis scheduled', {
      nextAnalysisIn: `${this.config.analysisIntervalHours} hours`
    });
  }

  /**
   * Analyze business performance
   */
  public async analyzePerformance(): Promise<PerformanceAnalysis> {
    try {
      // Get learning stats
      const learningStats = aiLearningSystem.getLearningStats();

      // Get sales data
      const sales = await prisma.sale.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
          }
        },
        include: {
          product: true
        }
      });

      // Calculate metrics
      const totalProfit = sales.reduce((sum, sale) => sum + toNumber(sale.netProfit || 0), 0);
      const averageProfit = sales.length > 0 ? totalProfit / sales.length : 0;

      const totalROI = sales.reduce((sum, sale) => {
        const netProfitNum = toNumber(sale.netProfit || 0);
        const costNum = toNumber(sale.aliexpressCost || 0);
        const roi = costNum > 0 ? (netProfitNum / costNum) * 100 : 0;
        return sum + roi;
      }, 0);
      const averageROI = sales.length > 0 ? totalROI / sales.length : 0;

      // Category analysis
      const categoryStats: Record<string, { sales: number; profit: number }> = {};
      
      for (const sale of sales) {
        const category = sale.product?.category || 'unknown';
        if (!categoryStats[category]) {
          categoryStats[category] = { sales: 0, profit: 0 };
        }
        categoryStats[category].sales++;
        categoryStats[category].profit += toNumber(sale.netProfit || 0);
      }

      const bestCategory = Object.keys(categoryStats).reduce((a, b) =>
        categoryStats[a].profit > categoryStats[b].profit ? a : b,
        'unknown'
      );

      const worstCategory = Object.keys(categoryStats).reduce((a, b) =>
        categoryStats[a].profit < categoryStats[b].profit ? a : b,
        'unknown'
      );

      const analysis: PerformanceAnalysis = {
        totalProductsAnalyzed: learningStats.totalProductsAnalyzed,
        successfulSales: learningStats.successfulSales,
        failedPredictions: learningStats.failedPredictions,
        accuracyRatePct: learningStats.accuracyRate * 100,
        productPatterns: learningStats.patterns || {},
        averageProfit: Math.round(averageProfit * 100) / 100,
        averageROI: Math.round(averageROI * 100) / 100,
        bestCategory,
        worstCategory
      };

      logger.info('CEO Agent: Performance analysis completed', { analysis });

      return analysis;

    } catch (error) {
      logger.error('CEO Agent: Error analyzing performance', { error });
      throw error;
    }
  }

  /**
   * Suggest optimal working capital
   */
  public async suggestOptimalCapital(): Promise<CapitalSuggestion> {
    try {
      const sales = await prisma.sale.findMany({
        where: {
          status: {
            in: ['DELIVERED']
          },
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        }
      });

      if (sales.length === 0) {
        return {
          currentCapital: 500,
          suggestedCapital: 500,
          reason: 'No sales data available. Default capital recommended.',
          expectedImpact: 'Allows for 10-20 initial products',
          confidence: 0.5
        };
      }

      // Calculate average cost
      const avgCost = sales.reduce((sum, sale) => 
        sum + toNumber(sale.aliexpressCost || 0), 0
      ) / sales.length;

      // Calculate average sales per day
      const daysRange = 30;
      const avgSalesPerDay = sales.length / daysRange;

      // Strategy: Capital for 10 average sales + buffer
      const suggestedCapital = Math.round((avgCost * 10 * avgSalesPerDay) * 1.2);

      // Get current capital
      const autopilotConfig = await prisma.systemConfig.findUnique({
        where: { key: 'autopilot_config' }
      });

      let currentCapital = 500;
      if (autopilotConfig?.value) {
        const config = JSON.parse(autopilotConfig.value as string);
        currentCapital = config.workingCapital || 500;
      }

      const suggestion: CapitalSuggestion = {
        currentCapital,
        suggestedCapital,
        reason: `Based on average product cost of $${avgCost.toFixed(2)} and ${avgSalesPerDay.toFixed(1)} sales/day, optimal capital is $${suggestedCapital}`,
        expectedImpact: `Can support ${Math.floor(suggestedCapital / avgCost)} concurrent products`,
        confidence: Math.min(0.5 + (sales.length / 100), 0.95)
      };

      logger.info('CEO Agent: Capital suggestion generated', { suggestion });

      return suggestion;

    } catch (error) {
      logger.error('CEO Agent: Error suggesting capital', { error });
      throw error;
    }
  }

  /**
   * Get AI-powered insights using Groq
   */
  private async getAIInsights(analysis: PerformanceAnalysis): Promise<AIInsights | null> {
    if (!this.config.groqApiKey) {
      logger.warn('CEO Agent: Groq API key not configured');
      return null;
    }

    try {
      const prompt = `You are a strategic business consultant analyzing an e-commerce dropshipping business.

Performance Data:
- Total Products Analyzed: ${analysis.totalProductsAnalyzed}
- Successful Sales: ${analysis.successfulSales}
- Prediction Accuracy: ${analysis.accuracyRatePct.toFixed(1)}%
- Average Profit: $${analysis.averageProfit.toFixed(2)}
- Average ROI: ${analysis.averageROI.toFixed(1)}%
- Best Category: ${analysis.bestCategory}
- Worst Category: ${analysis.worstCategory}

Provide strategic insights in JSON format:
{
  "marketTrends": ["trend1", "trend2", "trend3"],
  "opportunityAreas": ["opportunity1", "opportunity2"],
  "riskFactors": ["risk1", "risk2"],
  "recommendations": ["rec1", "rec2", "rec3"],
  "confidenceScore": 0.85
}

Focus on actionable insights for optimizing profitability and scaling operations.`;

      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: this.config.groqModel,
          messages: [
            {
              role: 'system',
              content: 'You are a strategic business consultant specializing in e-commerce and dropshipping optimization.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 1000
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.groqApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const content = response.data.choices[0]?.message?.content;
      if (!content) {
        logger.warn('CEO Agent: Empty response from Groq');
        return null;
      }

      // Parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('CEO Agent: No JSON found in Groq response');
        return null;
      }

      const insights: AIInsights = JSON.parse(jsonMatch[0]);
      
      logger.info('CEO Agent: AI insights generated', { insights });

      return insights;

    } catch (error) {
      logger.error('CEO Agent: Error getting AI insights', { error });
      return null;
    }
  }

  /**
   * Run strategic analysis
   */
  public async runStrategicAnalysis(): Promise<void> {
    try {
      logger.info('CEO Agent: Starting strategic analysis...');

      this.emit('analysis:started', { timestamp: new Date() });

      // 1. Analyze performance
      const analysis = await this.analyzePerformance();

      // Check if we have enough data
      if (analysis.totalProductsAnalyzed < this.config.minProductsForDecisions) {
        logger.info('CEO Agent: Insufficient data for strategic decisions', {
          analyzed: analysis.totalProductsAnalyzed,
          required: this.config.minProductsForDecisions
        });
        
        this.emit('analysis:insufficient_data', { analysis });
        return;
      }

      // 2. Get AI insights (if configured)
      const aiInsights = await this.getAIInsights(analysis);

      // 3. Generate strategic decisions
      const decisions: StrategicDecision[] = [];

      // Capital optimization
      if (this.config.capitalOptimizationEnabled) {
        const capitalSuggestion = await this.suggestOptimalCapital();
        
        if (Math.abs(capitalSuggestion.suggestedCapital - capitalSuggestion.currentCapital) > 100) {
          decisions.push({
            type: 'capital',
            description: `Adjust working capital from $${capitalSuggestion.currentCapital} to $${capitalSuggestion.suggestedCapital}`,
            rationale: capitalSuggestion.reason,
            impact: 'high',
            implementation: {
              currentCapital: capitalSuggestion.currentCapital,
              newCapital: capitalSuggestion.suggestedCapital,
              confidence: capitalSuggestion.confidence
            },
            timestamp: new Date()
          });
        }
      }

      // Category optimization
      if (this.config.strategicAdjustmentsEnabled && analysis.bestCategory !== analysis.worstCategory) {
        decisions.push({
          type: 'category',
          description: `Focus on ${analysis.bestCategory}, reduce ${analysis.worstCategory}`,
          rationale: `${analysis.bestCategory} shows best profit performance`,
          impact: 'medium',
          implementation: {
            prioritizeCategories: [analysis.bestCategory],
            reduceCategories: [analysis.worstCategory]
          },
          timestamp: new Date()
        });
      }

      // Pricing optimization
      if (analysis.averageROI < 50) {
        decisions.push({
          type: 'pricing',
          description: 'Increase pricing margins to improve ROI',
          rationale: `Current ROI of ${analysis.averageROI.toFixed(1)}% is below target (50%)`,
          impact: 'high',
          implementation: {
            currentROI: analysis.averageROI,
            targetROI: 50,
            suggestedMarkup: 2.2
          },
          timestamp: new Date()
        });
      }

      // Store decisions
      this.decisions = [...this.decisions, ...decisions].slice(-50); // Keep last 50

      // 4. Implement decisions (if enabled)
      if (this.config.strategicAdjustmentsEnabled && decisions.length > 0) {
        await this.implementDecisions(decisions);
      }

      this.lastAnalysis = new Date();

      logger.info('CEO Agent: Strategic analysis completed', {
        decisionsGenerated: decisions.length,
        hasAIInsights: !!aiInsights
      });

      this.emit('analysis:completed', {
        analysis,
        decisions,
        aiInsights,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('CEO Agent: Error in strategic analysis', { error });
      this.emit('analysis:failed', { error, timestamp: new Date() });
    }
  }

  /**
   * Implement strategic decisions
   */
  private async implementDecisions(decisions: StrategicDecision[]): Promise<void> {
    for (const decision of decisions) {
      try {
        logger.info('CEO Agent: Implementing decision', { decision });

        switch (decision.type) {
          case 'capital':
            await this.implementCapitalDecision(decision);
            break;
          
          case 'category':
            await this.implementCategoryDecision(decision);
            break;
          
          case 'pricing':
            await this.implementPricingDecision(decision);
            break;
          
          default:
            logger.warn('CEO Agent: Unknown decision type', { type: decision.type });
        }

        this.emit('decision:implemented', { decision });

      } catch (error) {
        logger.error('CEO Agent: Error implementing decision', { error, decision });
        this.emit('decision:failed', { decision, error });
      }
    }
  }

  /**
   * Implement capital decision
   */
  private async implementCapitalDecision(decision: StrategicDecision): Promise<void> {
    const autopilotConfig = await prisma.systemConfig.findUnique({
      where: { key: 'autopilot_config' }
    });

    if (autopilotConfig?.value) {
      const config = JSON.parse(autopilotConfig.value as string);
      config.workingCapital = decision.implementation.newCapital;

      await prisma.systemConfig.update({
        where: { key: 'autopilot_config' },
        data: { value: JSON.stringify(config) }
      });

      logger.info('CEO Agent: Capital updated', { 
        newCapital: decision.implementation.newCapital 
      });
    }
  }

  /**
   * Implement category decision
   */
  private async implementCategoryDecision(decision: StrategicDecision): Promise<void> {
    // Update category priorities in autopilot config
    const autopilotConfig = await prisma.systemConfig.findUnique({
      where: { key: 'autopilot_config' }
    });

    if (autopilotConfig?.value) {
      const config = JSON.parse(autopilotConfig.value as string);
      config.priorityCategories = decision.implementation.prioritizeCategories;
      config.reducedCategories = decision.implementation.reduceCategories;

      await prisma.systemConfig.update({
        where: { key: 'autopilot_config' },
        data: { value: JSON.stringify(config) }
      });

      logger.info('CEO Agent: Category priorities updated', {
        prioritize: decision.implementation.prioritizeCategories,
        reduce: decision.implementation.reduceCategories
      });
    }
  }

  /**
   * Implement pricing decision
   */
  private async implementPricingDecision(decision: StrategicDecision): Promise<void> {
    // Update pricing rules
    const businessRules = await prisma.systemConfig.findUnique({
      where: { key: 'business_rules' }
    });

    if (businessRules?.value) {
      const rules = JSON.parse(businessRules.value as string);
      rules.suggestedMarkup = decision.implementation.suggestedMarkup;
      rules.minROI = decision.implementation.targetROI;

      await prisma.systemConfig.update({
        where: { key: 'business_rules' },
        data: { value: JSON.stringify(rules) }
      });

      logger.info('CEO Agent: Pricing rules updated', {
        markup: decision.implementation.suggestedMarkup,
        targetROI: decision.implementation.targetROI
      });
    }
  }

  /**
   * Get recent decisions
   */
  public getRecentDecisions(limit: number = 10): StrategicDecision[] {
    return this.decisions.slice(-limit);
  }

  /**
   * Get status
   */
  public getStatus() {
    return {
      isRunning: this.isRunning,
      config: this.config,
      lastAnalysis: this.lastAnalysis,
      recentDecisions: this.getRecentDecisions(5)
    };
  }

  /**
   * Update configuration
   */
  public async updateConfig(config: Partial<CEOAgentConfig>): Promise<void> {
    this.config = { ...this.config, ...config };
    await this.saveConfig();
    
    logger.info('CEO Agent: Configuration updated', { config });
    this.emit('config:updated', { config: this.config });
  }
}

// Singleton instance
export const ceoAgent = new CEOAgent();
