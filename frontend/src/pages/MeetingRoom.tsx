import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@stores/authStore';
import api from '@services/api';
import toast from 'react-hot-toast';
import {
  Video,
  VideoOff,
  Phone,
  PhoneOff,
  Monitor,
  MessageSquare,
  X,
  AlertCircle,
  CheckCircle,
  Clock,
  Users,
  Loader2
} from 'lucide-react';

interface MeetingRoomInfo {
  roomId: string;
  jitsiUrl: string;
  status: 'WAITING' | 'ACTIVE' | 'ENDED';
  userId: number;
  adminId?: number;
  startedAt?: string;
  endedAt?: string;
  duration?: number;
}

interface AdminAvailability {
  available: boolean;
  activeMeeting?: {
    roomId: string;
    userId: number;
    adminId: number;
    startedAt: string;
  };
  message?: string;
}

export default function MeetingRoom() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isAdmin = user?.role?.toUpperCase() === 'ADMIN';

  const [availability, setAvailability] = useState<AdminAvailability | null>(null);
  const [meetingInfo, setMeetingInfo] = useState<MeetingRoomInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    checkAvailability();
  }, []);

  const checkAvailability = async () => {
    try {
      setCheckingAvailability(true);
      const response = await api.get('/api/meeting-room/availability');
      if (response.data?.success) {
        setAvailability(response.data.data);
      }
    } catch (error: any) {
      console.error('Error checking availability:', error);
      toast.error('Error al verificar disponibilidad');
    } finally {
      setCheckingAvailability(false);
      setLoading(false);
    }
  };

  const startMeeting = async () => {
    try {
      setJoining(true);
      const response = await api.post('/api/meeting-room/create');
      
      if (response.data?.success) {
        const info = response.data.data;
        setMeetingInfo(info);
        toast.success('Reunión iniciada correctamente');
      } else {
        throw new Error(response.data?.error || 'Error al iniciar reunión');
      }
    } catch (error: any) {
      console.error('Error starting meeting:', error);
      const errorMsg = error?.response?.data?.error || error?.message || 'Error al iniciar la reunión';
      toast.error(errorMsg);
      
      // Si el admin está ocupado, actualizar disponibilidad
      if (error?.response?.status === 409) {
        await checkAvailability();
      }
    } finally {
      setJoining(false);
    }
  };

  const endMeeting = async () => {
    if (!meetingInfo) return;

    try {
      await api.post(`/api/meeting-room/${meetingInfo.roomId}/end`);
      toast.success('Reunión finalizada');
      setMeetingInfo(null);
      await checkAvailability();
    } catch (error: any) {
      console.error('Error ending meeting:', error);
      toast.error('Error al finalizar la reunión');
    }
  };

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Si hay una reunión activa, mostrar el iframe de Jitsi
  if (meetingInfo && meetingInfo.status === 'ACTIVE') {
    return (
      <div className="flex flex-col h-[calc(100vh-73px)] bg-gray-900">
        {/* Header de la reunión */}
        <div className="bg-gray-800 text-white px-6 py-4 flex items-center justify-between border-b border-gray-700">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              <span className="font-semibold">Reunión en curso</span>
            </div>
            {meetingInfo.startedAt && (
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <Clock className="w-4 h-4" />
                <span>
                  {formatDuration(
                    Math.floor((new Date().getTime() - new Date(meetingInfo.startedAt).getTime()) / 1000)
                  )}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={endMeeting}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg flex items-center gap-2 transition-colors"
          >
            <PhoneOff className="w-4 h-4" />
            Finalizar reunión
          </button>
        </div>

        {/* Iframe de Jitsi */}
        <div className="flex-1 relative">
          <iframe
            ref={iframeRef}
            src={meetingInfo.jitsiUrl}
            className="w-full h-full border-0"
            allow="camera; microphone; display-capture; encrypted-media"
            title="Jitsi Meet"
          />
        </div>
      </div>
    );
  }

  // Si hay una reunión en espera
  if (meetingInfo && meetingInfo.status === 'WAITING') {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-73px)] bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
          <div className="mb-6">
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-pulse" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {isAdmin ? 'Esperando usuario...' : 'Esperando administrador...'}
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              {isAdmin
                ? 'La sala está lista. Un usuario se unirá pronto.'
                : 'Tu solicitud de reunión ha sido enviada. El administrador se unirá en breve.'}
            </p>
          </div>

          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">ID de la sala:</p>
              <p className="font-mono text-sm text-gray-900 dark:text-white">{meetingInfo.roomId}</p>
            </div>

            <div className="flex gap-4 justify-center">
              <button
                onClick={() => {
                  // Abrir Jitsi en nueva pestaña mientras espera
                  window.open(meetingInfo.jitsiUrl, '_blank');
                }}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-colors"
              >
                <Video className="w-5 h-5" />
                Abrir sala en nueva pestaña
              </button>
              <button
                onClick={() => {
                  setMeetingInfo(null);
                  checkAvailability();
                }}
                className="px-6 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Pantalla principal: mostrar disponibilidad y botón para iniciar
  if (loading || checkingAvailability) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-73px)]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 mx-auto mb-4 text-primary-600 animate-spin" />
          <p className="text-gray-600 dark:text-gray-400">Verificando disponibilidad...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-73px)] bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <Video className="w-8 h-8 text-primary-600 dark:text-primary-400" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Sala de Reuniones
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {isAdmin
              ? 'Inicia una reunión o únete a una sala en espera'
              : 'Conéctate con el administrador para soporte en tiempo real'}
          </p>
        </div>

        {/* Estado de disponibilidad */}
        {availability && (
          <div className="mb-6">
            {availability.available ? (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-green-900 dark:text-green-100">
                    Administrador disponible
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                    Puedes iniciar una reunión ahora mismo
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-yellow-900 dark:text-yellow-100">
                    Administrador ocupado
                  </p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                    {availability.message || 'El administrador está en otra reunión'}
                  </p>
                  {availability.activeMeeting && (
                    <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                      Reunión iniciada: {new Date(availability.activeMeeting.startedAt).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Funcionalidades */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center">
            <Video className="w-8 h-8 mx-auto mb-2 text-primary-600 dark:text-primary-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Videollamada</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Comunicación cara a cara en tiempo real
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center">
            <Monitor className="w-8 h-8 mx-auto mb-2 text-primary-600 dark:text-primary-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Compartir pantalla</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Muestra tu pantalla al administrador
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 text-primary-600 dark:text-primary-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Chat</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Mensajes de texto en tiempo real
            </p>
          </div>
        </div>

        {/* Botón de acción */}
        <div className="flex gap-4">
          <button
            onClick={startMeeting}
            disabled={!availability?.available && !isAdmin}
            className={`flex-1 px-6 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
              availability?.available || isAdmin
                ? 'bg-primary-600 hover:bg-primary-700 text-white'
                : 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
            }`}
          >
            {joining ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Iniciando...
              </>
            ) : (
              <>
                <Phone className="w-5 h-5" />
                {isAdmin ? 'Iniciar reunión' : 'Solicitar reunión'}
              </>
            )}
          </button>
          <button
            onClick={checkAvailability}
            className="px-6 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors"
          >
            Actualizar
          </button>
        </div>

        {/* Información adicional */}
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Las reuniones están encriptadas de extremo a extremo. Solo usuarios autenticados pueden acceder.
          </p>
        </div>
      </div>
    </div>
  );
}

