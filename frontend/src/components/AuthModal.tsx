import { useState } from 'react'
import type { OTPVerification } from '@dynamic-labs-sdk/client'
import { useDynamicAuth } from '@/hooks/useDynamicAuth'
import { Spinner } from '@/components/ui/Spinner'

type Step = 'main' | 'otp'

export function AuthModal() {
  const {
    showAuthModal,
    closeAuthModal,
    loginWithEmail,
    verifyCode,
    connectWithProvider,
    walletProviders,
    isLoading,
    isClientReady,
  } = useDynamicAuth()

  const [step, setStep] = useState<Step>('main')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [otpVerification, setOtpVerification] = useState<OTPVerification | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connectingKey, setConnectingKey] = useState<string | null>(null)

  if (!showAuthModal) return null

  function handleClose() {
    setStep('main')
    setEmail('')
    setOtp('')
    setError(null)
    setConnectingKey(null)
    closeAuthModal()
  }

  async function handleSendOtp() {
    if (!email) return
    setError(null)
    try {
      const verification = await loginWithEmail(email)
      setOtpVerification(verification)
      setStep('otp')
    } catch {
      setError('Failed to send code. Check your email and try again.')
    }
  }

  async function handleVerifyOtp() {
    if (!otp || !otpVerification) return
    setError(null)
    try {
      await verifyCode(otpVerification, otp)
    } catch {
      setError('Invalid code. Please try again.')
    }
  }

  async function handleConnectWallet(walletProviderKey: string) {
    setError(null)
    setConnectingKey(walletProviderKey)
    try {
      await connectWithProvider(walletProviderKey)
    } catch {
      setError('Could not connect wallet. Please try again.')
      setConnectingKey(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="relative bg-hoff-surface rounded-2xl w-full max-w-[400px] overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-hoff-text-primary">Log in or sign up</h2>
            <p className="text-xs text-hoff-text-tertiary mt-1">
              Connect your wallet or use email to get started
            </p>
          </div>
          <button
            onClick={handleClose}
            className="mt-0.5 p-1 rounded-lg text-hoff-text-tertiary hover:text-hoff-text-secondary hover:bg-hoff-elevated transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {error && (
          <div className="mx-6 mb-3">
            <p className="text-xs text-hoff-err bg-hoff-err-bg px-3 py-2 rounded-lg">{error}</p>
          </div>
        )}

        {/* Main step — email + wallets */}
        {step === 'main' && (
          <div className="px-6 pb-6">
            {/* Email input */}
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
                placeholder="Enter your email"
                className="flex-1 h-12 px-4 rounded-xl bg-hoff-elevated border border-hoff-brand text-sm text-hoff-text-primary placeholder:text-hoff-text-tertiary focus:outline-none focus:border-hoff-accent/60 transition-colors"
              />
              <button
                onClick={handleSendOtp}
                disabled={!email || isLoading}
                className="h-12 px-5 rounded-xl bg-hoff-accent text-hoff-accent-fg text-sm font-bold hover:bg-hoff-accent-hover transition-colors disabled:opacity-40 flex items-center justify-center shrink-0"
              >
                {isLoading && !connectingKey ? <Spinner size="sm" /> : 'Continue'}
              </button>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-hoff-brand" />
              <span className="text-[11px] text-hoff-text-tertiary uppercase tracking-wider">or continue with</span>
              <div className="flex-1 h-px bg-hoff-brand" />
            </div>

            {/* Wallet list */}
            <div className="space-y-2">
              {!isClientReady ? (
                <div className="flex items-center justify-center py-6">
                  <Spinner size="sm" />
                </div>
              ) : walletProviders.length === 0 ? (
                <p className="text-center text-xs text-hoff-text-tertiary py-4">
                  No wallets detected. Install a browser wallet to connect.
                </p>
              ) : (
                walletProviders.map((provider) => (
                  <button
                    key={provider.key}
                    onClick={() => handleConnectWallet(provider.key)}
                    disabled={isLoading}
                    className="w-full h-14 rounded-xl bg-hoff-elevated border border-hoff-brand text-sm font-medium text-hoff-text-primary hover:border-hoff-accent/40 hover:bg-hoff-brand/60 transition-colors flex items-center gap-3 px-4 disabled:opacity-50"
                  >
                    {connectingKey === provider.key ? (
                      <div className="w-8 h-8 flex items-center justify-center">
                        <Spinner size="sm" />
                      </div>
                    ) : (
                      <img
                        src={provider.icon}
                        alt=""
                        className="w-8 h-8 rounded-lg"
                      />
                    )}
                    <span className="flex-1 text-left">{provider.displayName}</span>
                    <span className="text-[10px] text-hoff-accent bg-hoff-accent-muted px-2 py-0.5 rounded-full font-medium">
                      Installed
                    </span>
                  </button>
                ))
              )}
            </div>

            {/* Footer */}
            <p className="text-center text-[10px] text-hoff-text-tertiary mt-5 leading-relaxed">
              By connecting, you agree to the terms of service
            </p>
          </div>
        )}

        {/* OTP step */}
        {step === 'otp' && (
          <div className="px-6 pb-6 space-y-4">
            <p className="text-sm text-hoff-text-secondary">
              We sent a verification code to <span className="text-hoff-text-primary font-medium">{email}</span>
            </p>
            <input
              type="text"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
              placeholder="Enter 6-digit code"
              autoFocus
              inputMode="numeric"
              className="w-full h-12 px-4 rounded-xl bg-hoff-elevated border border-hoff-brand text-sm text-hoff-text-primary text-center tracking-[0.3em] font-mono placeholder:text-hoff-text-tertiary placeholder:tracking-normal focus:outline-none focus:border-hoff-accent/60"
            />
            <button
              onClick={handleVerifyOtp}
              disabled={otp.length < 6 || isLoading}
              className="w-full h-12 rounded-xl bg-hoff-accent text-hoff-accent-fg text-sm font-bold hover:bg-hoff-accent-hover transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {isLoading ? <Spinner size="sm" /> : 'Verify'}
            </button>
            <button
              onClick={() => { setStep('main'); setOtp(''); setError(null) }}
              className="w-full text-xs text-hoff-text-tertiary hover:text-hoff-text-secondary transition-colors text-center py-1"
            >
              Use a different email
            </button>
          </div>
        )}

        {/* Powered by */}
        <div className="bg-hoff-bg/40 border-t border-hoff-brand px-6 py-3 flex items-center justify-center gap-1.5">
          <span className="text-[10px] text-hoff-text-tertiary">Powered by</span>
          <span className="text-[10px] text-hoff-text-secondary font-semibold">Dynamic</span>
        </div>
      </div>
    </div>
  )
}
