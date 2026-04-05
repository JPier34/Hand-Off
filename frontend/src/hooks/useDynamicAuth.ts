// Dynamic.xyz — JavaScript SDK auth hook
//
// All imports are from @dynamic-labs-sdk/client — the framework-agnostic JS SDK.
// No React-specific Dynamic package is used. This hook wires the JS SDK into React
// state but could be ported to any framework without changing the SDK calls.
//
// Auth flow implemented here:
//   1. sendEmailOTP()                    — send OTP to user's email
//   2. verifyOTP()                       — verify the 6-digit code
//   3. createWaasWalletAccounts()        — create embedded wallet (WaaS) if none exists
//   4. connectAndVerifyWithWalletProvider() — connect MetaMask / external wallet
//   5. getWalletAccounts()               — read the active wallet address
//
// The wallet account is then bridged to wagmi via useDynamicWrite.ts, enabling
// standard wagmi hooks (useWriteContract, etc.) with Dynamic-managed wallets.
import { useState, useEffect, useCallback } from 'react'
import {
  getWalletAccounts,
  logout as dynamicLogout,
  onEvent,
  sendEmailOTP,
  verifyOTP,
  getAvailableWalletProvidersData,
  connectAndVerifyWithWalletProvider,
  waitForClientInitialized,
} from '@dynamic-labs-sdk/client'
import {
  getChainsMissingWaasWalletAccounts,
  createWaasWalletAccounts,
} from '@dynamic-labs-sdk/client/waas'

export interface WalletProviderInfo {
  key: string
  displayName: string
  icon: string
  groupKey: string
  chain: string
}

export interface DynamicAuthState {
  isAuthenticated: boolean
  walletAddress: string | null
  isLoading: boolean
  isClientReady: boolean
  showAuthModal: boolean
  walletProviders: WalletProviderInfo[]
}

// Module-level shared state
const _listeners = new Set<() => void>()
let _state: DynamicAuthState = {
  isAuthenticated: false,
  walletAddress: null,
  isLoading: false,
  isClientReady: false,
  showAuthModal: false,
  walletProviders: [],
}

function setState(partial: Partial<DynamicAuthState>) {
  _state = { ..._state, ...partial }
  _listeners.forEach(fn => fn())
}

// Listen for wallet changes
onEvent({
  event: 'walletAccountsChanged',
  listener: ({ walletAccounts }: { walletAccounts: { address?: string }[] }) => {
    const addr = walletAccounts?.[0]?.address ?? null
    setState({ isAuthenticated: !!addr, walletAddress: addr })
  },
})

// Wait for client to be ready, then check initial state + load providers
waitForClientInitialized().then(() => {
  const accounts = getWalletAccounts()
  const addr = accounts?.[0]?.address ?? null
  const providers = getAvailableWalletProvidersData()
  const walletProviders: WalletProviderInfo[] = providers.map((p) => ({
    key: p.key,
    displayName: p.metadata.displayName,
    icon: p.metadata.icon,
    groupKey: p.groupKey,
    chain: p.chain,
  }))
  setState({
    isClientReady: true,
    isAuthenticated: !!addr,
    walletAddress: addr,
    walletProviders,
  })
}).catch(() => {
  setState({ isClientReady: true })
})

export function useDynamicAuth() {
  const [, rerender] = useState(0)

  useEffect(() => {
    const listener = () => rerender(n => n + 1)
    _listeners.add(listener)
    return () => { _listeners.delete(listener) }
  }, [])

  const openAuthModal = useCallback(() => {
    setState({ showAuthModal: true })
  }, [])

  const closeAuthModal = useCallback(() => {
    setState({ showAuthModal: false })
  }, [])

  const loginWithEmail = useCallback(async (email: string) => {
    setState({ isLoading: true })
    try {
      const otpVerification = await sendEmailOTP({ email })
      return otpVerification
    } catch (err) {
      setState({ isLoading: false })
      throw err
    }
  }, [])

  const verifyCode = useCallback(async (otpVerification: Parameters<typeof verifyOTP>[0]['otpVerification'], code: string) => {
    try {
      await verifyOTP({ otpVerification, verificationToken: code })
      // Create embedded wallet — call unconditionally per docs
      const missingChains = getChainsMissingWaasWalletAccounts()
      await createWaasWalletAccounts({ chains: missingChains })
      // Get address
      const accounts = getWalletAccounts()
      const addr = accounts?.[0]?.address ?? null
      setState({ isAuthenticated: true, walletAddress: addr, isLoading: false, showAuthModal: false })
    } catch (err) {
      setState({ isLoading: false })
      throw err
    }
  }, [])

  const connectWithProvider = useCallback(async (walletProviderKey: string) => {
    setState({ isLoading: true })
    try {
      await connectAndVerifyWithWalletProvider({ walletProviderKey })
      const accounts = getWalletAccounts()
      const addr = accounts?.[0]?.address ?? null
      setState({ isAuthenticated: true, walletAddress: addr, isLoading: false, showAuthModal: false })
    } catch (err) {
      setState({ isLoading: false })
      throw err
    }
  }, [])

  const disconnect = useCallback(async () => {
    await dynamicLogout()
    setState({ isAuthenticated: false, walletAddress: null })
  }, [])

  return {
    ..._state,
    login: openAuthModal,
    loginWithEmail,
    verifyCode,
    connectWithProvider,
    disconnect,
    closeAuthModal,
  }
}
