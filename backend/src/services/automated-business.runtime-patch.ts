import { automatedBusinessSystem } from './automated-business.service';
import notificationService from './notification.service';

// Runtime patch to add stage controls and one-shot cycle helpers without editing the original class file

type Stage = 'scrape' | 'analyze' | 'publish';

function getStages(self: any) {
  return self.config?.stages || { scrape: 'automatic', analyze: 'automatic', publish: 'automatic' };
}

(automatedBusinessSystem as any).updateStages = function updateStages(stages: Partial<Record<Stage, 'manual' | 'automatic'>>) {
  const current = this.config?.stages || { scrape: 'automatic', analyze: 'automatic', publish: 'automatic' };
  this.config.stages = { ...current, ...stages };
  // simple log
  try { console.log('Etapas actualizadas:', this.config.stages); } catch {}
};

(automatedBusinessSystem as any).resumeStage = function resumeStage(stage: Stage) {
  if (this.pausedStage === stage) {
    this.pausedStage = null;
    try { console.log(`Etapa reanudada: ${stage}`); } catch {}
  }
};

(automatedBusinessSystem as any).runOneCycle = async function runOneCycle() {
  await this.processAutomationCycle();
};

// Wrap processAutomationCycle to support per-stage manual pauses
if (typeof (automatedBusinessSystem as any).processAutomationCycle === 'function') {
  const original = (automatedBusinessSystem as any).processAutomationCycle.bind(automatedBusinessSystem);
  (automatedBusinessSystem as any).processAutomationCycle = async function patchedProcessAutomationCycle() {
    if (this.pausedStage) {
      try { console.log(`Ciclo en espera por etapa pausada: ${this.pausedStage}`); } catch {}
      return;
    }

    const stages = getStages(this);

    // Stage: scrape
    if (stages.scrape === 'manual') {
      this.pausedStage = 'scrape';
      await notificationService.sendAlert({
        type: 'action_required',
        title: 'Etapa SCRAPE pausada',
        message: 'Modo manual: presiona "Continuar" para seguir con SCRAPE.',
        priority: 'HIGH',
        data: { stage: 'scrape' },
        actions: [{ id: 'continue_scrape', label: 'Continuar SCRAPE', action: 'continue_stage:scrape', variant: 'primary' }]
      });
      return;
    }
    if (typeof this.discoverOpportunities === 'function') {
      await this.discoverOpportunities();
    }

    // Stage: analyze
    if (stages.analyze === 'manual') {
      this.pausedStage = 'analyze';
      await notificationService.sendAlert({
        type: 'action_required',
        title: 'Etapa ANALYZE pausada',
        message: 'Modo manual: presiona "Continuar" para seguir con ANALYZE.',
        priority: 'HIGH',
        data: { stage: 'analyze' },
        actions: [{ id: 'continue_analyze', label: 'Continuar ANALYZE', action: 'continue_stage:analyze', variant: 'primary' }]
      });
      return;
    }
    if (typeof this.monitorPricing === 'function') {
      await this.monitorPricing();
    }

    // Stage: publish
    if (stages.publish === 'manual') {
      this.pausedStage = 'publish';
      await notificationService.sendAlert({
        type: 'action_required',
        title: 'Etapa PUBLISH pausada',
        message: 'Modo manual: presiona "Continuar" para seguir con PUBLISH.',
        priority: 'HIGH',
        data: { stage: 'publish' },
        actions: [{ id: 'continue_publish', label: 'Continuar PUBLISH', action: 'continue_stage:publish', variant: 'primary' }]
      });
      return;
    }
    if (typeof this.processOrders === 'function') {
      await this.processOrders();
    }

    if (typeof this.updateTracking === 'function') {
      await this.updateTracking();
    }
  };
}

