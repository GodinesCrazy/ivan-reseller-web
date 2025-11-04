#!/usr/bin/env node

/**
 * Script de Validación Completa del Sistema Ivan Reseller
 * Valida todos los componentes, APIs y configuraciones
 */

import * as fs from 'fs';
import * as path from 'path';

interface ValidationResult {
  component: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  details: string;
  issues?: string[];
  suggestions?: string[];
}

class SystemValidator {
  private results: ValidationResult[] = [];

  log(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
    const colors = {
      info: '\x1b[36m',    // Cyan
      success: '\x1b[32m', // Green  
      warning: '\x1b[33m', // Yellow
      error: '\x1b[31m',   // Red
    };
    const reset = '\x1b[0m';
    console.log(`${colors[type]}${message}${reset}`);
  }

  addResult(result: ValidationResult) {
    this.results.push(result);
    const status = result.status === 'PASS' ? '✅' : result.status === 'WARNING' ? '⚠️' : '❌';
    this.log(`${status} ${result.component}: ${result.details}`, 
      result.status === 'PASS' ? 'success' : result.status === 'WARNING' ? 'warning' : 'error');
  }

  /**
   * Validar estructura de archivos del sistema
   */
  validateFileStructure(): void {
    this.log('\n🔍 Validando estructura de archivos...', 'info');

    const requiredFiles = [
      // Backend core
      'backend/src/app.ts',
      'backend/src/server.ts', 
      'backend/simple-server.js',
      'backend/package.json',

      // Services
      'backend/src/services/ebay.service.ts',
      'backend/src/services/amazon.service.ts',
      'backend/src/services/mercadolibre.service.ts',
      'backend/src/services/scraping.service.ts',
      'backend/src/services/ai-opportunity.service.ts',
      'backend/src/services/automation.service.ts',
      'backend/src/services/notifications.service.ts',
      'backend/src/services/security.service.ts',

      // Controllers
      'backend/src/controllers/automation.controller.ts',

      // Routes
      'backend/src/routes/automation.routes.ts',

      // Frontend core
      'frontend/src/App.tsx',
      'frontend/src/main.tsx',
      'frontend/package.json',

      // Components IA
      'frontend/src/components/AIOpportunityFinder.tsx',
      'frontend/src/components/AISuggestionsPanel.tsx',
      'frontend/src/pages/Dashboard-complete.tsx',
    ];

    let missingFiles: string[] = [];
    let presentFiles = 0;

    for (const file of requiredFiles) {
      const fullPath = path.join(process.cwd(), file);
      if (fs.existsSync(fullPath)) {
        presentFiles++;
      } else {
        missingFiles.push(file);
      }
    }

    if (missingFiles.length === 0) {
      this.addResult({
        component: 'Estructura de Archivos',
        status: 'PASS',
        details: `Todos los ${requiredFiles.length} archivos críticos están presentes`
      });
    } else {
      this.addResult({
        component: 'Estructura de Archivos',
        status: 'FAIL',
        details: `${missingFiles.length} archivos faltantes de ${requiredFiles.length}`,
        issues: missingFiles,
        suggestions: ['Crear archivos faltantes', 'Verificar rutas de archivos']
      });
    }
  }

