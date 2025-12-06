# Probar Conexión con VPN

Si el diagnóstico muestra problemas de conectividad, probar con VPN puede ayudar a identificar si el problema es de restricciones geográficas o de red.

## Opciones de VPN Gratis

### 1. ProtonVPN (Recomendado)
- ✅ Gratis sin límite de datos
- ✅ Sin registro de datos
- ✅ Fácil de usar

**Descargar:** https://protonvpn.com/download

### 2. Windscribe
- ✅ 10GB gratis por mes
- ✅ Buena velocidad

**Descargar:** https://windscribe.com/

## Pasos para Probar

1. **Instalar VPN**
2. **Conectar a un servidor** (cualquier país debería funcionar)
3. **Ejecutar diagnóstico:**
   ```bash
   npm run diagnose:connectivity
   ```
4. **Si funciona con VPN:**
   - El problema es de restricciones de red local
   - Considera usar VPN para desarrollo
   - O cambiar de proveedor de internet

## Solución Permanente con VPN

Si decides usar VPN permanentemente para desarrollo:

### Opción 1: VPN a nivel de sistema (Recomendado)
- Configurar VPN en Windows
- Todas las conexiones pasan por VPN
- No requiere cambios en el código

### Opción 2: Proxy HTTP con VPN
```bash
# Configurar proxy del VPN en .env
HTTPS_PROXY=http://127.0.0.1:PUERTO_VPN
```

**Nota:** La mayoría de VPNs modernos funcionan a nivel de sistema, no necesitas configurar proxy.

