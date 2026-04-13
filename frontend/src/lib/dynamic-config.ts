import { MOCK_MODE } from '@/lib/mock'

export const DYNAMIC_ENVIRONMENT_ID = import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID
export const DYNAMIC_ENABLED = !MOCK_MODE && !!DYNAMIC_ENVIRONMENT_ID
