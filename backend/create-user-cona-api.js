/**
 * Script para crear usuario cona usando la API del backend
 * 
 * Uso:
 * 1. Asegúrate de que el backend esté corriendo
 * 2. Ejecuta: node create-user-cona-api.js
 * 
 * O usa curl:
 * curl -X POST https://ivan-reseller-web-production.up.railway.app/api/admin/users \
 *   -H "Content-Type: application/json" \
 *   -H "Authorization: Bearer TU_TOKEN_ADMIN" \
 *   -d '{
 *     "username": "cona",
 *     "email": "csantamariascheel@gmail.com",
 *     "password": "cona123",
 *     "role": "USER",
 *     "commissionRate": 0.20,
 *     "fixedMonthlyCost": 0.0
 *   }'
 */

const API_URL = process.env.API_URL || 'https://ivan-reseller-web-production.up.railway.app';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';

async function createUserCona() {
  try {
    console.log('🔐 Paso 1: Autenticando como admin...');
    
    // 1. Login como admin
    const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
      }),
    });

    if (!loginResponse.ok) {
      const error = await loginResponse.json();
      throw new Error(`Login failed: ${error.message || loginResponse.statusText}`);
    }

    const loginData = await loginResponse.json();
    const token = loginData.data.token;

    console.log('✅ Autenticación exitosa');
    console.log('');

    console.log('👤 Paso 2: Creando usuario cona...');

    // 2. Crear usuario cona
    const createResponse = await fetch(`${API_URL}/api/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        username: 'cona',
        email: 'csantamariascheel@gmail.com',
        password: 'cona123',
        role: 'USER',
        commissionRate: 0.20, // 20%
        fixedMonthlyCost: 0.0, // $0 USD
      }),
    });

    const result = await createResponse.json();

    if (!createResponse.ok) {
      if (result.message?.includes('ya existe') || result.message?.includes('already exists')) {
        console.log('⚠️  Usuario ya existe, actualizando datos...');
        
        // Obtener lista de usuarios para encontrar el ID
        const usersResponse = await fetch(`${API_URL}/api/admin/users`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        const usersData = await usersResponse.json();
        const existingUser = usersData.users?.find(
          u => u.username === 'cona' || u.email === 'csantamariascheel@gmail.com'
        );

        if (existingUser) {
          // Actualizar comisiones
          const updateResponse = await fetch(`${API_URL}/api/admin/users/${existingUser.id}/commissions`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              userId: existingUser.id,
              commissionRate: 0.20,
              fixedMonthlyCost: 0.0,
              paymentDay: 1,
              autoPayment: true,
            }),
          });

          if (updateResponse.ok) {
            console.log('✅ Usuario actualizado exitosamente!');
          } else {
            console.log('⚠️  No se pudo actualizar, pero el usuario existe');
          }
        }
      } else {
        throw new Error(result.message || 'Error creando usuario');
      }
    } else {
      console.log('✅ Usuario cona creado exitosamente!');
      console.log('');
      console.log('📋 CREDENCIALES:');
      console.log('   Username: cona');
      console.log('   Email: csantamariascheel@gmail.com');
      console.log('   Password: cona123');
      console.log('   Role: USER');
      console.log('   Commission Rate: 20% (sobre utilidad de operación exitosa)');
      console.log('   Fixed Monthly Cost: $0 USD');
      console.log('');
      console.log('🌐 URL de acceso:', result.data?.accessUrl || `${API_URL.replace('/api', '')}/login`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createUserCona();

