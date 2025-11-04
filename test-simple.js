// Test simple de oportunidades usando fetch nativo
console.log('\n🧪 TEST DE BÚSQUEDA DE OPORTUNIDADES\n');

const API_URL = 'http://localhost:3000';

async function test() {
  try {
    // 1. Login
    console.log('[1/2] 🔐 Login...');
    const loginRes = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@ivanreseller.com',
        password: 'admin123'
      })
    });
    
    if (!loginRes.ok) {
      throw new Error(`Login failed: ${loginRes.status}`);
    }
    
    const { token } = await loginRes.json();
    console.log('✅ Login exitoso\n');
    
    // 2. Buscar oportunidades
    const query = process.argv[2] || 'wireless headphones';
    console.log(`[2/2] 🔍 Buscando: "${query}"...\n`);
    
    const searchRes = await fetch(`${API_URL}/api/opportunities?query=${encodeURIComponent(query)}&maxItems=5`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!searchRes.ok) {
      throw new Error(`Search failed: ${searchRes.status}`);
    }
    
    const data = await searchRes.json();
    
    // 3. Mostrar resultados
    console.log('═══════════════════════════════════════════════════════════\n');
    
    if (!data.items || data.items.length === 0) {
      console.log('⚠️  No se encontraron oportunidades\n');
      return;
    }
    
    console.log(`✅ ${data.items.length} oportunidades encontradas:\n`);
    
    data.items.forEach((item, i) => {
      console.log(`${i+1}. ${item.title || 'Sin título'}`);
      if (item.aliexpressPrice) console.log(`   💰 Precio AliExpress: $${item.aliexpressPrice.toFixed(2)}`);
      if (item.suggestedPrice) console.log(`   💵 Precio Sugerido: $${item.suggestedPrice.toFixed(2)}`);
      if (item.profitMargin) console.log(`   📈 Margen: ${item.profitMargin.toFixed(1)}%`);
      if (item.potentialProfit) console.log(`   💸 Ganancia: $${item.potentialProfit.toFixed(2)}`);
      console.log('');
    });
    
    console.log('✅ Test completado\n');
    
  } catch (error) {
    console.log('\n❌ Error:', error.message);
    console.log('\n💡 Asegúrate de que el backend esté corriendo:');
    console.log('   cd backend && npm run dev\n');
    process.exit(1);
  }
}

test();