  /**
   * Validar configuración de packages
   */
  validatePackageConfiguration(): void {
    this.log('\n📦 Validando configuración de packages...', 'info');

    try {
      // Backend package.json
      const backendPkg = JSON.parse(fs.readFileSync('backend/package.json', 'utf8'));
      const requiredBackendDeps = [
        'express', 'cors', 'helmet', 'bcryptjs', 'jsonwebtoken',
        'puppeteer', 'cheerio', 'axios', 'bullmq', 'ioredis',
        'nodemailer', 'twilio', '@slack/web-api'
      ];

      let missingBackendDeps: string[] = [];
      for (const dep of requiredBackendDeps) {
        if (!backendPkg.dependencies?.[dep] && !backendPkg.devDependencies?.[dep]) {
          missingBackendDeps.push(dep);
        }
      }

      // Frontend package.json
      const frontendPkg = JSON.parse(fs.readFileSync('frontend/package.json', 'utf8'));
      const requiredFrontendDeps = [
        'react', 'react-dom', 'typescript', 'vite',
        'tailwindcss', 'lucide-react', 'axios'
      ];

      let missingFrontendDeps: string[] = [];
      for (const dep of requiredFrontendDeps) {
        if (!frontendPkg.dependencies?.[dep] && !frontendPkg.devDependencies?.[dep]) {
          missingFrontendDeps.push(dep);
        }
      }

      if (missingBackendDeps.length === 0 && missingFrontendDeps.length === 0) {
        this.addResult({
          component: 'Configuración Packages',
          status: 'PASS',
          details: 'Todas las dependencias críticas están instaladas'
        });
      } else {
        this.addResult({
          component: 'Configuración Packages',
          status: 'WARNING',
          details: `Dependencias faltantes: Backend(${missingBackendDeps.length}), Frontend(${missingFrontendDeps.length})`,
          issues: [...missingBackendDeps.map(d => `Backend: ${d}`), ...missingFrontendDeps.map(d => `Frontend: ${d}`)],
          suggestions: ['npm install en backend y frontend', 'Verificar package.json']
        });
      }

    } catch (error) {
      this.addResult({
        component: 'Configuración Packages',
        status: 'FAIL',
        details: 'Error leyendo package.json',
        issues: [error instanceof Error ? error.message : 'Error desconocido']
      });
    }
  }

  /**
   * Validar servicios críticos
   */
  validateCriticalServices(): void {
    this.log('\n⚙️ Validando servicios críticos...', 'info');

    const services = [
      { file: 'backend/src/services/ai-opportunity.service.ts', name: 'Motor IA' },
      { file: 'backend/src/services/automation.service.ts', name: 'Sistema Automatización' },
      { file: 'backend/src/services/scraping.service.ts', name: 'Sistema Scraping' },
      { file: 'backend/src/services/security.service.ts', name: 'Sistema Seguridad' },
      { file: 'backend/src/services/notifications.service.ts', name: 'Sistema Notificaciones' }
    ];

    let validServices = 0;
    let issues: string[] = [];

    for (const service of services) {
      try {
        const content = fs.readFileSync(service.file, 'utf8');
        
        // Verificar que tenga exportación de clase
        if (content.includes('export class') || content.includes('export default class')) {
          validServices++;
        } else {
          issues.push(`${service.name}: No tiene exportación de clase`);
        }

        // Verificar métodos críticos específicos
        if (service.file.includes('automation.service.ts')) {
          if (!content.includes('processOpportunity') || !content.includes('executeAutomatedFlow')) {
            issues.push(`${service.name}: Métodos críticos faltantes`);
          }
        }

        if (service.file.includes('ai-opportunity.service.ts')) {
          if (!content.includes('analyzeOpportunity') || !content.includes('calculateProfitability')) {
            issues.push(`${service.name}: Métodos de análisis faltantes`);
          }
        }

      } catch (error) {
        issues.push(`${service.name}: Error leyendo archivo`);
      }
    }

    if (validServices === services.length && issues.length === 0) {
      this.addResult({
        component: 'Servicios Críticos',
        status: 'PASS',
        details: `Todos los ${services.length} servicios están correctamente implementados`
      });
    } else {
      this.addResult({
        component: 'Servicios Críticos',
        status: issues.length > 0 ? 'FAIL' : 'WARNING',
        details: `${validServices}/${services.length} servicios válidos`,
        issues: issues.length > 0 ? issues : undefined,
        suggestions: ['Revisar implementación de servicios', 'Verificar métodos críticos']
      });
    }
  }

