/**
 * ✅ MEJORA UX: Mapeo de errores comunes a mensajes accionables
 * Convierte errores técnicos en mensajes claros con soluciones sugeridas
 */

export interface ErrorSolution {
  message: string;
  solution: string;
  link?: string;
  code?: string;
}

export const ERROR_MESSAGES: Record<string, ErrorSolution> = {
  // Errores de credenciales
  'INVALID_CREDENTIALS': {
    message: 'Las credenciales proporcionadas no son válidas',
    solution: 'Verifica que hayas copiado correctamente todos los campos. Asegúrate de no incluir espacios adicionales al inicio o final.',
    link: '/help/api-credentials',
  },
  'MISSING_CREDENTIALS': {
    message: 'Faltan credenciales requeridas',
    solution: 'Completa todos los campos marcados como requeridos (*) antes de guardar.',
  },
  'INVALID_APP_ID_FORMAT': {
    message: 'El formato del App ID no es válido',
    solution: 'El App ID debe coincidir exactamente con el registrado en el portal del desarrollador. Verifica que no haya espacios ni caracteres adicionales.',
    link: '/help/ebay-credentials',
  },
  
  // Errores de OAuth
  'OAUTH_FAILED': {
    message: 'No se pudo completar la autorización OAuth',
    solution: 'Asegúrate de haber completado el flujo en la ventana de autorización. Si la ventana se cerró, intenta nuevamente.',
    link: '/help/oauth',
  },
  'OAUTH_CANCELLED': {
    message: 'La autorización OAuth fue cancelada',
    solution: 'Debes completar el proceso de autorización para continuar. Haz clic en "Iniciar OAuth" nuevamente.',
  },
  'OAUTH_EXPIRED': {
    message: 'El token OAuth ha expirado',
    solution: 'Necesitas reautorizar. Haz clic en "Iniciar OAuth" para obtener un nuevo token.',
  },
  'OAUTH_BLOCKED': {
    message: 'La ventana de OAuth fue bloqueada',
    solution: 'Permite ventanas emergentes para este sitio en la configuración de tu navegador, o copia la URL y ábrela manualmente.',
  },
  
  // Errores de validación
  'VALIDATION_FAILED': {
    message: 'La validación de credenciales falló',
    solution: 'Verifica que las credenciales sean correctas y que el servicio esté disponible. Intenta probar la conexión nuevamente.',
  },
  'INVALID_REDIRECT_URI': {
    message: 'El Redirect URI no es válido',
    solution: 'El Redirect URI debe coincidir exactamente con el registrado en el portal del desarrollador. Verifica que no haya espacios ni diferencias.',
  },
  
  // Errores de red
  'NETWORK_ERROR': {
    message: 'Error de conexión',
    solution: 'Verifica tu conexión a internet e intenta nuevamente. Si el problema persiste, contacta al soporte.',
  },
  'TIMEOUT': {
    message: 'La solicitud tardó demasiado',
    solution: 'El servidor está tardando en responder. Intenta nuevamente en unos momentos.',
  },
  
  // Errores de permisos
  'UNAUTHORIZED': {
    message: 'No tienes permiso para esta acción',
    solution: 'Verifica que tengas los permisos necesarios. Si eres usuario regular, solo puedes modificar tus propias credenciales.',
  },
  'FORBIDDEN': {
    message: 'Acceso denegado',
    solution: 'Esta acción requiere permisos de administrador. Contacta a un administrador si necesitas realizar esta acción.',
  },
};

/**
 * Obtener mensaje de error mejorado
 */
export function getErrorMessage(error: any): ErrorSolution {
  const errorMessage = error?.message || error?.response?.data?.error || error?.response?.data?.message || 'Error desconocido';
  const errorCode = error?.code || error?.response?.data?.code || '';
  
  // Buscar por código de error
  if (errorCode && ERROR_MESSAGES[errorCode]) {
    return ERROR_MESSAGES[errorCode];
  }
  
  // Buscar por mensaje (case insensitive)
  const errorKey = Object.keys(ERROR_MESSAGES).find(key => 
    errorMessage.toLowerCase().includes(key.toLowerCase()) ||
    errorMessage.toLowerCase().includes(ERROR_MESSAGES[key].message.toLowerCase())
  );
  
  if (errorKey) {
    return ERROR_MESSAGES[errorKey];
  }
  
  // Mensaje genérico
  return {
    message: errorMessage,
    solution: 'Revisa la información proporcionada e intenta nuevamente. Si el problema persiste, contacta al soporte.',
  };
}

/**
 * Formatear error para mostrar en UI
 */
export function formatErrorForUI(error: any): {
  title: string;
  message: string;
  solution: string;
  link?: string;
} {
  const errorInfo = getErrorMessage(error);
  
  return {
    title: 'Error',
    message: errorInfo.message,
    solution: errorInfo.solution,
    link: errorInfo.link,
  };
}

