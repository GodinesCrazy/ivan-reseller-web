export default function Dashboard() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <p className="text-sm text-gray-600">Total Products</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">0</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <p className="text-sm text-gray-600">Total Sales</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">$0</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <p className="text-sm text-gray-600">Net Profit</p>
          <p className="text-3xl font-bold text-green-600 mt-2">$0</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <p className="text-sm text-gray-600">Pending Commissions</p>
          <p className="text-3xl font-bold text-orange-600 mt-2">$0</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-xl font-semibold mb-4">Welcome to Ivan Reseller!</h2>
        <p className="text-gray-600">
          Your dropshipping platform is ready. Start by adding products or configuring your marketplace APIs in Settings.
        </p>
      </div>
    </div>
  );
}
