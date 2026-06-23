import React, { useEffect, useState } from 'react'
import { Download, RefreshCw, X, RotateCw } from 'lucide-react'
import { useStore } from '../store/useStore'
import { T } from '../i18n'

type Phase = 'hidden' | 'available' | 'downloading' | 'downloaded' | 'error'

/**
 * Floating, non-blocking update card (bottom-right). Driven by electron-updater
 * events forwarded from the main process. Flow (manual one-click download):
 *   update:available → user clicks Update → update:download → progress →
 *   update:downloaded → user clicks Restart & install → update:install.
 */
export function UpdateNotice(): React.ReactElement | null {
  const lang = useStore((s) => s.lang)
  const t = T[lang]
  const [phase, setPhase] = useState<Phase>('hidden')
  const [version, setVersion] = useState('')
  const [percent, setPercent] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const api = window.api as any
    const offAvail = api.onUpdateAvailable?.((info: { version: string }) => {
      setVersion(info.version)
      setPhase('available')
    })
    const offProgress = api.onUpdateProgress?.((p: { percent: number }) => {
      setPercent(p.percent ?? 0)
      setPhase('downloading')
    })
    const offDownloaded = api.onUpdateDownloaded?.((info: { version: string }) => {
      setVersion(info.version)
      setPhase('downloaded')
    })
    const offError = api.onUpdateError?.((info: { message: string }) => {
      setErrorMsg(info?.message ?? '')
      setPhase((cur) => (cur === 'downloading' || cur === 'available' ? 'error' : cur))
    })
    return () => { offAvail?.(); offProgress?.(); offDownloaded?.(); offError?.() }
  }, [])

  if (phase === 'hidden') return null

  const download = async (): Promise<void> => {
    setPhase('downloading')
    setPercent(0)
    await (window.api as any).downloadUpdate?.()
  }
  const install = (): void => { (window.api as any).installUpdate?.() }
  const dismiss = (): void => setPhase('hidden')

  return (
    <div
      className="fixed rounded-xl border shadow-2xl"
      style={{
        right: 16, bottom: 16, width: 300, zIndex: 9998,
        backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border)',
      }}
    >
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-start gap-2.5">
          <div
            className="flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0"
            style={{ backgroundColor: 'rgba(47, 129, 247, 0.12)' }}
          >
            {phase === 'error'
              ? <RefreshCw size={14} style={{ color: 'var(--status-confirm)' }} />
              : <Download size={14} style={{ color: 'var(--accent-blue)' }} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>
              {phase === 'error' ? t.updateErrorTitle
                : phase === 'downloaded' ? t.updateDownloaded(version)
                : phase === 'downloading' ? t.updateDownloading
                : t.updateAvailableTitle}
            </div>
            <div className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {phase === 'error' ? errorMsg
                : phase === 'downloaded' ? t.updateRestartInstall
                : phase === 'downloading' ? `${Math.round(percent)}%`
                : t.updateAvailableBody(version)}
            </div>

            {phase === 'downloading' && (
              <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-card-hover)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.max(2, Math.round(percent))}%`, backgroundColor: 'var(--accent-blue)' }}
                />
              </div>
            )}
          </div>
          {phase !== 'downloading' && (
            <button
              onClick={dismiss}
              className="flex-shrink-0 -mr-1 -mt-0.5 p-1 rounded transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {(phase === 'available' || phase === 'downloaded' || phase === 'error') && (
          <div className="flex justify-end gap-2 mt-3">
            {phase === 'available' && (
              <>
                <button
                  onClick={dismiss}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors"
                  style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >
                  {t.updateLater}
                </button>
                <button
                  onClick={download}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-opacity"
                  style={{ backgroundColor: 'var(--accent-blue)', color: '#fff' }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.88' }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                >
                  {t.updateDownload}
                </button>
              </>
            )}
            {phase === 'downloaded' && (
              <button
                onClick={install}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-opacity flex items-center gap-1.5"
                style={{ backgroundColor: 'var(--accent-blue)', color: '#fff' }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.88' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
              >
                <RotateCw size={12} /> {t.updateRestartInstall}
              </button>
            )}
            {phase === 'error' && (
              <button
                onClick={download}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-opacity"
                style={{ backgroundColor: 'var(--accent-blue)', color: '#fff' }}
              >
                {t.retry}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
