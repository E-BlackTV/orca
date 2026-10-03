import { runInNewContext } from 'node:vm'
import { Window } from 'happy-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildBrowserAnnotationViewportBridgeScript } from './browser-annotation-viewport-bridge'

const guestWindows: Window[] = []

afterEach(async () => {
  await Promise.all(guestWindows.splice(0).map((window) => window.happyDOM.abort()))
})

function createGuest() {
  const window = new Window()
  guestWindows.push(window)
  const requestAnimationFrame = vi.fn(() => 17)
  const cancelAnimationFrame = vi.fn()
  const context = { window, document: window.document, requestAnimationFrame, cancelAnimationFrame }
  const install = (enabled = true): void => {
    runInNewContext(
      buildBrowserAnnotationViewportBridgeScript({
        emitViewport: false,
        enabled,
        token: 'lifecycle-test-token',
        markers: [
          {
            id: 'saved-note',
            index: 0,
            isFixed: false,
            rectPage: { x: 10, y: 20, width: 80, height: 30 },
            rectViewport: { x: 10, y: 20, width: 80, height: 30 }
          }
        ]
      }),
      context
    )
  }
  const markerHosts = (): number =>
    window.document.querySelectorAll('[data-orca-browser-annotation-overlay]').length
  return { window, context, install, markerHosts, requestAnimationFrame, cancelAnimationFrame }
}

describe('browser annotation guest document lifecycle', () => {
  it('retires visible markers before a replacement document finishes loading', () => {
    const guest = createGuest()
    guest.install()
    expect(guest.markerHosts()).toBe(1)

    guest.window.dispatchEvent(new guest.window.Event('beforeunload'))

    expect(guest.markerHosts()).toBe(0)
    expect(Reflect.has(guest.context, '__orcaBrowserAnnotationViewportBridge')).toBe(false)
    expect(guest.cancelAnimationFrame).toHaveBeenCalledWith(17)
    guest.requestAnimationFrame.mockClear()
    guest.window.dispatchEvent(new guest.window.Event('scroll'))
    guest.window.document.dispatchEvent(new guest.window.Event('scroll'))
    guest.window.dispatchEvent(new guest.window.Event('resize'))
    expect(guest.requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('removes the old unload listener when disabled and can install fresh markers', () => {
    const guest = createGuest()
    guest.install()
    guest.install(false)
    expect(guest.markerHosts()).toBe(0)
    guest.install()
    expect(guest.markerHosts()).toBe(1)
    guest.cancelAnimationFrame.mockClear()

    guest.window.dispatchEvent(new guest.window.Event('beforeunload'))

    expect(guest.markerHosts()).toBe(0)
    expect(guest.cancelAnimationFrame).toHaveBeenCalledTimes(1)
  })
})
