import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, AlertCircle, Loader2, Mail, User, Building, FileText } from 'lucide-react';
import api from '@/services/api';
import toast from 'react-hot-toast';

export default function RequestAccess() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    fullName: '',
    company: '',
    reason: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.username || formData.username.length < 3) {
      newErrors.username = 'Username must be at least 3 characters';
    }

    if (!formData.email || !formData.email.includes('@')) {
      newErrors.email = 'Valid email is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fix the form errors');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/api/access-requests', formData);
      
      if (response.data?.success) {
        setSubmitted(true);
        toast.success('Access request submitted successfully!');
      } else {
        throw new Error(response.data?.error || 'Failed to submit request');
      }
    } catch (error: any) {
      console.error('Error submitting access request:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to submit access request';
      toast.error(errorMessage);
      
      // Mostrar errores específicos
      if (error.response?.data?.details) {
        const fieldErrors: Record<string, string> = {};
        error.response.data.details.forEach((detail: any) => {
          if (detail.path) {
            fieldErrors[detail.path[0]] = detail.message;
          }
        });
        setErrors(fieldErrors);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Limpiar error del campo al cambiar
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <CheckCircle className="w-16 h-16 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Request Submitted Successfully</h2>
              <p className="text-gray-600">
                Your access request has been submitted. An administrator will review your request shortly.
              </p>
              <p className="text-sm text-gray-500">
                You will receive an email at <strong>{formData.email}</strong> once your request has been reviewed.
              </p>
              <div className="flex gap-3 justify-center">
                <Button
                  variant="outline"
                  onClick={() => navigate('/login')}
                >
                  Go to Login
                </Button>
                <Button
                  onClick={() => {
                    setSubmitted(false);
                    setFormData({
                      username: '',
                      email: '',
                      fullName: '',
                      company: '',
                      reason: ''
                    });
                  }}
                >
                  Submit Another Request
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <Card className="max-w-2xl w-full">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-gray-900">Request Access to Ivan Reseller</CardTitle>
          <p className="text-gray-600 mt-2">
            Fill out the form below to request access to the platform. An administrator will review your request shortly.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Username */}
            <div>
              <Label htmlFor="username" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Username *
              </Label>
              <Input
                id="username"
                type="text"
                value={formData.username}
                onChange={(e) => handleChange('username', e.target.value)}
                placeholder="Enter your username"
                className={errors.username ? 'border-red-500' : ''}
                required
                minLength={3}
                maxLength={50}
              />
              {errors.username && (
                <p className="text-red-500 text-sm mt-1">{errors.username}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email *
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="Enter your email"
                className={errors.email ? 'border-red-500' : ''}
                required
              />
              {errors.email && (
                <p className="text-red-500 text-sm mt-1">{errors.email}</p>
              )}
            </div>

            {/* Full Name */}
            <div>
              <Label htmlFor="fullName" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Full Name
              </Label>
              <Input
                id="fullName"
                type="text"
                value={formData.fullName}
                onChange={(e) => handleChange('fullName', e.target.value)}
                placeholder="Enter your full name (optional)"
              />
            </div>

            {/* Company */}
            <div>
              <Label htmlFor="company" className="flex items-center gap-2">
                <Building className="w-4 h-4" />
                Company
              </Label>
              <Input
                id="company"
                type="text"
                value={formData.company}
                onChange={(e) => handleChange('company', e.target.value)}
                placeholder="Enter your company name (optional)"
              />
            </div>

            {/* Reason */}
            <div>
              <Label htmlFor="reason" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Reason for Access
              </Label>
              <Textarea
                id="reason"
                value={formData.reason}
                onChange={(e) => handleChange('reason', e.target.value)}
                placeholder="Tell us why you need access to the platform (optional)"
                rows={4}
              />
            </div>

            {/* Submit Button */}
            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={loading}
                className="flex-1"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Request'
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/login')}
                disabled={loading}
              >
                Back to Login
              </Button>
            </div>

            {/* Info Alert */}
            <Alert>
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>
                You will receive an email notification once your request has been reviewed by an administrator.
              </AlertDescription>
            </Alert>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

