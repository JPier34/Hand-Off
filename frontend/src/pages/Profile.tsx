import { useNavigate } from 'react-router-dom'
import { Layout } from '@/components/Layout'

export default function Profile() {
  const navigate = useNavigate()
  return (
    <Layout>
      <main className="w-full px-4 sm:max-w-md sm:mx-auto py-12 space-y-4">
        <h1 className="text-2xl font-bold text-hoff-text-primary">Profile</h1>
        <button
          onClick={() => navigate('/history')}
          className="text-sm text-hoff-accent hover:underline"
        >
          View transaction history →
        </button>
      </main>
    </Layout>
  )
}
