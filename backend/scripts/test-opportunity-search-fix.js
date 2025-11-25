// Script para probar la búsqueda de oportunidades después de las correcciones
const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function testOpportunitySearch() {
  try {
    console.log('🧪 Probando búsqueda de oportunidades...\n');
    
    // 1. Login
    console.log('[1/3] 🔐 Login...');
    const loginRes = await axios.post(`${API_URL}/api/auth/login`, {
      email: 'admin@ivanreseller.com',
      password: 'admin123'
    });
    
    if (!loginRes.data.token) {
      throw new Error('No se obtuvo token de autenticación');
    }
    
    const token = loginRes.data.token;
    console.log('✅ Login exitoso\n');
    
    // 2. Buscar oportunidades
    const query = 'smartwatch';
    console.log(`[2/3] 🔍 Buscando oportunidades: "${query}"...`);
    console.log('⏳ Esto puede tardar varios minutos...\n');
    
    const searchRes = await axios.get(`${API_URL}/api/opportunities`, {
      headers: { 
        'Authorization': `Bearer ${token}` 
      },
      params: {
        query: query,
        maxItems: 5,
        marketplaces: 'ebay,amazon,mercadolibre',
        region: 'us',
        environment: 'sandbox'
      },
      timeout: 300000 // 5 minutos timeout
    });
    
    // 3. Mostrar resultados
    console.log('[3/3] 📊 Resultados:\n');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    const data = searchRes.data;
    
    if (!data.items || data.items.length === 0) {
      console.log('⚠️  No se encontraron oportunidades');
      if (data.debugInfo) {
        console.log('\n📋 Información de depuración:');
        console.log(JSON.stringify(data.debugInfo, null, 2));
      }
      return;
    }
    
    console.log(`✅ ${data.items.length} oportunidades encontradas:\n`);
    
    data.items.slice(0, 5).forEach((item, i) => {
      console.log(`${i + 1}. ${item.title?.substring(0, 60) || 'Sin título'}...`);
      console.log(`   💰 Costo: $${item.costUsd || item.cost || 'N/A'}`);
      console.log(`   💵 Precio sugerido: $${item.suggestedPriceUsd || item.suggestedPrice || 'N/A'}`);
      console.log(`   📈 ROI: ${item.roiPercentage || item.roi || 'N/A'}%`);
      console.log(`   🔗 URL: ${item.aliexpressUrl?.substring(0, 60) || 'N/A'}...`);
      console.log('');
    });
    
    console.log('✅ Búsqueda de oportunidades funcionando correctamente!\n');
    
  } catch (error) {
    console.error('\n❌ Error en la prueba:');
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Mensaje: ${JSON.stringify(error.response.data, null, 2)}`);
    } else if (error.request) {
      console.error('   No se recibió respuesta del servidor');
      console.error('   Verifica que el servidor esté corriendo en', API_URL);
    } else {
      console.error(`   ${error.message}`);
    }
    process.exit(1);
  }
}

testOpportunitySearch();

