# 🔧 CORREGIR CONFIGURACIÓN VERCEL - PASO A PASO

**Problema identificado:**
1. Production Overrides tiene configuración antigua
2. Los comandos tienen `cd frontend` cuando NO deberían (Root Directory ya está en `frontend`)

---

## 🎯 SOLUCIÓN: CORREGIR PROJECT SETTINGS

### **PASO 1: CORREGIR BUILD COMMAND**

En la sección **"Project Settings"**:

1. Busca **"Build Command"**
2. Actualmente dice: `cd frontend && npm install && npm ru...`
3. **Cámbialo a:** `npm install && npm run build`
4. **Mantén el toggle "Override" ON** (azul)

---

### **PASO 2: CORREGIR OUTPUT DIRECTORY**

1. Busca **"Output Directory"**
2. Actualmente dice: `frontend/dist`
3. **Cámbialo a:** `dist`
4. **Mantén el toggle "Override" ON** (azul)

---

### **PASO 3: CORREGIR INSTALL COMMAND**

1. Busca **"Install Command"**
2. Actualmente dice: `cd frontend && npm install`
3. **Cámbialo a:** `npm install`
4. **Mantén el toggle "Override" ON** (azul)

---

### **PASO 4: VERIFICAR ROOT DIRECTORY**

1. **Root Directory** debe decir: `frontend` ✅ (ya está correcto)

---

### **PASO 5: GUARDAR**

1. Click en el botón **"Save"** (arriba a la derecha)
2. Espera a que guarde

---

## 🎯 DESPUÉS DE GUARDAR

### **Opción A: Redesplegar manualmente**

1. Ve a **Deployments**
2. Click en los **tres puntos** (⋯) del deployment actual
3. Selecciona **"Redeploy"**

### **Opción B: Hacer un nuevo commit**

Vercel detectará automáticamente y redesplegará con la nueva configuración.

---

## ✅ VALORES CORRECTOS FINALES

**Root Directory:** `frontend`

**Build Command:** `npm install && npm run build`

**Output Directory:** `dist`

**Install Command:** `npm install`

**IMPORTANTE:** NO incluir `cd frontend` porque Root Directory ya está configurado como `frontend`.

---

**¡Sigue estos pasos y corrige los comandos!** 🚀

