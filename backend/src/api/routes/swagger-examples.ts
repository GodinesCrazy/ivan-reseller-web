// ✅ E8: Ejemplos de documentación Swagger para endpoints principales
// Este archivo contiene ejemplos de cómo documentar endpoints con Swagger
// Los ejemplos están organizados por categoría

/**
 * EJEMPLOS DE DOCUMENTACIÓN SWAGGER
 * 
 * Copia y adapta estos ejemplos en tus archivos de rutas
 */

// ==========================================
// EJEMPLO 1: GET Simple
// ==========================================
/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Listar productos
 *     description: Obtiene lista de productos del usuario autenticado. Admins ven todos los productos.
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, APPROVED, REJECTED, PUBLISHED]
 *         description: Filtrar por estado
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Items por página
 *     responses:
 *       200:
 *         description: Lista de productos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 products:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Product'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

// ==========================================
// EJEMPLO 2: POST con Body
// ==========================================
/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Crear producto
 *     description: Crea un nuevo producto para el usuario autenticado
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - aliexpressUrl
 *               - aliexpressPrice
 *               - suggestedPrice
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 200
 *                 example: "Wireless Earbuds"
 *               aliexpressUrl:
 *                 type: string
 *                 format: uri
 *                 example: "https://aliexpress.com/item/123456"
 *               aliexpressPrice:
 *                 type: number
 *                 minimum: 0
 *                 example: 15.99
 *               suggestedPrice:
 *                 type: number
 *                 minimum: 0
 *                 example: 29.99
 *               description:
 *                 type: string
 *                 example: "High quality wireless earbuds"
 *     responses:
 *       201:
 *         description: Producto creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 product:
 *                   $ref: '#/components/schemas/Product'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */

// ==========================================
// EJEMPLO 3: PUT/PATCH con Path Parameter
// ==========================================
/**
 * @swagger
 * /api/products/{id}:
 *   put:
 *     summary: Actualizar producto
 *     description: Actualiza un producto existente. Solo el propietario o admin pueden actualizar.
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del producto
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               suggestedPrice:
 *                 type: number
 *     responses:
 *       200:
 *         description: Producto actualizado
 *       403:
 *         description: No tienes permiso para actualizar este producto
 *       404:
 *         description: Producto no encontrado
 */

// ==========================================
// EJEMPLO 4: DELETE
// ==========================================
/**
 * @swagger
 * /api/products/{id}:
 *   delete:
 *     summary: Eliminar producto
 *     description: Elimina un producto. No se puede eliminar si tiene ventas asociadas.
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Producto eliminado exitosamente
 *       400:
 *         description: No se puede eliminar producto con ventas
 *       403:
 *         description: No tienes permiso
 *       404:
 *         description: Producto no encontrado
 */

// ==========================================
// NOTA: Estos son solo ejemplos de formato
// Copia y adapta según tus endpoints específicos
// ==========================================

