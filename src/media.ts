function pending(root: Element): Array<HTMLImageElement | HTMLVideoElement> {
  const out: Array<HTMLImageElement | HTMLVideoElement> = []
  for (const img of root.querySelectorAll('img')) {
    if (!img.complete)
      out.push(img)
  }
  for (const video of root.querySelectorAll('video')) {
    if (video.readyState < 1 && video.preload !== 'none')
      out.push(video)
  }
  return out
}

export function hasPendingMedia(root: Element): boolean {
  return pending(root).length > 0
}

export function settleMedia(roots: Element[], timeout: number): Promise<void> {
  const waits: Promise<void>[] = []
  for (const root of roots) {
    for (const el of pending(root)) {
      if (el instanceof HTMLImageElement && el.loading === 'lazy')
        el.loading = 'eager'
      waits.push(new Promise((resolve) => {
        const done = () => resolve()
        const ok = el instanceof HTMLVideoElement ? 'loadedmetadata' : 'load'
        el.addEventListener(ok, done, { once: true })
        el.addEventListener('error', done, { once: true })
      }))
    }
  }
  if (!waits.length || timeout <= 0)
    return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeout)
    Promise.all(waits).then(() => {
      clearTimeout(timer)
      resolve()
    })
  })
}
