/**
 * TEST DE BÚSQUEDA DE OPORTUNIDADES REALES
 * 
 * Este script prueba la funcionalidad de búsqueda de oportunidades
 * sin modificar ningún código del sistema.
 */

const axios = require('axios');

const API_URL = 'http://localhost:3000';
const TEST_USER = {
  email: 'admin@ivanreseller.com',
  password: 'admin123'
};

// Colores para consola
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

async function login() {
  log(colors.cyan, '\n[1/3] 🔐 Iniciando sesión...');
  
  try {
    const response = await axios.post(`${API_URL}/api/auth/login`, TEST_USER);
    const token = response.data.token;
    log(colors.green, '✅ Login exitoso');
    return token;
  } catch (error) {
    log(colors.red, '❌ Error en login:', error.response?.data?.message || error.message);
    throw error;
  }
}

async function searchOpportunities(token, query) {
  log(colors.cyan, `\n[2/3] 🔍 Buscando oportunidades: "${query}"`);
  
  try {
    const response = await axios.get(`${API_URL}/api/opportunities`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        query: query,
        maxItems: 10,
        marketplaces: ['ebay', 'amazon', 'mercadolibre'],
        region: 'US'
      }
    });
    
    return response.data;
  } catch (error) {
    log(colors.red, '❌ Error buscando oportunidades:', error.response?.data?.message || error.message);
    throw error;
  }
}

async function displayResults(results) {
  log(colors.cyan, '\n[3/3] 📊 Resultados de la búsqueda:\n');
  
  if (!results || !results.items || results.items.length === 0) {
    log(colors.yellow, '⚠️  No se encontraron oportunidades');
    return;
  }
  
  log(colors.green, `✅ Se encontraron ${results.items.length} oportunidades\n`);
  
  console.log('═══════════════════════════════════════════════════════════════════════════');
  
  results.items.forEach((item, index) => {
    console.log(`\n${colors.magenta}OPORTUNIDAD #${index + 1}${colors.reset}`);
    console.log('─────────────────────────────────────────────────────────────────────────');
    
    console.log(`${colors.blue}Producto:${colors.reset}`, item.title || 'N/A');
    console.log(`${colors.blue}Precio AliExpress:${colors.reset}`, item.aliexpressPrice ? `$${item.aliexpressPrice.toFixed(2)}` : 'N/A');
    console.log(`${colors.blue}Precio Sugerido:${colors.reset}`, item.suggestedPrice ? `$${item.suggestedPrice.toFixed(2)}` : 'N/A');
    
    if (item.profitMargin) {
      const color = item.profitMargin > 30 ? colors.green : item.profitMargin > 15 ? colors.yellow : colors.red;
      console.log(`${colors.blue}Margen de Ganancia:${colors.reset}`, `${color}${item.profitMargin.toFixed(2)}%${colors.reset}`);
    }
    
    if (item.potentialProfit) {
      console.log(`${colors.blue}Ganancia Potencial:${colors.reset}`, `${colors.green}$${item.potentialProfit.toFixed(2)}${colors.reset}`);
    }
    
    if (item.competitionLevel) {
      const compColor = item.competitionLevel === 'LOW' ? colors.green : item.competitionLevel === 'MEDIUM' ? colors.yellow : colors.red;
      console.log(`${colors.blue}Competencia:${colors.reset}`, `${compColor}${item.competitionLevel}${colors.reset}`);
    }
    
    if (item.demandLevel) {
      console.log(`${colors.blue}Demanda:${colors.reset}`, item.demandLevel);
    }
    
    if (item.category) {
      console.log(`${colors.blue}Categoría:${colors.reset}`, item.category);
    }
    
    if (item.marketplace) {
      console.log(`${colors.blue}Marketplace Sugerido:${colors.reset}`, item.marketplace.toUpperCase());
    }
    
    if (item.url) {
      console.log(`${colors.blue}URL:${colors.reset}`, item.url);
    }
    
    if (item.imageUrl) {
      console.log(`${colors.blue}Imagen:${colors.reset}`, item.imageUrl);
    }
    
    if (item.rating) {
      console.log(`${colors.blue}Rating:${colors.reset}`, `⭐ ${item.rating}`);
    }
    
    if (item.reviewCount) {
      console.log(`${colors.blue}Reviews:${colors.reset}`, item.reviewCount);
    }
    
    if (item.shippingInfo) {
      console.log(`${colors.blue}Envío:${colors.reset}`, item.shippingInfo);
    }
  });
  
  console.log('\n═══════════════════════════════════════════════════════════════════════════\n');
  
  // Estadísticas
  const avgMargin = results.items
    .filter(i => i.profitMargin)
    .reduce((sum, i) => sum + i.profitMargin, 0) / results.items.length;
  
  const totalPotentialProfit = results.items
    .filter(i => i.potentialProfit)
    .reduce((sum, i) => sum + i.potentialProfit, 0);
  
  log(colors.cyan, '📈 ESTADÍSTICAS:');
  console.log(`  • Oportunidades encontradas: ${colors.green}${results.items.length}${colors.reset}`);
  
  if (avgMargin) {
    const marginColor = avgMargin > 30 ? colors.green : avgMargin > 15 ? colors.yellow : colors.red;
    console.log(`  • Margen promedio: ${marginColor}${avgMargin.toFixed(2)}%${colors.reset}`);
  }
  
  if (totalPotentialProfit) {
    console.log(`  • Ganancia potencial total: ${colors.green}$${totalPotentialProfit.toFixed(2)}${colors.reset}`);
  }
  
  const lowCompetition = results.items.filter(i => i.competitionLevel === 'LOW').length;
  const highDemand = results.items.filter(i => i.demandLevel === 'HIGH').length;
  
  if (lowCompetition > 0) {
    console.log(`  • Baja competencia: ${colors.green}${lowCompetition} productos${colors.reset}`);
  }
  
  if (highDemand > 0) {
    console.log(`  • Alta demanda: ${colors.green}${highDemand} productos${colors.reset}`);
  }
  
  console.log('');
}

