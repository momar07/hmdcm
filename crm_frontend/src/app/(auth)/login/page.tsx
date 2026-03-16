import { LoginForm } from '@/features/auth/components/LoginForm';

export default function LoginPage() {
  return (
    <main className='min-h-screen flex items-center justify-center bg-gray-50'>
      <div className='w-full max-w-md'>
        <div className='text-center mb-8'>
          <h1 className='text-3xl font-bold text-brand-700'>Call Center CRM</h1>
          <p className='mt-2 text-sm text-gray-600'>
            Sign in to your account
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
