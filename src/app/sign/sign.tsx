// app/sign/page.tsx
'use client'
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import TransactionSigning from '../../../components/TransactionSigning';


function SigningContent() {
  const searchParams = useSearchParams();
  const signingId = searchParams.get('signingId');

  const handleComplete = () => {
    // Try to close the window, or redirect if that fails
    if (window.opener) {
      window.close();
    } else {
      // Fallback: redirect to main page
      window.location.href = '/';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <TransactionSigning 
          signingId={signingId || undefined} 
          onComplete={handleComplete}
        />
      </div>
    </div>
  );
}

export default function SignPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading signing request...</p>
        </div>
      </div>
    }>
      <SigningContent />
    </Suspense>
  );
}