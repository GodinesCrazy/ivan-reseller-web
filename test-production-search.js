/**
 * Script para probar búsqueda de oportunidades en producción
 * Ejecutar desde el directorio raíz: node test-production-search.js
 */

const axios = require('axios');

const BACKEND_URLS = [
  'https://www.ivanreseller.com',
  'https://ivan-reseller-web-production.up.railway.app',
  'http://localhost:3001'
];

async function testOpportunitySearch() {
  console.log('🔍 Iniciando prueba de búsqueda de oportunidades en producción...\n');

  let loginResponse = null;
  let token = null;

  // 1. Intentar login
  for (const baseUrl of BACKEND_URLS) {
    try {
      console.log(`📡 Intentando login en: ${baseUrl}/api/auth/login`);
      
      const loginData = {
        username: process.env.ADMIN_USERNAME || 'admin',
        password: process.env.ADMIN_PASSWORD || 'admin123'
      };

      loginResponse = await axios.post(`${baseUrl}/api/auth/login`, loginData, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
        validateStatus: (status) => status < 500 // Aceptar 200-499
      });

      if (loginResponse.status === 200) {
        // Intentar diferentes formatos de respuesta
        token = loginResponse.data.token || 
                loginResponse.data.data?.token ||
                loginResponse.headers['set-cookie']?.[0]?.split('token=')[1]?.split(';')[0] ||
                null;
        
        // Si no hay token en la respuesta, verificar cookies
        if (!token) {
          const cookies = loginResponse.headers['set-cookie'] || [];
          for (const cookie of cookies) {
            if (cookie.includes('token=')) {
              token = cookie.split('token=')[1].split(';')[0];
              break;
            }
          }
        }
        
        if (token) {
          console.log(`✅ Login exitoso en: ${baseUrl}`);
          console.log(`   Token recibido: ${token.substring(0, 20)}...\n`);
          break;
        } else {
          console.log(`⚠️  Login exitoso pero no se encontró token en la respuesta`);
          console.log(`   Respuesta:`, JSON.stringify(loginResponse.data).substring(0, 300));
          console.log(`   Intentando continuar sin token explícito (usando cookies)...\n`);
          // Guardar baseUrl para usar cookies
          break;
        }
      } else {
        console.log(`❌ Login falló con status ${loginResponse.status}`);
        if (loginResponse.data) {
          console.log(`   Respuesta:`, JSON.stringify(loginResponse.data).substring(0, 200));
        }
      }
    } catch (error) {
      if (error.response) {
        console.log(`❌ Error HTTP ${error.response.status}: ${error.response.statusText}`);
        if (error.response.data) {
          console.log(`   Mensaje:`, JSON.stringify(error.response.data).substring(0, 200));
        }
      } else if (error.request) {
        console.log(`❌ No se recibió respuesta de ${baseUrl}`);
      } else {
        console.log(`❌ Error de configuración: ${error.message}`);
      }
      console.log('');
    }
  }

  // 2. Buscar oportunidades
  const baseUrl = loginResponse ? loginResponse.config.url.split('/api')[0] : BACKEND_URLS[1];
  const searchQuery = 'gaming headset';
  
  console.log(`🔎 Buscando oportunidades para: "${searchQuery}"`);
  console.log(`📡 URL: ${baseUrl}/api/opportunities?query=${encodeURIComponent(searchQuery)}&maxItems=5\n`);

  try {
    // Construir headers con token o cookies
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (loginResponse && loginResponse.headers['set-cookie']) {
      // Usar cookies si no hay token
      headers['Cookie'] = loginResponse.headers['set-cookie'].join('; ');
    } else {
      console.error('❌ No se pudo obtener token ni cookies de autenticación.');
      console.error('   Verifica las credenciales y configuración del servidor.');
      process.exit(1);
    }

    const searchResponse = await axios.get(`${baseUrl}/api/opportunities`, {
      params: {
        query: searchQuery,
        maxItems: 5,
        marketplaces: ['ebay', 'amazon', 'mercadolibre']
      },
      headers,
      timeout: 180000, // 3 minutos para búsqueda completa
      withCredentials: true // Incluir cookies automáticamente
    });

    if (searchResponse.status === 200) {
      const data = searchResponse.data;
      
      if (data.success && data.items && data.items.length > 0) {
        console.log(`✅ Búsqueda exitosa! Se encontraron ${data.items.length} oportunidades:\n`);
        
        data.items.forEach((item, index) => {
          console.log(`   ${index + 1}. ${item.title?.substring(0, 70)}...`);
          console.log(`      Costo AliExpress: $${item.costUsd?.toFixed(2) || 'N/A'} ${item.costCurrency || 'USD'}`);
          console.log(`      Precio Sugerido: $${item.suggestedPriceUsd?.toFixed(2) || 'N/A'} ${item.suggestedPriceCurrency || 'USD'}`);
          console.log(`      Margen: ${((item.profitMargin || 0) * 100).toFixed(2)}%`);
          console.log(`      ROI: ${item.roiPercentage?.toFixed(2) || 'N/A'}%`);
          if (item.estimationNotes && item.estimationNotes.length > 0) {
            console.log(`      Notas: ${item.estimationNotes.join('; ')}`);
          }
          console.log('');
        });
        
        if (data.debug) {
          console.log('📊 Información de debug:');
          console.log(JSON.stringify(data.debug, null, 2));
        }
      } else {
        console.log(`⚠️  Búsqueda completada pero no se encontraron oportunidades.`);
        
        if (data.debug) {
          console.log('\n📊 Información de debug:');
          console.log(JSON.stringify(data.debug, null, 2));
        }
        
        if (data.items && data.items.length === 0) {
          console.log('\n💡 Posibles causas:');
          console.log('   - AliExpress puede estar bloqueando el scraping (CAPTCHA o rate limiting)');
          console.log('   - La sesión de AliExpress puede haber expirado');
          console.log('   - El término de búsqueda puede no tener resultados');
          console.log('   - Verifica la configuración de AliExpress en API Settings');
        }
      }
    } else {
      console.error(`❌ Búsqueda falló con status ${searchResponse.status}`);
      if (searchResponse.data) {
        console.error('   Respuesta:', JSON.stringify(searchResponse.data, null, 2));
      }
    }
  } catch (error) {
    if (error.response) {
      console.error(`❌ Error HTTP ${error.response.status}: ${error.response.statusText}`);
      if (error.response.data) {
        console.error('   Respuesta:', JSON.stringify(error.response.data, null, 2));
        
        // Manejar error de autenticación manual
        if (error.response.status === 428 && error.response.data.error === 'manual_login_required') {
          console.log('\n🔐 Se requiere autenticación manual de AliExpress:');
          console.log(`   Token: ${error.response.data.token}`);
          console.log(`   URL manual: ${error.response.data.manualUrl || 'N/A'}`);
          console.log(`   URL de login: ${error.response.data.loginUrl || 'N/A'}`);
          console.log(`   Expira: ${error.response.data.expiresAt || 'N/A'}`);
        }
      }
    } else if (error.request) {
      console.error('❌ No se recibió respuesta del servidor');
      console.error('   Timeout esperado para búsquedas largas (>3 min)');
    } else {
      console.error(`❌ Error: ${error.message}`);
    }
  }
}

testOpportunitySearch().catch(console.error);
