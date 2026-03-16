'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm }   from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z }         from 'zod';
import { PhoneCall } from 'lucide-react';
import { useAuthStore } from '@/store';
import { Button }    from '@/components/ui/Button';
import { Input }     from '@/components/ui/Input';

const schema = z.object({
  email:    z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type FormData = z.infer<typeof schema>;

export function LoginForm() {
  const { login, isLoading, error, clearError } = useAuthStore();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    clearError();
    try {
      await login(data);
      router.push('/dashboard');
    } catch {
      // error is set in store
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
      <div className="flex justify-center mb-6">
        <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center
                        justify-center text-white shadow">
          <PhoneCall size={24} />
        </div>
      </div>

      <h2 className="text-xl font-bold text-center text-gray-900 mb-1">
        Welcome back
      </h2>
      <p className="text-sm text-center text-gray-500 mb-6">
        Sign in to the Call Center CRM
      </p>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200
                        px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Input
          label="Email address"
          type="email"
          placeholder="agent@company.com"
          error={errors.email?.message}
          {...register('email')}
        />

        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          placeholder="••••••••"
          error={errors.password?.message}
          rightIcon={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="text-xs text-blue-600 hover:underline"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          }
          {...register('password')}
        />

        <Button
          type="submit"
          variant="primary"
          size="md"
          loading={isLoading}
          className="w-full mt-2"
        >
          Sign in
        </Button>
      </form>
    </div>
  );
}
