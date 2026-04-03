import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from '@/pages/Home'
import Landing from '@/pages/Landing'
import CreateDeal from '@/pages/CreateDeal'
import BuyerPay from '@/pages/BuyerPay'
import ManageDeal from '@/pages/ManageDeal'
import { Layout } from '@/components/Layout'
import { Card } from '@/components/ui/Card'

function StubPage({ title }: { title: string }) {
  return (
    <Layout>
      <main className="max-w-lg mx-auto px-4 py-12">
        <Card>
          <p className="text-sm text-hoff-text-tertiary text-center py-2">
            {title} — coming soon
          </p>
        </Card>
      </main>
    </Layout>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/landing" element={<Landing />} />
        <Route path="/create" element={<CreateDeal />} />
        <Route path="/pay/:dealId" element={<BuyerPay />} />
        <Route path="/deal/:dealId" element={<ManageDeal />} />
        <Route path="/escrows" element={<StubPage title="Your Escrows" />} />
        <Route path="/history" element={<StubPage title="History" />} />
      </Routes>
    </BrowserRouter>
  )
}
