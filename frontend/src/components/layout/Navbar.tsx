import { useAuthStore } from '@stores/authStore';
import { LogOut, User } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuthStore();

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="px-8 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-bold text-primary-600">Ivan Reseller</h1>
          <span className="text-sm text-gray-500">Dropshipping Platform</span>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <User className="w-5 h-5 text-gray-500" />
            <span className="text-sm font-medium">{user?.username}</span>
            <span className="text-xs text-gray-500 px-2 py-1 bg-gray-100 rounded">
              {user?.role}
            </span>
          </div>
          
          <button
            onClick={logout}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