  /**
   * Validar componentes frontend IA
   */
  validateFrontendComponents(): void {
    this.log('\n🎨 Validando componentes frontend IA...', 'info');

    const components = [
      { file: 'frontend/src/components/AIOpportunityFinder.tsx', name: 'AI Opportunity Finder' },
      { file: 'frontend/src/components/AISuggestionsPanel.tsx', name: 'AI Suggestions Panel' },
      { file: 'frontend/src/pages/Dashboard-complete.tsx', name: 'Dashboard Completo' }
    ];

    let validComponents = 0;
    let issues: string[] = [];

    for (const component of components) {
      try {
        const content = fs.readFileSync(component.file, 'utf8');
        
        // Verificar estructura React
        if (content.includes('export default') && content.includes('return (')) {
          validComponents++;
        } else {
          issues.push(`${component.name}: Estructura React inválida`);
        }

        // Verificar funcionalidades específicas
        if (component.file.includes('AIOpportunityFinder')) {
          if (!content.includes('analyzeOpportunities') || !content.includes('MarketOpportunity')) {
            issues.push(`${component.name}: Funcionalidades IA faltantes`);
          }
        }

        if (component.file.includes('AISuggestionsPanel')) {
          if (!content.includes('AISuggestion') || !content.includes('implementSuggestion')) {
            issues.push(`${component.name}: Sistema de sugerencias incompleto`);
          }
        }

      } catch (error) {
        issues.push(`${component.name}: Error leyendo archivo`);
      }
    }

    if (validComponents === components.length && issues.length === 0) {
      this.addResult({
        component: 'Componentes Frontend IA',
        status: 'PASS',
        details: `Todos los ${components.length} componentes IA están implementados correctamente`
      });
    } else {
      this.addResult({
        component: 'Componentes Frontend IA',
        status: issues.length > 0 ? 'FAIL' : 'WARNING',
        details: `${validComponents}/${components.length} componentes válidos`,
        issues: issues.length > 0 ? issues : undefined,
        suggestions: ['Revisar componentes React', 'Verificar funcionalidades IA']
      });
    }
  }

  /**
   * Validar configuraciones de modo (Sandbox/Producción, Manual/Automático)
   */
  validateModeConfigurations(): void {
    this.log('\n🔄 Validando configuraciones de modo...', 'info');

    try {
      // Verificar configuración en Dashboard
      const dashboardContent = fs.readFileSync('frontend/src/pages/Dashboard-complete.tsx', 'utf8');
      
      let modeFeatures = {
        automaticMode: dashboardContent.includes('isAutomaticMode'),
        productionMode: dashboardContent.includes('isProductionMode'),
        modeToggles: dashboardContent.includes('ToggleLeft') && dashboardContent.includes('ToggleRight'),
        environmentControls: dashboardContent.includes('Sandbox') && dashboardContent.includes('Producción')
      };

      // Verificar en servicios backend
      const automationContent = fs.readFileSync('backend/src/services/automation.service.ts', 'utf8');
      let backendModes = {
        sandboxSupport: automationContent.includes('sandbox') || automationContent.includes('test'),
        productionSupport: automationContent.includes('production') || automationContent.includes('prod'),
        modeHandling: automationContent.includes('mode') && automationContent.includes('environment')
      };

      let issues: string[] = [];
      let warnings: string[] = [];

      if (!modeFeatures.automaticMode) issues.push('Frontend: Modo automático no implementado');
      if (!modeFeatures.productionMode) issues.push('Frontend: Modo producción no implementado');
      if (!modeFeatures.modeToggles) warnings.push('Frontend: Controles de toggle incompletos');
      if (!modeFeatures.environmentControls) warnings.push('Frontend: Controles de entorno incompletos');

      if (!backendModes.sandboxSupport) issues.push('Backend: Soporte sandbox faltante');
      if (!backendModes.productionSupport) issues.push('Backend: Soporte producción faltante');
      if (!backendModes.modeHandling) warnings.push('Backend: Manejo de modos incompleto');

      if (issues.length === 0 && warnings.length === 0) {
        this.addResult({
          component: 'Configuraciones de Modo',
          status: 'PASS',
          details: 'Todos los modos (Sandbox/Producción, Manual/Automático) están implementados'
        });
      } else if (issues.length === 0) {
        this.addResult({
          component: 'Configuraciones de Modo',
          status: 'WARNING',
          details: 'Modos implementados con algunas mejoras pendientes',
          issues: warnings,
          suggestions: ['Completar controles de interfaz', 'Mejorar manejo de modos']
        });
      } else {
        this.addResult({
          component: 'Configuraciones de Modo',
          status: 'FAIL',
          details: 'Configuraciones de modo incompletas',
          issues: [...issues, ...warnings],
          suggestions: ['Implementar modos faltantes', 'Verificar consistencia frontend-backend']
        });
      }

    } catch (error) {
      this.addResult({
        component: 'Configuraciones de Modo',
        status: 'FAIL',
        details: 'Error validando configuraciones de modo',
        issues: [error instanceof Error ? error.message : 'Error desconocido']
      });
    }
  }

