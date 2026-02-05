/**
 * Checkout - PayPal payment flow for post-sale dropshipping
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CreditCard } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  createPayPalOrder,
  capturePayPalOrder,
  type CreatePayPalOrderParams,
} from '@/services/orders.api';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const PENDING_KEY = 'paypal_pending_order';

export default function Checkout() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'form' | 'redirect' | 'capturing' | 'done'>('form');
  const [form, setForm] = useState({
    productUrl: '',
    productTitle: '',
    price: '10.99',
    customerName: '',
    customerEmail: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    country: 'US',
  });

  useEffect(() => {
    const urlProduct = searchParams.get('productUrl');
    const urlTitle = searchParams.get('title');
    const urlPrice = searchParams.get('price');
    if (urlProduct) setForm((f) => ({ ...f, productUrl: urlProduct }));
    if (urlTitle) setForm((f) => ({ ...f, productTitle: urlTitle }));
    if (urlPrice) setForm((f) => ({ ...f, price: urlPrice }));
  }, [searchParams]);

  useEffect(() => {
    if (token) {
      const pending = sessionStorage.getItem(PENDING_KEY);
      if (pending) {
        try {
          const data = JSON.parse(pending);
          setStep('capturing');
          setLoading(true);
          capturePayPalOrder({
            orderId: token,
            productUrl: data.productUrl,
            productTitle: data.productTitle,
            price: data.price,
            customerName: data.customerName,
            customerEmail: data.customerEmail,
            shippingAddress: JSON.stringify({
              fullName: data.customerName,
              addressLine1: data.address,
              city: data.city,
              state: data.state,
              zipCode: data.zip,
              country: data.country,
            }),
          })
            .then((res) => {
              sessionStorage.removeItem(PENDING_KEY);
              setStep('done');
              toast.success('Payment captured');
              navigate(`/orders/${res.orderId}`, { replace: true });
            })
            .catch((err) => {
              toast.error(err?.response?.data?.error || 'Capture failed');
              setStep('form');
            })
            .finally(() => setLoading(false));
        } catch {
          setStep('form');
        }
      } else {
        setStep('form');
      }
    }
  }, [token, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const baseUrl = window.location.origin;
    const returnUrl = `${baseUrl}/checkout`;
    const cancelUrl = `${baseUrl}/checkout?canceled=1`;
    setLoading(true);
    try {
      const res = await createPayPalOrder({
        amount: parseFloat(form.price) || 10.99,
        productTitle: form.productTitle || 'Order',
        productUrl: form.productUrl,
        returnUrl,
        cancelUrl,
        customerName: form.customerName,
        customerEmail: form.customerEmail,
        shippingAddress: form.address,
      });
      sessionStorage.setItem(
        PENDING_KEY,
        JSON.stringify({
          productUrl: form.productUrl,
          productTitle: form.productTitle,
          price: parseFloat(form.price) || 10.99,
          customerName: form.customerName,
          customerEmail: form.customerEmail,
          address: form.address,
          city: form.city,
          state: form.state,
          zip: form.zip,
          country: form.country,
        })
      );
      const approveUrl = res.approveUrl.replace('{token}', res.paypalOrderId);
      setStep('redirect');
      window.location.href = approveUrl;
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to create order');
      setLoading(false);
    }
  };

  if (step === 'redirect' || step === 'capturing') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px]">
        <LoadingSpinner />
        <p className="mt-4 text-gray-600">
          {step === 'redirect' ? 'Redirecting to PayPal...' : 'Processing payment...'}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 mb-6 text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
        <h1 className="text-xl font-bold mb-6">Checkout</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Product URL *</label>
            <input
              type="url"
              required
              value={form.productUrl}
              onChange={(e) => setForm((f) => ({ ...f, productUrl: e.target.value }))}
              className="block w-full mt-1 border border-gray-300 rounded-md shadow-sm"
              placeholder="https://www.aliexpress.com/item/..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Product Title</label>
            <input
              type="text"
              value={form.productTitle}
              onChange={(e) => setForm((f) => ({ ...f, productTitle: e.target.value }))}
              className="block w-full mt-1 border border-gray-300 rounded-md shadow-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Price (USD) *</label>
            <input
              type="number"
              step="0.01"
              required
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              className="block w-full mt-1 border border-gray-300 rounded-md shadow-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Your Name *</label>
            <input
              type="text"
              required
              value={form.customerName}
              onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
              className="block w-full mt-1 border border-gray-300 rounded-md shadow-sm"
              placeholder="John Doe"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Email *</label>
            <input
              type="email"
              required
              value={form.customerEmail}
              onChange={(e) => setForm((f) => ({ ...f, customerEmail: e.target.value }))}
              className="block w-full mt-1 border border-gray-300 rounded-md shadow-sm"
              placeholder="john@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Address *</label>
            <input
              type="text"
              required
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className="block w-full mt-1 border border-gray-300 rounded-md shadow-sm"
              placeholder="123 Main St"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">City</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                className="block w-full mt-1 border border-gray-300 rounded-md shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">State</label>
              <input
                type="text"
                value={form.state}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                className="block w-full mt-1 border border-gray-300 rounded-md shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">ZIP</label>
              <input
                type="text"
                value={form.zip}
                onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
                className="block w-full mt-1 border border-gray-300 rounded-md shadow-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center w-full gap-2 px-4 py-3 font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <CreditCard className="w-5 h-5" />
            Pay with PayPal
          </button>
        </form>
      </div>
    </div>
  );
}
