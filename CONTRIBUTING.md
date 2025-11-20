# 🤝 GUÍA DE CONTRIBUCIÓN - IVAN RESELLER WEB

**Bienvenido al proyecto Ivan Reseller Web!** 🚀

Esta guía te ayudará a contribuir al proyecto de manera efectiva.

---

## 📋 TABLA DE CONTENIDOS

1. [Código de Conducta](#código-de-conducta)
2. [Configuración del Entorno](#configuración-del-entorno)
3. [Proceso de Contribución](#proceso-de-contribución)
4. [Estándares de Código](#estándares-de-código)
5. [Tests](#tests)
6. [Documentación](#documentación)
7. [Pull Requests](#pull-requests)

---

## 📜 CÓDIGO DE CONDUCTA

### Principios
- **Respeto:** Trata a todos con respeto y profesionalismo
- **Colaboración:** Trabajamos juntos hacia objetivos comunes
- **Calidad:** Priorizamos código limpio, documentado y testeado
- **Comunicación:** Comunica cambios grandes antes de implementarlos

---

## 🛠️ CONFIGURACIÓN DEL ENTORNO

### Prerrequisitos

- **Node.js** 20+ y **npm** 9+
- **PostgreSQL** 16+ o Docker
- **Redis** (opcional, para BullMQ)
- **Git**

### Setup Inicial

```bash
# 1. Clonar repositorio
git clone https://github.com/yourusername/ivan-reseller-web.git
cd ivan-reseller-web

# 2. Instalar dependencias
cd backend && npm install
cd ../frontend && npm install

# 3. Configurar variables de entorno
cp backend/.env.example backend/.env
# Editar backend/.env con tus credenciales

# 4. Configurar base de datos
cd backend
npx prisma generate
npx prisma migrate dev
npx prisma db seed

# 5. Iniciar desarrollo
npm run dev  # Backend
cd ../frontend && npm run dev  # Frontend
```

**Más información:** Ver `README.md` y `ENV_VARIABLES_DOCUMENTATION.md`

---

## 🔄 PROCESO DE CONTRIBUCIÓN

### 1. Crear una Issue

Antes de hacer cambios grandes:
- ✅ Crear una issue describiendo el problema o mejora
- ✅ Discutir la solución propuesta
- ✅ Esperar aprobación antes de empezar

### 2. Crear una Branch

```bash
# Crear branch desde main
git checkout main
git pull origin main
git checkout -b feature/nombre-de-tu-feature

# O para bugfix:
git checkout -b fix/nombre-del-bug
```

**Convención de nombres:**
- `feature/nombre` - Nueva funcionalidad
- `fix/nombre` - Corrección de bugs
- `refactor/nombre` - Refactorización
- `docs/nombre` - Documentación
- `test/nombre` - Tests

### 3. Hacer Cambios

- ✅ Hacer cambios pequeños y enfocados
- ✅ Seguir estándares de código (ver abajo)
- ✅ Escribir tests para nuevos cambios
- ✅ Actualizar documentación si es necesario

### 4. Commit

```bash
git add .
git commit -m "tipo: descripción clara y concisa"
```

**Formato de commits (Conventional Commits):**
- `feat: agregar nueva funcionalidad`
- `fix: corregir bug en login`
- `refactor: mejorar estructura de servicios`
- `docs: actualizar README`
- `test: agregar tests para ProductService`
- `chore: actualizar dependencias`

**Ejemplos:**
```bash
git commit -m "feat: agregar filtrado por usuario en productos"
git commit -m "fix: corregir cálculo de comisiones"
git commit -m "docs: actualizar guía de instalación"
```

### 5. Push y Pull Request

```bash
git push origin feature/nombre-de-tu-feature
```

Luego crear Pull Request en GitHub con:
- ✅ Descripción clara del cambio
- ✅ Referencia a issue relacionada (si aplica)
- ✅ Lista de cambios realizados
- ✅ Evidencia de tests pasando

---

## 📐 ESTÁNDARES DE CÓDIGO

### TypeScript

- ✅ **Usar tipos explícitos** - Evitar `any`
- ✅ **No usar `@ts-nocheck`** - Corregir tipos en su lugar
- ✅ **Usar interfaces para objetos complejos**
- ✅ **Validar con Zod** para datos externos

**Bueno:**
```typescript
interface UserData {
  id: number;
  username: string;
  email: string;
}

function createUser(data: UserData): Promise<User> {
  // ...
}
```

**Evitar:**
```typescript
function createUser(data: any): any {
  // ...
}
```

### Naming Conventions

- ✅ **Variables/Funciones:** `camelCase` (ej: `getUserById`)
- ✅ **Clases:** `PascalCase` (ej: `ProductService`)
- ✅ **Constantes:** `UPPER_SNAKE_CASE` (ej: `MAX_RETRIES`)
- ✅ **Archivos:** `kebab-case` o `camelCase` (ej: `user.service.ts`)

### Estructura de Archivos

**Backend:**
```
backend/src/
├── api/
│   └── routes/      # Rutas API
├── services/        # Lógica de negocio
├── middleware/      # Middleware Express
├── config/          # Configuración
└── utils/           # Utilidades
```

**Frontend:**
```
frontend/src/
├── pages/           # Páginas/Views
├── components/      # Componentes React
├── services/        # Servicios API
├── stores/          # State management (Zustand)
└── utils/           # Utilidades
```

### Validación

- ✅ **Backend:** Usar Zod para validar inputs
- ✅ **Frontend:** Validar con Zod + React Hook Form
- ✅ **Errores claros:** Mensajes descriptivos para usuarios

**Ejemplo:**
```typescript
import { z } from 'zod';

const createProductSchema = z.object({
  title: z.string().min(1).max(200),
  aliexpressPrice: z.number().positive(),
  suggestedPrice: z.number().positive(),
});

// En route handler
const validated = createProductSchema.parse(req.body);
```

### Manejo de Errores

- ✅ **Usar AppError** para errores conocidos
- ✅ **Códigos de error consistentes** (ver `ErrorCode` enum)
- ✅ **Logging estructurado** con contexto
- ✅ **No exponer detalles internos** al cliente

**Ejemplo:**
```typescript
import { AppError, ErrorCode } from '../middleware/error.middleware';

if (!product) {
  throw new AppError('Product not found', 404, ErrorCode.PRODUCT_NOT_FOUND);
}
```

---

## ✅ TESTS

### E6: Tests Unitarios

**Ubicación:** `backend/src/__tests__/services/`

**Ejemplo:**
```typescript
describe('ProductService', () => {
  it('should create product successfully', async () => {
    // Arrange
    const productData = { /* ... */ };
    
    // Act
    const result = await productService.createProduct(userId, productData);
    
    // Assert
    expect(result).toBeDefined();
    expect(result.title).toBe(productData.title);
  });
});
```

### E7: Tests de Integración

**Ubicación:** `backend/src/__tests__/integration/`

**Ejemplo:**
```typescript
describe('POST /api/products', () => {
  it('should create product via API', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send(productData);
    
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});
```

### Ejecutar Tests

```bash
# Backend
cd backend
npm test              # Todos los tests
npm test -- --watch   # Watch mode
npm test -- --coverage # Con cobertura

# Frontend
cd frontend
npm test              # Todos los tests
npm test -- --ui      # UI mode
npm test -- --coverage # Con cobertura
```

### Cobertura Mínima

- ✅ **Servicios críticos:** 80%+
- ✅ **Rutas API:** 70%+
- ✅ **Componentes React:** 60%+

---

## 📚 DOCUMENTACIÓN

### E8: Swagger/OpenAPI

Documentar endpoints con JSDoc:

```typescript
/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Create a new product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateProductDto'
 *     responses:
 *       201:
 *         description: Product created successfully
 */
router.post('/', authenticate, async (req, res) => {
  // ...
});
```

**Ver documentación:** `http://localhost:3000/api-docs`

### JSDoc para Servicios

```typescript
/**
 * Servicio de gestión de productos
 * 
 * @class ProductService
 */
export class ProductService {
  /**
   * Crear un nuevo producto
   * 
   * @param {number} userId - ID del usuario propietario
   * @param {CreateProductDto} data - Datos del producto
   * @returns {Promise<Product>} Producto creado
   * @throws {AppError} Si los datos son inválidos
   * 
   * @example
   * const product = await productService.createProduct(1, {
   *   title: 'Product Name',
   *   aliexpressPrice: 10.99,
   *   suggestedPrice: 19.99
   * });
   */
  async createProduct(userId: number, data: CreateProductDto): Promise<Product> {
    // ...
  }
}
```

---

## 🔍 PULL REQUESTS

### Checklist antes de PR

- ✅ Código sigue estándares del proyecto
- ✅ Tests pasan (unitarios e integración)
- ✅ Nueva funcionalidad tiene tests
- ✅ Documentación actualizada (Swagger, JSDoc)
- ✅ No hay `console.log` o código de debug
- ✅ No hay `@ts-nocheck` (excepto casos justificados)
- ✅ Variables de entorno documentadas (si se agregan nuevas)
- ✅ Sin warnings de linter
- ✅ Commit messages siguen convención

### Template de PR

```markdown
## Descripción
Breve descripción de los cambios realizados.

## Tipo de cambio
- [ ] Bug fix
- [ ] Nueva funcionalidad
- [ ] Refactorización
- [ ] Documentación
- [ ] Tests

## Checklist
- [ ] Tests pasan
- [ ] Documentación actualizada
- [ ] Sin breaking changes (o documentados)

## Screenshots (si aplica)
...

## Referencias
Closes #issue_number
```

---

## 🐛 REPORTAR BUGS

### Template de Issue

```markdown
## Descripción
Descripción clara del bug.

## Pasos para reproducir
1. ...
2. ...

## Comportamiento esperado
...

## Comportamiento actual
...

## Ambiente
- OS: [ej: Windows 11]
- Node.js: [ej: 20.10.0]
- Navegador: [ej: Chrome 120]

## Logs/Errores
...
```

---

## 💡 PROPUESTAS DE MEJORA

### Template de Feature Request

```markdown
## Descripción
Descripción clara de la funcionalidad propuesta.

## Problema que resuelve
...

## Solución propuesta
...

## Alternativas consideradas
...

## Impacto
- Usuarios afectados
- Cambios necesarios
- Breaking changes?
```

---

## 📞 CONTACTO

- **Email:** support@ivanreseller.com
- **Documentación:** Ver `README.md`
- **Variables de entorno:** Ver `ENV_VARIABLES_DOCUMENTATION.md`

---

## ✅ RECURSOS ADICIONALES

- [Guía de Testing](./GUIA_TESTING_SISTEMAS.md)
- [Documentación de APIs](./AUDITORIA_SECCION_2_BACKEND_APIS.md)
- [Código Muerto/Deprecado](./CODIGO_MUERTO_DEPRECADO.md)

---

**¡Gracias por contribuir! 🎉**

---

**Última actualización:** 2025-01-11