async function testMultipleSearches(token) {
  const searches = [
    'wireless headphones',
    'smart watch',
    'phone accessories',
    'gaming mouse',
    'laptop stand'
  ];
  
  log(colors.cyan, '\n🔄 Probando múltiples búsquedas...\n');
  
  for (const query of searches) {
    try {
      log(colors.blue, `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      log(colors.magenta, `🔍 Búsqueda: "${query}"`);
      log(colors.blue, `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
      
      const results = await searchOpportunities(token, query);
      await displayResults(results);
      
      // Esperar 2 segundos entre búsquedas
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      log(colors.red, `❌ Error en búsqueda de "${query}":`, error.message);
    }
  }
}

async function main() {
  console.clear();
  
  log(colors.cyan, '╔════════════════════════════════════════════════════════════╗');
  log(colors.cyan, '║     🧪 TEST DE BÚSQUEDA DE OPORTUNIDADES REALES          ║');
  log(colors.cyan, '╚════════════════════════════════════════════════════════════╝');
  
  try {
    // Login
    const token = await login();
    
    // Preguntar qué tipo de test hacer
    const args = process.argv.slice(2);
    const query = args.join(' ');
    
    if (query) {
      // Búsqueda específica
      const results = await searchOpportunities(token, query);
      await displayResults(results);
    } else {
      // Múltiples búsquedas de prueba
      await testMultipleSearches(token);
    }
    
    log(colors.green, '\n✅ Test completado exitosamente\n');
    
  } catch (error) {
    log(colors.red, '\n❌ Error en el test:', error.message);
    if (error.response?.data) {
      console.log('\nDetalles:', error.response.data);
    }
    process.exit(1);
  }
}

// Verificar que el backend esté corriendo
async function checkBackend() {
  try {
    await axios.get(`${API_URL}/health`);
    return true;
  } catch (error) {
    log(colors.red, '\n❌ ERROR: El backend no está corriendo');
    log(colors.yellow, '\nPor favor inicia el backend primero:');
    log(colors.cyan, '  cd backend && npm run dev\n');
    return false;
  }
}

// Ejecutar
(async () => {
  const isRunning = await checkBackend();
  if (isRunning) {
    await main();
  } else {
    process.exit(1);
  }
})();