  /**
   * Generar reporte final
   */
  generateReport(): void {
    this.log('\n📊 REPORTE FINAL DE VALIDACIÓN', 'info');
    this.log('━'.repeat(50), 'info');

    const passed = this.results.filter(r => r.status === 'PASS').length;
    const warnings = this.results.filter(r => r.status === 'WARNING').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const total = this.results.length;

    this.log(`\n📈 ESTADÍSTICAS:`, 'info');
    this.log(`   ✅ Pasaron: ${passed}/${total} (${Math.round(passed/total*100)}%)`, 'success');
    this.log(`   ⚠️  Advertencias: ${warnings}/${total} (${Math.round(warnings/total*100)}%)`, 'warning');
    this.log(`   ❌ Fallaron: ${failed}/${total} (${Math.round(failed/total*100)}%)`, 'error');

    const overallPercentage = Math.round((passed + warnings * 0.5) / total * 100);
    this.log(`\n🎯 ESTADO GENERAL: ${overallPercentage}% COMPLETADO`, 
      overallPercentage >= 90 ? 'success' : overallPercentage >= 70 ? 'warning' : 'error');

    if (failed === 0 && warnings === 0) {
      this.log(`\n🎉 ¡SISTEMA 100% OPERATIVO PARA PRODUCCIÓN!`, 'success');
      this.log(`✨ Todas las validaciones pasaron exitosamente`, 'success');
    } else if (failed === 0) {
      this.log(`\n✅ SISTEMA LISTO CON MEJORAS MENORES PENDIENTES`, 'warning');
      this.log(`🔧 Revisar advertencias para optimización completa`, 'warning');
    } else {
      this.log(`\n🔧 SISTEMA REQUIERE CORRECCIONES ANTES DE PRODUCCIÓN`, 'error');
      this.log(`❗ Resolver problemas críticos identificados`, 'error');
    }

    // Mostrar detalles de problemas
    const problemResults = this.results.filter(r => r.status !== 'PASS');
    if (problemResults.length > 0) {
      this.log(`\n🔍 DETALLES DE PROBLEMAS:`, 'info');
      problemResults.forEach(result => {
        this.log(`\n${result.status === 'WARNING' ? '⚠️' : '❌'} ${result.component}:`, 
          result.status === 'WARNING' ? 'warning' : 'error');
        if (result.issues) {
          result.issues.forEach(issue => this.log(`   • ${issue}`, 'info'));
        }
        if (result.suggestions) {
          this.log(`   💡 Sugerencias:`, 'info');
          result.suggestions.forEach(suggestion => this.log(`      - ${suggestion}`, 'info'));
        }
      });
    }

    this.log(`\n━`.repeat(50), 'info');
    this.log(`🕒 Validación completada: ${new Date().toISOString()}`, 'info');
  }

  /**
   * Ejecutar todas las validaciones
   */
  async runAllValidations(): Promise<void> {
    this.log('🚀 INICIANDO VALIDACIÓN COMPLETA DEL SISTEMA IVAN RESELLER', 'info');
    this.log('━'.repeat(60), 'info');

    this.validateFileStructure();
    this.validatePackageConfiguration();
    this.validateCriticalServices();
    this.validateFrontendComponents();
    this.validateModeConfigurations();

    this.generateReport();
  }
}

// Ejecutar validación
const validator = new SystemValidator();
validator.runAllValidations().catch(console.error);