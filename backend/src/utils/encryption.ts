import crypto from 'crypto';

const algorithm = 'aes-256-cbc';
const keyLength = 32;
const ivLength = 16;

// Obtener clave de encriptación de forma segura
const getEncryptionKey = (): Buffer => {
  // En producción, ENCRYPTION_KEY es obligatoria (validada en env.ts)
  // En desarrollo, si no está configurada, falla con error claro
  const key = process.env.ENCRYPTION_KEY?.trim() || process.env.JWT_SECRET?.trim();
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  if (!key || key.length < 32) {
    if (nodeEnv === 'production') {
      throw new Error('ENCRYPTION_KEY debe estar configurada en producción (mínimo 32 caracteres)');
    }
    // En desarrollo, generar una clave temporal pero avisar
    console.warn('⚠️ ENCRYPTION_KEY no configurada. Usando clave temporal de desarrollo. NO usar en producción.');
    const tempKey = crypto.randomBytes(keyLength).toString('hex');
    const salt = process.env.ENCRYPTION_SALT || 'ivanreseller-dev-salt';
    return crypto.scryptSync(tempKey, salt, keyLength);
  }
  
  // Salt configurable o default seguro
  const salt = process.env.ENCRYPTION_SALT || 'ivanreseller-production-salt-v1';
  
  if (nodeEnv === 'production' && salt === 'ivanreseller-production-salt-v1') {
    console.warn('⚠️ Usando salt por defecto. Se recomienda configurar ENCRYPTION_SALT único.');
  }
  
  return crypto.scryptSync(key, salt, keyLength);
};

export const encrypt = (text: string): string => {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(ivLength);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    throw new Error('Error al encriptar datos');
  }
};

export const decrypt = (encryptedText: string): string => {
  try {
    const key = getEncryptionKey();
    const parts = encryptedText.split(':');
    
    if (parts.length !== 2) {
      throw new Error('Formato de texto encriptado inválido');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv(algorithm, key, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new Error('Error al desencriptar datos');
  }
};

