# Instrucciones para Actualizar GitHub Manualmente

Si GitHub no se ha actualizado automáticamente, ejecuta estos comandos en tu terminal:

## Pasos a seguir:

1. **Abre PowerShell o CMD en la carpeta del proyecto:**
   ```powershell
   cd C:\Ivan_Reseller_Web
   ```

2. **Verifica el estado actual:**
   ```powershell
   git status
   ```

3. **Agrega los archivos modificados:**
   ```powershell
   git add backend/src/services/marketplace.service.ts
   git add frontend/src/pages/ProductPreview.tsx
   git add backend/src/services/__tests__/marketplace-multi-image.test.ts
   git add MULTI_IMAGE_PUBLISHING_FIX.md
   ```

4. **Crea el commit:**
   ```powershell
   git commit -m "feat: Implementar publicación multi-imagen en marketplaces" -m "- Agregar límites por marketplace (eBay: 12, MercadoLibre: 10, Amazon: 9)" -m "- Implementar prepareImagesForMarketplace() con logging" -m "- Mejorar vista previa con galería navegable" -m "- Agregar tests unitarios" -m "- Documentación completa"
   ```

5. **Haz push a GitHub:**
   ```powershell
   git push origin main
   ```

6. **Verifica que se haya actualizado:**
   ```powershell
   git log --oneline -3
   ```

## Archivos que deben estar en el commit:

- ✅ `backend/src/services/marketplace.service.ts` - Con métodos `prepareImagesForMarketplace()` y `getMarketplaceImageLimit()`
- ✅ `frontend/src/pages/ProductPreview.tsx` - Con componente `ImageGallery`
- ✅ `backend/src/services/__tests__/marketplace-multi-image.test.ts` - Tests unitarios
- ✅ `MULTI_IMAGE_PUBLISHING_FIX.md` - Documentación

## Si hay problemas:

- **Si dice "nothing to commit"**: Los cambios ya están commiteados, solo necesitas hacer `git push origin main`
- **Si hay conflictos**: Resuélvelos primero con `git pull origin main` y luego vuelve a intentar
- **Si no tienes permisos**: Verifica que tengas acceso de escritura al repositorio

## Verificar en GitHub:

Después del push, verifica en https://github.com/GodinesCrazy/ivan-reseller-web que el commit aparezca en la rama `main`.

