<script setup lang="ts">
import { onMounted } from 'vue'
import { useBookmarkStore } from '@/stores/bookmark'

const bookmarkStore = useBookmarkStore()

onMounted(async () => {
  try {
    await bookmarkStore.loadBookmarks()
  } catch (error) {
    console.error('加载书签失败:', error)
  }
})

// --- Favicon 加载（四级降级，含本地缓存）---
const FAVICON_CACHE_PREFIX = 'fav:'
const FAVICON_CACHE_MAX = 120

const pikachuIcons = ['png/pkq1.png', 'png/pkq2.png', 'png/pkq3.png', 'png/pkq4.png']

const getPikachuIcon = (url: string): string => {
  let hash = 0
  for (let i = 0; i < url.length; i++) hash = ((hash << 5) - hash) + url.charCodeAt(i)
  return pikachuIcons[Math.abs(hash) % pikachuIcons.length]
}

const hashUrl = (url: string): string => {
  let h = 0
  for (let i = 0; i < url.length; i++) h = ((h << 5) - h + url.charCodeAt(i)) | 0
  return (h >>> 0).toString(16)
}

const getCachedFavicon = (url: string): string | null => {
  try {
    return localStorage.getItem(FAVICON_CACHE_PREFIX + hashUrl(url))
  } catch {
    return null
  }
}

const setCachedFavicon = (url: string, dataUrl: string) => {
  try {
    const key = FAVICON_CACHE_PREFIX + hashUrl(url)
    localStorage.setItem(key, dataUrl)

    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(FAVICON_CACHE_PREFIX)) keys.push(k)
    }
    if (keys.length > FAVICON_CACHE_MAX) {
      keys.sort((a, b) => {
        const va = parseInt(localStorage.getItem(a + '_ts') || '0')
        const vb = parseInt(localStorage.getItem(b + '_ts') || '0')
        return va - vb
      })
      const remove = keys.slice(0, keys.length - FAVICON_CACHE_MAX)
      remove.forEach((k) => {
        localStorage.removeItem(k)
        localStorage.removeItem(k + '_ts')
      })
    }
    localStorage.setItem(key + '_ts', String(Date.now()))
  } catch {
    // localStorage 满时静默忽略
  }
}

const getFaviconUrl = (url: string) => {
  const cached = getCachedFavicon(url)
  if (cached) return cached

  try {
    return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`
  } catch {
    return getPikachuIcon(url)
  }
}

const getDirectFaviconUrl = (url: string): string => {
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.hostname}/favicon.ico`
  } catch {
    return ''
  }
}

const getGoogleFaviconUrl = (url: string): string => {
  try {
    const domain = new URL(url).hostname
    return 'https://www.google.com/s2/favicons?domain=' + domain + '&sz=32'
  } catch {
    return ''
  }
}

const checkFaviconError = (event: Event) => {
  const img = event.target as HTMLImageElement
  const url = img.dataset.bookmarkUrl
  if (!url) return

  img.classList.remove('loaded')

  const step = parseInt(img.dataset.fb || '0')
  if (step === 0) {
    const direct = getDirectFaviconUrl(url)
    if (direct) { img.src = direct; img.dataset.fb = '1'; return }
  }
  if (step <= 1) {
    const google = getGoogleFaviconUrl(url)
    if (google) { img.src = google; img.dataset.fb = '2'; return }
  }
  img.src = getPikachuIcon(url)
}

const checkFaviconLoad = (event: Event) => {
  const img = event.target as HTMLImageElement
  const url = img.dataset.bookmarkUrl
  if (!url) return

  if (isBlankImage(img)) {
    if (getCachedFavicon(url)) {
      try {
        localStorage.removeItem(FAVICON_CACHE_PREFIX + hashUrl(url))
        localStorage.removeItem(FAVICON_CACHE_PREFIX + hashUrl(url) + '_ts')
      } catch {}
    }
    checkFaviconError(event)
  } else {
    img.classList.add('loaded')
    if (!getCachedFavicon(url)) {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0)
          const dataUrl = canvas.toDataURL('image/png')
          setCachedFavicon(url, dataUrl)
        }
      } catch {}
    }
  }
}

// Canvas 采样检测：判断图片是否全透明（空白图）
const isBlankImage = (img: HTMLImageElement): boolean => {
  if (img.naturalWidth <= 1 || img.naturalHeight <= 1) return true

  try {
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return false

    ctx.drawImage(img, 0, 0)

    const w = img.naturalWidth
    const h = img.naturalHeight
    const points = [
      [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
      [Math.floor(w / 2), Math.floor(h / 2)],
    ]

    for (const [x, y] of points) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue
      const data = ctx.getImageData(x, y, 1, 1).data
      if (data[3] > 0) return false
    }
    return true
  } catch {
    return false
  }
}
</script>

<template>
  <div v-if="bookmarkStore.loading" class="loading">
    <p>加载书签中...</p>
  </div>
  <div v-else-if="bookmarkStore.error" class="error">
    <p>{{ bookmarkStore.error }}</p>
  </div>
  <div v-else class="container">
    <div v-for="category in bookmarkStore.categories" :key="category.id" class="category">
      <div class="category-title">{{ category.name }}</div>
      <div v-for="bookmark in category.bookmarks" :key="bookmark.id" class="link-item">
        <img
          :src="getFaviconUrl(bookmark.url)"
          :data-bookmark-url="bookmark.url"
          class="favicon"
          loading="lazy"
          @error="checkFaviconError"
          @load="checkFaviconLoad"
          alt=""
        />
        <a :href="bookmark.url" target="_blank" class="link-text">{{ bookmark.title }}</a>
      </div>
      <div v-for="subcat in category.subcategories" :key="subcat.id" class="subcategory">
        <div class="category-title">{{ subcat.name }}</div>
        <div v-for="bookmark in bookmarkStore.getBookmarksByCategory(category.id, subcat.id)" :key="bookmark.id" class="link-item">
          <img
            :src="getFaviconUrl(bookmark.url)"
            :data-bookmark-url="bookmark.url"
          class="favicon"
          loading="lazy"
            @error="checkFaviconError"
          @load="checkFaviconLoad"
            alt=""
          />
          <a :href="bookmark.url" target="_blank" class="link-text">{{ bookmark.title }}</a>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.container {
  width: 400px;
  padding: 10px;
  font-family: Arial, sans-serif;
  overflow-y: auto;
}

.category {
  margin-bottom: 15px;
}

.category-title {
  font-weight: bold;
  margin-bottom: 5px;
  padding: 5px;
  background-color: #f0f0f0;
  border-radius: 3px;
}

.link-item {
  display: flex;
  align-items: center;
  margin-bottom: 5px;
  padding: 5px;
  border-radius: 3px;
}

.link-item:hover {
  background-color: #f5f5f5;
}

.favicon {
  width: 16px;
  height: 16px;
  margin-right: 8px;
  opacity: 0;
  transition: opacity 0.25s ease;
}

.favicon.loaded {
  opacity: 1;
}

.link-text {
  flex: 1;
  text-decoration: none;
  color: #333;
}

.link-text:hover {
  text-decoration: underline;
}

.loading,
.error {
  text-align: center;
  margin-top: 20px;
}
</style>
