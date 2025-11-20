import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Settings as SettingsIcon, 
  Globe, 
  Bell, 
  User, 
  Key,
  Save,
  CheckCircle,
  XCircle,
  Link as LinkIcon,
  Mail,
  Phone,
  Lock,
  Eye,
  EyeOff,
  Upload,
  AlertCircle
} from 'lucide-react';
import { api } from '../services/api';
import { toast } from 'sonner';

interface UserSettings {
  language: string;
  timezone: string;
  dateFormat: string;
  currencyFormat: string;
  theme: string;
}

interface UserProfile {
  id: number;
  name: string;
  email: string;
  phone: string;
  avatar?: string;
}

interface NotificationSettings {
  emailNotifications: boolean;
  pushNotifications: boolean;
  events: {
    newOpportunity: boolean;
    saleCompleted: boolean;
    commissionGenerated: boolean;
    publishError: boolean;
    lowStock: boolean;
  };
}

interface ApiStatus {
  name: string;
  status: 'active' | 'inactive' | 'error';
  lastTest: string;
}

export default function Settings() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'general' | 'apis' | 'notifications' | 'profile'>('general');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // General Settings
  const [generalSettings, setGeneralSettings] = useState<UserSettings>({
    language: 'en',
    timezone: 'America/New_York',
    dateFormat: 'MM/DD/YYYY',
    currencyFormat: 'USD',
    theme: 'light'
  });

  // User Profile
  const [profile, setProfile] = useState<UserProfile>({
    id: 1,
    name: '',
    email: '',
    phone: ''
  });

  // Notification Settings
  const [notifications, setNotifications] = useState<NotificationSettings>({
    emailNotifications: true,
    pushNotifications: true,
    events: {
      newOpportunity: true,
      saleCompleted: true,
      commissionGenerated: true,
      publishError: true,
      lowStock: true
    }
  });

  // Password Change
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });

  // API Status
  const [apiStatus, setApiStatus] = useState<ApiStatus[]>([]);

  useEffect(() => {
    loadSettings();
    loadProfile();
    loadNotifications();
    loadApiStatus();
  }, []);

  const loadSettings = async () => {
    try {
      // ✅ Intentar cargar desde el backend
      const { data } = await api.get('/api/settings');
      if (data?.success && data?.data) {
        setGeneralSettings({
          language: data.data.language || 'en',
          timezone: data.data.timezone || 'America/New_York',
          dateFormat: data.data.dateFormat || 'MM/DD/YYYY',
          currencyFormat: data.data.currencyFormat || 'USD',
          theme: data.data.theme || 'light'
        });
        return;
      }
    } catch (error: any) {
      // ✅ Fallback: intentar cargar desde localStorage
      console.warn('Error loading settings from backend, trying localStorage:', error);
      try {
        const saved = localStorage.getItem('userSettings');
        if (saved) {
          const parsed = JSON.parse(saved);
          setGeneralSettings({
            language: parsed.language || 'en',
            timezone: parsed.timezone || 'America/New_York',
            dateFormat: parsed.dateFormat || 'MM/DD/YYYY',
            currencyFormat: parsed.currencyFormat || 'USD',
            theme: parsed.theme || 'light'
          });
          return;
        }
      } catch (localError) {
        console.error('Error loading settings from localStorage:', localError);
      }
    }
  };

  const loadProfile = async () => {
    try {
      // Corregir endpoint: /api/users/me -> /api/auth/me
      const { data } = await api.get('/api/auth/me');
      if (data?.data) {
        const user = data.data;
        setProfile({
          id: user.id,
          name: user.fullName || user.username || '',
          email: user.email || '',
          phone: ''
        });
      }
    } catch (error: any) {
      console.error('Error loading profile:', error);
      // Si falla, intentar obtener desde el store de auth
      try {
        const { useAuthStore } = await import('../stores/authStore');
        const { user } = useAuthStore.getState();
        if (user) {
          setProfile({
            id: user.id,
            name: user.fullName || user.username || '',
            email: user.email || '',
            phone: ''
          });
        }
      } catch (e) {
        // Ignorar error silenciosamente
      }
    }
  };

  const loadNotifications = async () => {
    try {
      // El endpoint /api/users/notifications no existe, usar valores por defecto
      // Si en el futuro se implementa, usar: await api.get('/api/notifications/preferences');
    } catch (error: any) {
      console.error('Error loading notifications:', error);
    }
  };

  const loadApiStatus = async () => {
    try {
      const { data } = await api.get('/api/credentials');
      const apis = data?.apis || [];
      setApiStatus(apis.map((api: any) => ({
        name: api.apiName,
        status: api.isActive ? 'active' : 'inactive',
        lastTest: api.lastUpdated || 'Never'
      })));
    } catch (error: any) {
      console.error('Error loading API status:', error);
    }
  };

  const saveGeneralSettings = async () => {
    setSaving(true);
    try {
      // ✅ Intentar guardar en el backend
      const { data } = await api.post('/api/settings', generalSettings);
      if (data?.success) {
        // ✅ También guardar en localStorage como backup
        localStorage.setItem('userSettings', JSON.stringify(generalSettings));
        toast.success('Settings saved successfully');
      } else {
        throw new Error(data?.message || 'Failed to save settings');
      }
    } catch (error: any) {
      // ✅ Fallback: guardar en localStorage si falla el backend
      console.warn('Error saving settings to backend, using localStorage fallback:', error);
      try {
        localStorage.setItem('userSettings', JSON.stringify(generalSettings));
        toast.success('Settings saved locally (backend unavailable)');
      } catch (localError) {
        toast.error('Error saving settings: ' + (error.response?.data?.error || error.message));
      }
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await api.put(`/api/users/${profile.id}`, profile);
      toast.success('Profile updated successfully');
    } catch (error: any) {
      toast.error('Error updating profile: ' + (error.response?.data?.error || error.message));
    } finally {
      setSaving(false);
    }
  };

  const saveNotifications = async () => {
    setSaving(true);
    try {
      // El endpoint /api/users/notifications no existe aún, guardar en localStorage como fallback
      localStorage.setItem('notificationSettings', JSON.stringify(notifications));
      toast.success('Notification settings saved');
    } catch (error: any) {
      toast.error('Error saving notifications: ' + (error.response?.data?.error || error.message));
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setSaving(true);
    try {
      await api.post(`/api/users/${profile.id}/password`, {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      });
      toast.success('Password changed successfully');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error: any) {
      toast.error('Error changing password: ' + (error.response?.data?.error || error.message));
    } finally {
      setSaving(false);
    }
  };

  const testNotifications = async () => {
    try {
      // El endpoint /api/users/notifications/test no existe aún
      toast.info('Test notification feature coming soon');
    } catch (error: any) {
      toast.error('Error sending test notification');
    }
  };

  const tabs = [
    { id: 'general', label: 'General', icon: SettingsIcon },
    { id: 'apis', label: 'API Configuration', icon: Key },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'profile', label: 'Profile', icon: User }
  ];

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600">Manage your account settings and preferences</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white border rounded-lg p-6">
        {/* General Settings */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-4">General Settings</h2>
              <p className="text-gray-600 mb-6">Configure your system preferences</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Language */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Globe className="w-4 h-4 inline mr-2" />
                  Language
                </label>
                <select
                  value={generalSettings.language}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, language: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="en">English</option>
                  <option value="es">Español</option>
                  <option value="pt">Português</option>
                </select>
              </div>

              {/* Timezone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Timezone</label>
                <select
                  value={generalSettings.timezone}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, timezone: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="America/New_York">Eastern Time (ET)</option>
                  <option value="America/Chicago">Central Time (CT)</option>
                  <option value="America/Denver">Mountain Time (MT)</option>
                  <option value="America/Los_Angeles">Pacific Time (PT)</option>
                  <option value="Europe/London">London (GMT)</option>
                  <option value="Europe/Madrid">Madrid (CET)</option>
                  <option value="America/Mexico_City">Mexico City (CST)</option>
                  <option value="America/Sao_Paulo">São Paulo (BRT)</option>
                </select>
              </div>

              {/* Date Format */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date Format</label>
                <select
                  value={generalSettings.dateFormat}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, dateFormat: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="MM/DD/YYYY">MM/DD/YYYY (US)</option>
                  <option value="DD/MM/YYYY">DD/MM/YYYY (EU)</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
                </select>
              </div>

              {/* Currency */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Currency Format</label>
                <select
                  value={generalSettings.currencyFormat}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, currencyFormat: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="USD">$ USD - US Dollar</option>
                  <option value="EUR">€ EUR - Euro</option>
                  <option value="GBP">£ GBP - British Pound</option>
                  <option value="MXN">$ MXN - Mexican Peso</option>
                  <option value="BRL">R$ BRL - Brazilian Real</option>
                </select>
              </div>

              {/* Theme */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Theme</label>
                <select
                  value={generalSettings.theme}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, theme: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="auto">Auto (System)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t">
              <button
                onClick={saveGeneralSettings}
                disabled={saving}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}

        {/* API Configuration */}
        {activeTab === 'apis' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-4">API Configuration</h2>
              <p className="text-gray-600 mb-6">Manage your marketplace API credentials and connections</p>
            </div>

            {/* Quick Links */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => navigate('/api-settings')}
                className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors text-left"
              >
                <SettingsIcon className="w-6 h-6 text-primary-600 mb-2" />
                <h3 className="font-semibold text-gray-900">API Configuration</h3>
                <p className="text-sm text-gray-600">Configure all marketplace and service APIs</p>
              </button>

              <button
                onClick={() => navigate('/other-credentials')}
                className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors text-left"
              >
                <Lock className="w-6 h-6 text-primary-600 mb-2" />
                <h3 className="font-semibold text-gray-900">Other Credentials</h3>
                <p className="text-sm text-gray-600">Manage AliExpress login and non-API credentials</p>
              </button>
            </div>

            {/* API Status */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">API Status</h3>
              <div className="space-y-2">
                {apiStatus.length === 0 && (
                  <p className="text-gray-500 text-sm">No APIs configured yet</p>
                )}
                {apiStatus.map((api, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      {api.status === 'active' ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-gray-400" />
                      )}
                      <div>
                        <div className="font-medium text-gray-900 capitalize">{api.name}</div>
                        <div className="text-xs text-gray-500">Last test: {api.lastTest}</div>
                      </div>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      api.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {api.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Notifications */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-4">Notification Settings</h2>
              <p className="text-gray-600 mb-6">Choose what notifications you want to receive</p>
            </div>

            {/* Notification Channels */}
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-gray-600" />
                  <div>
                    <div className="font-medium text-gray-900">Email Notifications</div>
                    <div className="text-sm text-gray-600">Receive notifications via email</div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifications.emailNotifications}
                    onChange={(e) => setNotifications({ ...notifications, emailNotifications: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-gray-600" />
                  <div>
                    <div className="font-medium text-gray-900">Push Notifications</div>
                    <div className="text-sm text-gray-600">Receive push notifications in browser</div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifications.pushNotifications}
                    onChange={(e) => setNotifications({ ...notifications, pushNotifications: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </div>
            </div>

            {/* Event Preferences */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Event Notifications</h3>
              <div className="space-y-3">
                {[
                  { key: 'newOpportunity', label: 'New Opportunity Detected', description: 'Get notified when AI finds a profitable opportunity' },
                  { key: 'saleCompleted', label: 'Sale Completed', description: 'Get notified when a sale is completed' },
                  { key: 'commissionGenerated', label: 'Commission Generated', description: 'Get notified when you earn a commission' },
                  { key: 'publishError', label: 'Publishing Error', description: 'Get notified when a product fails to publish' },
                  { key: 'lowStock', label: 'Low Stock Alert', description: 'Get notified when product stock is low' }
                ].map((event) => (
                  <div key={event.key} className="flex items-start justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{event.label}</div>
                      <div className="text-sm text-gray-600">{event.description}</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer ml-4">
                      <input
                        type="checkbox"
                        checked={notifications.events[event.key as keyof typeof notifications.events]}
                        onChange={(e) => setNotifications({
                          ...notifications,
                          events: { ...notifications.events, [event.key]: e.target.checked }
                        })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Test Notification */}
            <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-blue-600" />
              <div className="flex-1">
                <div className="font-medium text-blue-900">Test Notifications</div>
                <div className="text-sm text-blue-700">Send a test notification to verify your settings</div>
              </div>
              <button
                onClick={testNotifications}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                Send Test
              </button>
            </div>

            <div className="flex justify-end pt-4 border-t">
              <button
                onClick={saveNotifications}
                disabled={saving}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}

        {/* Profile */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-4">Profile Settings</h2>
              <p className="text-gray-600 mb-6">Update your personal information and password</p>
            </div>

            {/* Profile Information */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Mail className="w-4 h-4 inline mr-2" />
                  Email
                </label>
                <input
                  type="email"
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="john@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Phone className="w-4 h-4 inline mr-2" />
                  Phone
                </label>
                <input
                  type="tel"
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              <div className="flex justify-end pt-4 border-t">
                <button
                  onClick={saveProfile}
                  disabled={saving}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </div>

            {/* Change Password */}
            <div className="pt-6 border-t">
              <h3 className="font-semibold text-gray-900 mb-4">Change Password</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Current Password</label>
                  <div className="relative">
                    <input
                      type={showPasswords.current ? 'text' : 'password'}
                      value={passwordData.currentPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPasswords.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">New Password</label>
                  <div className="relative">
                    <input
                      type={showPasswords.new ? 'text' : 'password'}
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 pr-10"
                      placeholder="At least 8 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPasswords.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Confirm New Password</label>
                  <div className="relative">
                    <input
                      type={showPasswords.confirm ? 'text' : 'password'}
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPasswords.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={changePassword}
                    disabled={saving || !passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    <Lock className="w-4 h-4" />
                    {saving ? 'Changing...' : 'Change Password'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
