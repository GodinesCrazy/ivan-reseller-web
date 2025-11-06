# 👤 CÓMO CREAR UN NUEVO USUARIO (ADMINISTRADOR)

## 📋 PASOS PARA CREAR UN NUEVO USUARIO

### **1. Acceder a la sección de Usuarios**

1. Inicia sesión como administrador con:
   - **Usuario:** `admin`
   - **Contraseña:** `admin123`

2. En el menú lateral izquierdo, busca y haz clic en **"Users"** (icono de dos personas 👥)

### **2. Abrir el modal de creación**

1. En la página de **"Users Management"**, verás un botón azul en la esquina superior derecha que dice **"New User"** (o **"Nuevo Usuario"**)
2. Haz clic en ese botón

### **3. Completar el formulario**

Se abrirá un modal con los siguientes campos:

#### **Campos obligatorios (*):**
- **Name** (Nombre): Nombre completo del usuario
- **Email**: Correo electrónico del usuario (debe ser único)
- **Password** (Contraseña): Contraseña temporal que el usuario deberá cambiar

#### **Campos opcionales:**
- **Phone** (Teléfono): Número de teléfono del usuario
- **Role** (Rol): 
  - `user` - Usuario normal (por defecto)
  - `admin` - Administrador
  - `viewer` - Solo lectura

### **4. Guardar el usuario**

1. Completa al menos los campos obligatorios (Name, Email, Password)
2. Selecciona el **Role** apropiado
3. Haz clic en el botón **"Create User"** (o **"Crear Usuario"**)

### **5. Confirmación**

- Si todo está correcto, verás un mensaje de éxito: **"User created successfully"**
- El nuevo usuario aparecerá en la lista de usuarios
- El usuario podrá iniciar sesión con el email y la contraseña que configuraste

---

## 🔐 INFORMACIÓN IMPORTANTE

### **Credenciales del nuevo usuario:**
- **Email**: El que ingresaste en el formulario
- **Password**: La contraseña temporal que configuraste
- **Recomendación**: El usuario debería cambiar su contraseña después del primer login

### **Roles disponibles:**
- **`user`**: Usuario normal con acceso completo a sus productos, ventas y comisiones
- **`admin`**: Administrador con acceso a todas las funciones, incluyendo gestión de usuarios
- **`viewer`**: Solo lectura, puede ver información pero no modificar

### **Gestión posterior:**
Una vez creado el usuario, puedes:
- **Ver detalles**: Haz clic en el nombre del usuario para ver su información completa
- **Editar**: Haz clic en el icono de editar (lápiz) para modificar sus datos
- **Activar/Desactivar**: Usa el botón de toggle para activar o desactivar el usuario
- **Eliminar**: Haz clic en el icono de eliminar (papelera) para desactivar el usuario

---

## ⚠️ TROUBLESHOOTING

### **Error: "Email already exists"**
- El email ya está en uso por otro usuario
- Usa un email diferente

### **Error: "Password too short"**
- La contraseña debe tener al menos 6 caracteres
- Usa una contraseña más larga

### **Error: "Access denied"**
- Solo los administradores pueden crear usuarios
- Verifica que estés logueado como `admin`

---

## 📸 UBICACIÓN EN LA INTERFAZ

```
Menú Lateral → Users → Botón "New User" (esquina superior derecha)
```

---

**¡Listo! Ya puedes crear usuarios desde el panel de administración.** 🎉

