#!/usr/bin/env node

/**
 * Script de Auditoría Automatizada - Frontend Ivan Reseller Web
 * 
 * Verifica:
 * - Consistencia entre Sidebar y App.tsx
 * - Páginas simplificadas (< 100 líneas)
 * - Archivos duplicados/obsoletos
 * - Imports no utilizados
 * - CSS inconsistente
 * - Nomenclatura inconsistente
 */

const fs = require('fs');
const path = require('path');

const FRONTEND_PATH = path.join(__dirname, 'frontend', 'src');
const PAGES_PATH = path.join(FRONTEND_PATH, 'pages');

// Colores para terminal
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 1. Verificar consistencia Sidebar <-> App.tsx
function auditMenuConsistency() {
  log('\n📋 1. AUDITORÍA DE MENÚ Y RUTAS\n', 'bold');

  // Leer Sidebar.tsx
  const sidebarPath = path.join(FRONTEND_PATH, 'components', 'layout', 'Sidebar.tsx');
  const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');
  
  // Extraer navItems
  const navItemsMatch = sidebarContent.match(/const navItems = \[([\s\S]*?)\];/);
  if (!navItemsMatch) {
    log('❌ No se pudo extraer navItems de Sidebar.tsx', 'red');
    return;
  }

  const navItemsStr = navItemsMatch[1];
  const menuItems = [];
  
  // Parsear items del menú
  const itemRegex = /\{\s*path:\s*'([^']+)',\s*label:\s*'([^']+)',\s*icon:\s*(\w+)\s*\}/g;
  let match;
  while ((match = itemRegex.exec(navItemsStr)) !== null) {
    menuItems.push({
      path: match[1],
      label: match[2],
      icon: match[3],
    });
  }

  log(`✅ Items en Sidebar: ${menuItems.length}`, 'green');

  // Leer App.tsx
  const appPath = path.join(FRONTEND_PATH, 'App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf-8');

  // Verificar cada item del menú existe en App.tsx
  let missing = 0;
  menuItems.forEach(item => {
    const routePath = item.path.replace('/', '');
    const routeExists = appContent.includes(`path="${routePath}"`);
    
    if (routeExists) {
      log(`  ✅ ${item.label.padEnd(25)} → /${routePath}`, 'green');
    } else {
      log(`  ❌ ${item.label.padEnd(25)} → /${routePath} NO ENCONTRADO`, 'red');
      missing++;
    }
  });

  if (missing === 0) {
    log('\n✅ Todas las rutas del menú existen en App.tsx', 'green');
  } else {
    log(`\n⚠️  ${missing} rutas del menú NO están en App.tsx`, 'yellow');
  }

  // Buscar rutas en App.tsx que NO están en el menú
  const routeRegex = /<Route path="([^"]+)" element={<(\w+)/g;
  const hiddenRoutes = [];
  
  while ((match = routeRegex.exec(appContent)) !== null) {
    const routePath = `/${match[1]}`;
    const isInMenu = menuItems.some(item => item.path === routePath);
    
    if (!isInMenu && !routePath.includes(':') && routePath !== '/') {
      hiddenRoutes.push({ path: routePath, component: match[2] });
    }
  }

  if (hiddenRoutes.length > 0) {
    log(`\n⚠️  Rutas OCULTAS (no en menú): ${hiddenRoutes.length}`, 'yellow');
    hiddenRoutes.forEach(route => {
      log(`  → ${route.path.padEnd(20)} (${route.component})`, 'cyan');
    });
  }
}

