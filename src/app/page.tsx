import Header from '@/components/Header';
import WalletInfo from '@/components/WalletInfo';
import TransactionDemo from '@/components/TransactionDemo';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Sui Wallet Integration Demo
          </h2>
          <p className="text-gray-600">
            This demo showcases how to integrate Suiet wallet kit with Next.js.
          </p>
        </div>

        <div className="space-y-6">
          <WalletInfo />
          <TransactionDemo />
        </div>
      </div>
    </main>
  );
}