# 📝 Aclaración: DATABASE_URL vs DATABASE_PUBLIC_URL

## ❓ ¿Necesitas ambas variables?

**Respuesta corta: NO, solo necesitas UNA de ellas.**

## 🔍 Cómo Funciona

El sistema busca automáticamente estas variables (en orden de prioridad):

1. ✅ `DATABASE_URL` (prioridad 1 - la más común)
2. ✅ `DATABASE_PUBLIC_URL` (prioridad 2 - Railway a veces usa este nombre)
3. `POSTGRES_URL`
4. `POSTGRES_PRISMA_URL`
5. `DATABASE_PRISMA_URL`
6. Y otras variantes...

**El sistema usará la PRIMERA que encuentre.**

## ✅ Recomendación

### Opción 1: Usar DATABASE_URL (Recomendado)

1. Ve a **Postgres** → **Variables**
2. Busca `DATABASE_URL`
3. Si existe, úsala
4. Configúrala en **ivan-reseller-web** → **Variables** como `DATABASE_URL`

### Opción 2: Usar DATABASE_PUBLIC_URL (Si DATABASE_URL no existe)

1. Ve a **Postgres** → **Variables**
2. Busca `DATABASE_PUBLIC_URL`
3. Si existe y `DATABASE_URL` no existe, úsala
4. Configúrala en **ivan-reseller-web** → **Variables** como `DATABASE_URL`
   - ⚠️ **Nota:** Configúrala con el nombre `DATABASE_URL`, pero usa el valor de `DATABASE_PUBLIC_URL`

## 🎯 Lo Importante

**Solo necesitas configurar UNA variable en ivan-reseller-web:**

- **Nombre de la variable:** `DATABASE_URL` (siempre este nombre)
- **Valor:** Puede venir de `DATABASE_URL` o `DATABASE_PUBLIC_URL` de Postgres

## 📋 Ejemplo Práctico

### Escenario 1: Postgres tiene DATABASE_URL
```
Postgres → Variables:
  DATABASE_URL = postgresql://postgres:xxx@host:5432/railway

ivan-reseller-web → Variables:
  DATABASE_URL = postgresql://postgres:xxx@host:5432/railway
  (mismo valor)
```

### Escenario 2: Postgres solo tiene DATABASE_PUBLIC_URL
```
Postgres → Variables:
  DATABASE_PUBLIC_URL = postgresql://postgres:xxx@host:5432/railway

ivan-reseller-web → Variables:
  DATABASE_URL = postgresql://postgres:xxx@host:5432/railway
  (usa el valor de DATABASE_PUBLIC_URL, pero con nombre DATABASE_URL)
```

## ⚠️ Importante

- **NO necesitas ambas variables**
- **Solo configura `DATABASE_URL` en ivan-reseller-web**
- **El valor puede venir de cualquier variable de Postgres, pero siempre configúralo como `DATABASE_URL`**

## 🔍 Verificación

El sistema te dirá qué variable está usando en los logs:

```
🔍 DATABASE_URL encontrada:
   Variable: DATABASE_URL
   postgresql://postgres:***@host:5432/railway
```

O si usa otra:

```
🔍 DATABASE_URL encontrada:
   Variable: DATABASE_PUBLIC_URL
   postgresql://postgres:***@host:5432/railway
```

---

## ✅ Resumen

- ✅ Solo necesitas **UNA** variable: `DATABASE_URL`
- ✅ El valor puede venir de `DATABASE_URL` o `DATABASE_PUBLIC_URL` de Postgres
- ✅ Siempre configúrala como `DATABASE_URL` en ivan-reseller-web
- ✅ El sistema la encontrará automáticamente