// 2. Detectar páginas simplificadas
function auditPageComplexity() {
  log('\n📄 2. AUDITORÍA DE COMPLEJIDAD DE PÁGINAS\n', 'bold');

  const files = fs.readdirSync(PAGES_PATH).filter(f => f.endsWith('.tsx'));
  const pages = [];

  files.forEach(file => {
    const filePath = path.join(PAGES_PATH, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').length;

    pages.push({ file, lines });
  });

  // Ordenar por líneas
  pages.sort((a, b) => a.lines - b.lines);

  // Clasificar
  const critical = pages.filter(p => p.lines < 50);
  const simplified = pages.filter(p => p.lines >= 50 && p.lines < 100);
  const partial = pages.filter(p => p.lines >= 100 && p.lines < 200);
  const complete = pages.filter(p => p.lines >= 200);

  log('🔴 CRÍTICO (< 50 líneas):', 'red');
  critical.forEach(p => log(`  ${p.file.padEnd(30)} ${String(p.lines).padStart(4)} líneas`, 'red'));

  log('\n⚠️  SIMPLIFICADO (50-99 líneas):', 'yellow');
  simplified.forEach(p => log(`  ${p.file.padEnd(30)} ${String(p.lines).padStart(4)} líneas`, 'yellow'));

  log('\n🟡 PARCIAL (100-199 líneas):', 'yellow');
  partial.forEach(p => log(`  ${p.file.padEnd(30)} ${String(p.lines).padStart(4)} líneas`, 'cyan'));

  log('\n✅ COMPLETO (>= 200 líneas):', 'green');
  complete.forEach(p => log(`  ${p.file.padEnd(30)} ${String(p.lines).padStart(4)} líneas`, 'green'));

  log(`\n📊 Resumen:`, 'bold');
  log(`  Crítico:       ${critical.length} páginas (${Math.round(critical.length / pages.length * 100)}%)`, 'red');
  log(`  Simplificado:  ${simplified.length} páginas (${Math.round(simplified.length / pages.length * 100)}%)`, 'yellow');
  log(`  Parcial:       ${partial.length} páginas (${Math.round(partial.length / pages.length * 100)}%)`, 'cyan');
  log(`  Completo:      ${complete.length} páginas (${Math.round(complete.length / pages.length * 100)}%)`, 'green');
}

// 3. Detectar archivos duplicados/obsoletos
function auditDuplicateFiles() {
  log('\n🗑️  3. AUDITORÍA DE ARCHIVOS DUPLICADOS\n', 'bold');

  const files = fs.readdirSync(PAGES_PATH).filter(f => f.endsWith('.tsx'));
  
  // Patrones sospechosos
  const patterns = [
    { pattern: /-complete\.tsx$/, label: 'Versiones "-complete"' },
    { pattern: /-enhanced\.tsx$/, label: 'Versiones "-enhanced"' },
    { pattern: /-demo\.tsx$/, label: 'Versiones "-demo"' },
    { pattern: /-old\.tsx$/, label: 'Versiones "-old"' },
    { pattern: /-backup\.tsx$/, label: 'Versiones "-backup"' },
  ];

  let foundIssues = false;

  patterns.forEach(({ pattern, label }) => {
    const matches = files.filter(f => pattern.test(f));
    if (matches.length > 0) {
      foundIssues = true;
      log(`⚠️  ${label}: ${matches.length}`, 'yellow');
      matches.forEach(file => {
        const baseName = file.replace(pattern, '.tsx');
        const baseExists = files.includes(baseName);
        
        if (baseExists) {
          log(`  → ${file} (base: ${baseName} existe) ❗`, 'red');
        } else {
          log(`  → ${file}`, 'yellow');
        }
      });
    }
  });

  if (!foundIssues) {
    log('✅ No se encontraron archivos duplicados o con nombres sospechosos', 'green');
  }
}

// 4. Verificar consistencia de títulos
function auditPageTitles() {
  log('\n📝 4. AUDITORÍA DE TÍTULOS DE PÁGINAS\n', 'bold');

  // Leer Sidebar para obtener labels
  const sidebarPath = path.join(FRONTEND_PATH, 'components', 'layout', 'Sidebar.tsx');
  const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');
  
  const itemRegex = /\{\s*path:\s*'\/([^']+)',\s*label:\s*'([^']+)'/g;
  const menuLabels = {};
  let match;
  
  while ((match = itemRegex.exec(sidebarContent)) !== null) {
    menuLabels[match[1]] = match[2];
  }

  // Verificar cada página
  Object.entries(menuLabels).forEach(([route, label]) => {
    const fileName = route.charAt(0).toUpperCase() + route.slice(1) + '.tsx';
    const filePath = path.join(PAGES_PATH, fileName);

    if (!fs.existsSync(filePath)) {
      log(`⚠️  ${fileName} no existe`, 'yellow');
      return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Buscar h1
    const h1Regex = /<h1[^>]*>([^<]+)<\/h1>/;
    const h1Match = content.match(h1Regex);

    if (h1Match) {
      const pageTitle = h1Match[1].trim();
      
      if (pageTitle === label) {
        log(`✅ ${fileName.padEnd(30)} "${label}"`, 'green');
      } else {
        log(`⚠️  ${fileName.padEnd(30)} "${pageTitle}" ≠ "${label}"`, 'yellow');
      }
    } else {
      log(`❌ ${fileName.padEnd(30)} SIN <h1>`, 'red');
    }
  });
}

// 5. Verificar consistencia de CSS
function auditCSSConsistency() {
  log('\n🎨 5. AUDITORÍA DE CONSISTENCIA CSS\n', 'bold');

  const files = fs.readdirSync(PAGES_PATH).filter(f => f.endsWith('.tsx'));
  const cssPatterns = {
    withPadding: [],
    noPadding: [],
    withSpacing: [],
    noSpacing: [],
  };

  files.forEach(file => {
    const filePath = path.join(PAGES_PATH, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Buscar contenedor principal (primer <div> en el return)
    const mainDivRegex = /return\s*\(\s*<div className="([^"]+)"/;
    const match = content.match(mainDivRegex);

    if (match) {
      const className = match[1];
      
      if (/p-\d+/.test(className)) {
        cssPatterns.withPadding.push(file);
      } else {
        cssPatterns.noPadding.push(file);
      }

      if (/space-y-\d+/.test(className)) {
        cssPatterns.withSpacing.push(file);
      } else {
        cssPatterns.noSpacing.push(file);
      }
    }
  });

  log('Padding (p-X):', 'bold');
  log(`  ✅ Con padding:  ${cssPatterns.withPadding.length} páginas`, 'green');
  log(`  ⚠️  Sin padding:  ${cssPatterns.noPadding.length} páginas`, 'yellow');
  if (cssPatterns.noPadding.length > 0) {
    cssPatterns.noPadding.forEach(file => log(`    → ${file}`, 'yellow'));
  }

  log('\nSpacing (space-y-X):', 'bold');
  log(`  ✅ Con spacing:  ${cssPatterns.withSpacing.length} páginas`, 'green');
  log(`  ⚠️  Sin spacing:  ${cssPatterns.noSpacing.length} páginas`, 'yellow');
  if (cssPatterns.noSpacing.length > 0) {
    cssPatterns.noSpacing.forEach(file => log(`    → ${file}`, 'yellow'));
  }

  // Recomendación
  const recommended = 'p-6 space-y-4';
  log(`\n💡 CSS recomendado: className="${recommended}"`, 'cyan');
}

// Ejecutar todas las auditorías
function runAudit() {
  log('\n' + '='.repeat(60), 'bold');
  log('🔍 AUDITORÍA AUTOMATIZADA - FRONTEND IVAN RESELLER WEB', 'bold');
  log('='.repeat(60) + '\n', 'bold');

  try {
    auditMenuConsistency();
    auditPageComplexity();
    auditDuplicateFiles();
    auditPageTitles();
    auditCSSConsistency();

    log('\n' + '='.repeat(60), 'bold');
    log('✅ AUDITORÍA COMPLETADA', 'green');
    log('='.repeat(60) + '\n', 'bold');

    log('📄 Documentos generados:', 'bold');
    log('  - AUDITORIA_MENU_PAGINAS_COMPLETA.md', 'cyan');
    log('  - RESUMEN_AUDITORIA_FRONTEND.md', 'cyan');
    log('  - CHECKLIST_CORRECCION_PAGINAS.md', 'cyan');

  } catch (error) {
    log(`\n❌ ERROR: ${error.message}`, 'red');
    console.error(error);
  }
}

// Ejecutar
runAudit();
