import { useState, useRef, useEffect, useCallback } from 'react'
import {
  getWalletAccounts,
  getBalance,
  getActiveNetworkData,
  getNetworksData,
  switchActiveNetwork,
  addNetwork,
} from '@dynamic-labs-sdk/client'
import type { WalletAccount } from '@dynamic-labs-sdk/client'
import {
  exportWaasPrivateKey,
  isWaasWalletAccount,
} from '@dynamic-labs-sdk/client/waas'
import { createWalletClientForWalletAccount } from '@dynamic-labs-sdk/evm/viem'
import { parseEther } from 'viem'
import { useDynamicAuth } from '@/hooks/useDynamicAuth'
import { Spinner } from '@/components/ui/Spinner'

type Panel = 'main' | 'deposit' | 'send' | 'profile' | 'settings' | 'networks'

interface WalletInfo {
  balance: string | null
  networkName: string
  networkIcon: string
  networkId: string
  currencySymbol: string
  isTestnet: boolean
}

interface NetworkOption {
  networkId: string
  displayName: string
  iconUrl: string
  testnet: boolean
}

export function WalletButton() {
  const { isAuthenticated, walletAddress, login, disconnect } = useDynamicAuth()
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState<Panel>('main')
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(false)
  const [copied, setCopied] = useState(false)
  const [networks, setNetworks] = useState<NetworkOption[]>([])
  const ref = useRef<HTMLDivElement>(null)

  // Send form
  const [sendTo, setSendTo] = useState('')
  const [sendAmount, setSendAmount] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ hash?: string; error?: string } | null>(null)

  // Export key
  const keyContainerRef = useRef<HTMLDivElement>(null)
  const [exportingKey, setExportingKey] = useState(false)
  const [keyExported, setKeyExported] = useState(false)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setPanel('main')
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const getFirstAccount = useCallback((): WalletAccount | null => {
    const accounts = getWalletAccounts()
    return (accounts?.[0] as WalletAccount) ?? null
  }, [])

  const loadWalletInfo = useCallback(async () => {
    setLoadingInfo(true)
    try {
      const walletAccount = getFirstAccount()
      if (!walletAccount) return

      const [balanceResult, networkResult] = await Promise.all([
        getBalance({ walletAccount }).catch(() => ({ balance: null })),
        getActiveNetworkData({ walletAccount }).catch(() => ({ networkData: undefined })),
      ])

      setWalletInfo({
        balance: balanceResult.balance,
        networkName: networkResult.networkData?.displayName ?? 'Unknown',
        networkIcon: networkResult.networkData?.iconUrl ?? '',
        networkId: networkResult.networkData?.networkId ?? '',
        currencySymbol: networkResult.networkData?.nativeCurrency.symbol ?? 'ETH',
        isTestnet: networkResult.networkData?.testnet ?? false,
      })
    } catch {
      // silently fail
    } finally {
      setLoadingInfo(false)
    }
  }, [getFirstAccount])

  const loadNetworks = useCallback(() => {
    try {
      const data = getNetworksData()
      setNetworks(
        data.map((n: { networkId: string; displayName: string; iconUrl: string; testnet: boolean }) => ({
          networkId: n.networkId,
          displayName: n.displayName,
          iconUrl: n.iconUrl,
          testnet: n.testnet,
        }))
      )
    } catch {
      // no networks available
    }
  }, [])

  useEffect(() => {
    if (open && isAuthenticated) {
      loadWalletInfo()
      loadNetworks()
    }
  }, [open, isAuthenticated, loadWalletInfo, loadNetworks])

  function handleCopy() {
    if (!walletAddress) return
    navigator.clipboard.writeText(walletAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const [switchingNetwork, setSwitchingNetwork] = useState(false)

  async function handleSwitchNetwork(networkId: string) {
    const walletAccount = getFirstAccount()
    if (!walletAccount || switchingNetwork) return
    setSwitchingNetwork(true)
    try {
      await switchActiveNetwork({ walletAccount, networkId })
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'networkData' in error) {
        const netErr = error as { networkData: Parameters<typeof addNetwork>[0]['networkData'] }
        try {
          await addNetwork({ walletAccount, networkData: netErr.networkData })
          await switchActiveNetwork({ walletAccount, networkId })
        } catch {
          // wallet rejected adding network
        }
      }
    }
    // Wait for wallet extension to settle after network switch
    await new Promise(r => setTimeout(r, 1000))
    await loadWalletInfo().catch(() => {})
    setSwitchingNetwork(false)
    setPanel('main')
  }

  async function handleSend() {
    if (!sendTo || !sendAmount) return
    setSending(true)
    setSendResult(null)
    try {
      const walletAccount = getFirstAccount()
      if (!walletAccount) throw new Error('No wallet connected')

      const walletClient = await createWalletClientForWalletAccount({ walletAccount })
      const hash = await walletClient.sendTransaction({
        to: sendTo as `0x${string}`,
        value: parseEther(sendAmount),
      })
      setSendResult({ hash })
      setSendTo('')
      setSendAmount('')
    } catch (err) {
      setSendResult({ error: err instanceof Error ? err.message : 'Transaction failed' })
    } finally {
      setSending(false)
    }
  }

  async function handleExportKey() {
    if (!keyContainerRef.current) return
    setExportingKey(true)
    try {
      const walletAccount = getFirstAccount()
      if (!walletAccount || !isWaasWalletAccount({ walletAccount })) {
        setExportingKey(false)
        return
      }
      await exportWaasPrivateKey({
        walletAccount,
        displayContainer: keyContainerRef.current,
      })
      setKeyExported(true)
    } catch {
      setExportingKey(false)
    }
  }

  function handleClose() {
    setOpen(false)
    setPanel('main')
    setSendResult(null)
    setKeyExported(false)
  }

  if (!isAuthenticated || !walletAddress) {
    return (
      <button
        onClick={login}
        className="h-9 px-4 rounded-xl bg-hoff-accent text-hoff-bg text-xs font-bold hover:bg-hoff-accent-hover transition-colors"
      >
        Connect
      </button>
    )
  }

  const short = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
  const formattedBalance = walletInfo?.balance
    ? parseFloat(walletInfo.balance).toFixed(4)
    : '—'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { if (open) handleClose(); else setOpen(true) }}
        className="h-9 px-3 rounded-xl bg-hoff-elevated border border-hoff-brand text-xs font-mono text-hoff-text-primary hover:border-hoff-accent/40 transition-colors flex items-center gap-2"
      >
        <span className="w-2 h-2 rounded-full bg-hoff-accent shrink-0" />
        {short}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 bg-hoff-surface border border-hoff-brand rounded-2xl shadow-xl w-[320px] z-50 overflow-hidden">

          {/* ===== MAIN PANEL ===== */}
          {panel === 'main' && (
            <>
              {/* Network bar */}
              <button
                onClick={() => setPanel('networks')}
                className="w-full px-4 py-3 bg-hoff-bg/40 border-b border-hoff-brand flex items-center gap-2 hover:bg-hoff-bg/60 transition-colors"
              >
                {walletInfo?.networkIcon && (
                  <img src={walletInfo.networkIcon} alt="" className="w-4 h-4 rounded-full" />
                )}
                <span className="text-xs text-hoff-text-secondary font-medium flex-1 text-left">
                  {walletInfo?.networkName ?? 'Loading...'}
                </span>
                {walletInfo?.isTestnet && (
                  <span className="text-[9px] bg-amber-900/30 text-amber-400 px-1.5 py-0.5 rounded-full font-medium">
                    Testnet
                  </span>
                )}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-hoff-text-tertiary">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {/* Balance */}
              <div className="px-4 pt-5 pb-4 text-center">
                {loadingInfo ? (
                  <div className="flex justify-center py-2"><Spinner size="sm" /></div>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-hoff-text-primary tracking-tight">
                      {formattedBalance} {walletInfo?.currencySymbol}
                    </p>
                    <p className="text-[11px] text-hoff-text-tertiary mt-1">Total balance</p>
                  </>
                )}
              </div>

              {/* Action buttons */}
              <div className="px-4 pb-4 flex gap-2">
                <ActionBtn label="Deposit" onClick={() => setPanel('deposit')} icon={<ArrowDown />} />
                <ActionBtn label="Send" onClick={() => { setPanel('send'); setSendResult(null) }} icon={<ArrowUp />} />
                <ActionBtn label="Swap" onClick={() => window.open(`https://app.uniswap.org/swap?chain=base`, '_blank')} icon={<SwapIcon />} />
              </div>

              <div className="h-px bg-hoff-brand" />

              {/* Menu */}
              <div className="py-1">
                <MenuItem label={copied ? 'Copied!' : 'Copy address'} detail={short} onClick={handleCopy} icon={<CopyIcon />} />
                <MenuItem label="Profile" onClick={() => setPanel('profile')} icon={<UserIcon />} />
                <MenuItem label="Settings" onClick={() => setPanel('settings')} icon={<GearIcon />} />
              </div>

              <div className="h-px bg-hoff-brand" />
              <div className="py-1">
                <button
                  onClick={() => { disconnect(); handleClose() }}
                  className="w-full px-4 py-2.5 flex items-center gap-3 text-red-400 hover:bg-red-900/10 transition-colors"
                >
                  <LogoutIcon />
                  <span className="text-xs font-medium">Disconnect</span>
                </button>
              </div>
              <PoweredBy />
            </>
          )}

          {/* ===== DEPOSIT PANEL ===== */}
          {panel === 'deposit' && (
            <>
              <PanelHeader title="Deposit" onBack={() => setPanel('main')} />
              <div className="px-4 pb-5 space-y-4">
                <p className="text-xs text-hoff-text-tertiary">
                  Send {walletInfo?.currencySymbol ?? 'funds'} to this address on {walletInfo?.networkName ?? 'your network'}
                </p>
                {/* Address display */}
                <div className="bg-hoff-elevated rounded-xl p-4 break-all text-center">
                  <p className="text-xs font-mono text-hoff-text-primary leading-relaxed">{walletAddress}</p>
                </div>
                <button
                  onClick={handleCopy}
                  className="w-full h-12 rounded-xl bg-hoff-accent text-hoff-bg text-sm font-bold hover:bg-hoff-accent-hover transition-colors flex items-center justify-center gap-2"
                >
                  {copied ? 'Copied!' : 'Copy Address'}
                </button>
              </div>
              <PoweredBy />
            </>
          )}

          {/* ===== SEND PANEL ===== */}
          {panel === 'send' && (
            <>
              <PanelHeader title="Send" onBack={() => { setPanel('main'); setSendResult(null) }} />
              <div className="px-4 pb-5 space-y-3">
                <div>
                  <label className="text-[11px] text-hoff-text-tertiary mb-1 block">Recipient address</label>
                  <input
                    type="text"
                    value={sendTo}
                    onChange={e => setSendTo(e.target.value)}
                    placeholder="0x..."
                    className="w-full h-12 px-4 rounded-xl bg-hoff-elevated border border-hoff-brand text-sm font-mono text-hoff-text-primary placeholder:text-hoff-text-tertiary focus:outline-none focus:border-hoff-accent/60 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-hoff-text-tertiary mb-1 block">
                    Amount ({walletInfo?.currencySymbol ?? 'ETH'})
                  </label>
                  <input
                    type="text"
                    value={sendAmount}
                    onChange={e => setSendAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="0.00"
                    className="w-full h-12 px-4 rounded-xl bg-hoff-elevated border border-hoff-brand text-sm font-mono text-hoff-text-primary placeholder:text-hoff-text-tertiary focus:outline-none focus:border-hoff-accent/60 transition-colors"
                  />
                  {walletInfo?.balance && (
                    <button
                      onClick={() => setSendAmount(walletInfo.balance ?? '')}
                      className="text-[10px] text-hoff-accent mt-1 hover:underline"
                    >
                      Max: {parseFloat(walletInfo.balance).toFixed(4)} {walletInfo.currencySymbol}
                    </button>
                  )}
                </div>

                {sendResult?.hash && (
                  <div className="bg-green-900/20 text-green-400 text-xs px-3 py-2.5 rounded-lg break-all">
                    Sent! Tx: {sendResult.hash.slice(0, 10)}...{sendResult.hash.slice(-8)}
                  </div>
                )}
                {sendResult?.error && (
                  <div className="bg-red-900/20 text-red-400 text-xs px-3 py-2.5 rounded-lg">
                    {sendResult.error}
                  </div>
                )}

                <button
                  onClick={handleSend}
                  disabled={!sendTo || !sendAmount || sending}
                  className="w-full h-12 rounded-xl bg-hoff-accent text-hoff-bg text-sm font-bold hover:bg-hoff-accent-hover transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {sending ? <Spinner size="sm" /> : 'Send'}
                </button>
              </div>
              <PoweredBy />
            </>
          )}

          {/* ===== PROFILE PANEL ===== */}
          {panel === 'profile' && (
            <>
              <PanelHeader title="Profile" onBack={() => setPanel('main')} />
              <div className="px-4 pb-5 space-y-4">
                {/* Avatar */}
                <div className="flex flex-col items-center gap-2 py-2">
                  <div className="w-14 h-14 rounded-full bg-hoff-accent-muted flex items-center justify-center text-hoff-accent text-xl font-bold">
                    {walletAddress.slice(2, 4).toUpperCase()}
                  </div>
                  <p className="text-xs font-mono text-hoff-text-secondary">{short}</p>
                </div>

                <InfoRow label="Full address" value={walletAddress} mono copyable onCopy={handleCopy} />
                <InfoRow label="Network" value={walletInfo?.networkName ?? '—'} />
                <InfoRow label="Chain" value={walletInfo?.networkId ?? '—'} />
                <InfoRow label="Balance" value={`${formattedBalance} ${walletInfo?.currencySymbol ?? ''}`} />
              </div>
              <PoweredBy />
            </>
          )}

          {/* ===== SETTINGS PANEL ===== */}
          {panel === 'settings' && (
            <>
              <PanelHeader title="Settings" onBack={() => setPanel('main')} />
              <div className="py-1">
                <MenuItem label="Switch network" onClick={() => setPanel('networks')} icon={<GlobeIcon />} />
                <MenuItem label="Export private key" onClick={handleExportKey} icon={<KeyIcon />} />
              </div>

              {/* Export key container */}
              {(exportingKey || keyExported) && (
                <div className="px-4 pb-4">
                  <div
                    ref={keyContainerRef}
                    className="bg-hoff-elevated rounded-xl p-3 min-h-[60px] flex items-center justify-center"
                  >
                    {exportingKey && !keyExported && <Spinner size="sm" />}
                  </div>
                  <p className="text-[10px] text-amber-400 mt-2 text-center">
                    Never share your private key with anyone
                  </p>
                </div>
              )}
              <PoweredBy />
            </>
          )}

          {/* ===== NETWORKS PANEL ===== */}
          {panel === 'networks' && (
            <>
              <PanelHeader title="Switch network" onBack={() => !switchingNetwork && setPanel('main')} />
              {switchingNetwork && (
                <div className="flex items-center justify-center gap-2 px-4 py-3 text-hoff-text-secondary">
                  <Spinner size="sm" />
                  <span className="text-xs">Switching network...</span>
                </div>
              )}
              <div className="py-1 max-h-64 overflow-y-auto">
                {networks.length === 0 ? (
                  <p className="text-xs text-hoff-text-tertiary text-center py-4">No networks configured</p>
                ) : (
                  networks.map((n) => (
                    <button
                      key={n.networkId}
                      onClick={() => handleSwitchNetwork(n.networkId)}
                      disabled={switchingNetwork}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-hoff-elevated/60 transition-colors disabled:opacity-40"
                    >
                      {n.iconUrl ? (
                        <img src={n.iconUrl} alt="" className="w-6 h-6 rounded-full" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-hoff-elevated" />
                      )}
                      <span className="text-xs text-hoff-text-primary font-medium flex-1 text-left">
                        {n.displayName}
                      </span>
                      {walletInfo?.networkId === n.networkId && (
                        <span className="w-2 h-2 rounded-full bg-hoff-accent" />
                      )}
                      {n.testnet && (
                        <span className="text-[9px] bg-amber-900/30 text-amber-400 px-1.5 py-0.5 rounded-full font-medium">
                          Testnet
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
              <PoweredBy />
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ──

function PanelHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="px-4 py-3 bg-hoff-bg/40 border-b border-hoff-brand flex items-center gap-3">
      <button onClick={onBack} className="text-hoff-text-tertiary hover:text-hoff-text-secondary transition-colors">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <span className="text-sm font-semibold text-hoff-text-primary">{title}</span>
    </div>
  )
}

function ActionBtn({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl bg-hoff-elevated border border-hoff-brand hover:border-hoff-accent/40 transition-colors"
    >
      <div className="w-8 h-8 rounded-full bg-hoff-accent-muted text-hoff-accent flex items-center justify-center">
        {icon}
      </div>
      <span className="text-[10px] text-hoff-text-secondary font-medium">{label}</span>
    </button>
  )
}

function MenuItem({ label, icon, detail, onClick }: { label: string; icon: React.ReactNode; detail?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-hoff-elevated/60 transition-colors"
    >
      <span className="text-hoff-text-tertiary">{icon}</span>
      <span className="text-xs text-hoff-text-primary font-medium flex-1 text-left">{label}</span>
      {detail && <span className="text-[10px] text-hoff-text-tertiary font-mono">{detail}</span>}
    </button>
  )
}

function InfoRow({ label, value, mono, copyable, onCopy }: { label: string; value: string; mono?: boolean; copyable?: boolean; onCopy?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-[11px] text-hoff-text-tertiary shrink-0">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={`text-[11px] text-hoff-text-primary truncate ${mono ? 'font-mono' : ''}`}>
          {mono ? `${value.slice(0, 10)}...${value.slice(-6)}` : value}
        </span>
        {copyable && onCopy && (
          <button onClick={onCopy} className="text-hoff-text-tertiary hover:text-hoff-accent shrink-0 transition-colors">
            <CopyIcon />
          </button>
        )}
      </div>
    </div>
  )
}

function PoweredBy() {
  return (
    <div className="bg-hoff-bg/40 border-t border-hoff-brand px-4 py-2.5 flex items-center justify-center gap-1.5">
      <span className="text-[10px] text-hoff-text-tertiary">Powered by</span>
      <span className="text-[10px] text-hoff-text-secondary font-semibold">Dynamic</span>
    </div>
  )
}

// ── Icons ──

function ArrowDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12l7 7 7-7"/>
    </svg>
  )
}

function ArrowUp() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 19V5M5 12l7-7 7 7"/>
    </svg>
  )
}

function SwapIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/>
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
    </svg>
  )
}

function UserIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
    </svg>
  )
}

function KeyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  )
}
