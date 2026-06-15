<script setup lang="ts">
import { onMounted, ref, computed, watch, onBeforeUnmount } from 'vue'
import { useBookmarkStore, type Bookmark, type Category } from '@/stores/bookmark'
import { useSearchStore } from '@/stores/search'

// 性能监控
const performanceMetrics = ref({
  loadTime: 0,
  renderTime: 0,
  memory: 0,
  paintTime: 0,
  layoutTime: 0
})

const startTime = performance.now()

// 监控首次绘制和首次内容绘制
if (typeof performance !== 'undefined' && 'getEntriesByType' in performance) {
  const observer = new PerformanceObserver((list) => {
    list.getEntries().forEach((entry) => {
      if (entry.name === 'first-paint') {
        console.log('首次绘制时间:', entry.startTime.toFixed(2), 'ms')
      } else if (entry.name === 'first-contentful-paint') {
        console.log('首次内容绘制时间:', entry.startTime.toFixed(2), 'ms')
        performanceMetrics.value.paintTime = entry.startTime
      }
    })
  })
  observer.observe({ entryTypes: ['paint'] })
}

const updatePerformanceMetrics = () => {
  performanceMetrics.value.loadTime = performance.now() - startTime
  const perfMemory = (performance as { memory?: { usedJSHeapSize: number } }).memory
  performanceMetrics.value.memory = perfMemory ? perfMemory.usedJSHeapSize / 1024 / 1024 : 0
  
  // 记录性能指标到控制台
  if (perfMemory) {
    console.log('性能指标:', {
      loadTime: performanceMetrics.value.loadTime.toFixed(2),
      renderTime: performanceMetrics.value.renderTime.toFixed(2),
      memory: performanceMetrics.value.memory.toFixed(2),
      paintTime: performanceMetrics.value.paintTime.toFixed(2)
    })
  }
}

const performanceInterval = setInterval(updatePerformanceMetrics, 5000)

const bookmarkStore = useBookmarkStore()
const searchStore = useSearchStore()
const searchInput = ref<HTMLInputElement | null>(null)

const isDarkMode = ref<boolean>(false)
const currentTheme = ref<string>('pikachu-light')


const toggleTheme = () => {
  isDarkMode.value = !isDarkMode.value
  currentTheme.value = isDarkMode.value ? 'pikachu-dark' : 'pikachu-light'
  localStorage.setItem('pikachu-theme', isDarkMode.value ? 'dark' : 'light')
}

const loadTheme = () => {
  const savedTheme = localStorage.getItem('pikachu-theme')
  isDarkMode.value = savedTheme === 'dark'
  currentTheme.value = isDarkMode.value ? 'pikachu-dark' : 'pikachu-light'
}

const activeCategoryId = ref<string>('default')
const activeTabId = ref<string>('all')
const dailyQuote = ref<{
  content: string
  from: string
  fromWho: string
}>({
  content: '',
  from: '',
  fromWho: ''
})

const quoteVisible = ref<boolean>(false)
const QUOTE_INTERVAL = 10 * 60 * 1000

const getLastQuoteTime = (): number => {
  const stored = localStorage.getItem('lastQuoteTime')
  return stored ? parseInt(stored, 10) : 0
}

const saveLastQuoteTime = (time: number) => {
  localStorage.setItem('lastQuoteTime', time.toString())
}

const getStoredQuote = (): { content: string; from: string; fromWho: string } => {
  const stored = localStorage.getItem('dailyQuote')
  if (stored) {
    try {
      return JSON.parse(stored)
    } catch (error) {
      console.error('解析存储的每日一言失败:', error)
    }
  }
  return {
    content: '',
    from: '',
    fromWho: ''
  }
}

const saveQuote = (quote: { content: string; from: string; fromWho: string }) => {
  localStorage.setItem('dailyQuote', JSON.stringify(quote))
}

const scrollToTop = () => {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  })
}

const scrollToBottom = () => {
  window.scrollTo({
    top: document.body.scrollHeight,
    behavior: 'smooth'
  })
}

// 缓存网络请求结果
let quoteFetching = false

const getDailyQuote = async () => {
  // 避免并发请求
  if (quoteFetching) {
    return
  }
  
  const now = Date.now()
  const lastTime = getLastQuoteTime()
  if (now - lastTime < QUOTE_INTERVAL) {
    const storedQuote = getStoredQuote()
    if (storedQuote.content) {
      dailyQuote.value = storedQuote
      if (!quoteVisible.value) {
        quoteVisible.value = true
      }
    } else {
      const defaultQuote = {
        content: '十万伏特，为梦想充电！',
        from: '皮卡丘',
        fromWho: ''
      }
      dailyQuote.value = defaultQuote
      saveQuote(defaultQuote)
      quoteVisible.value = true
    }
    return
  }
  
  try {
    quoteFetching = true
    const response = await fetch('https://v1.hitokoto.cn/')
    const data = await response.json()
    const quote = {
      content: data.hitokoto,
      from: data.from || '',
      fromWho: data.from_who || ''
    }
    saveQuote(quote)
    saveLastQuoteTime(now)
    
    quoteVisible.value = false
    setTimeout(() => {
      dailyQuote.value = quote
      quoteVisible.value = true
    }, 50)
  } catch (error) {
    console.error('获取每日一言失败:', error)
    const storedQuote = getStoredQuote()
    if (storedQuote.content) {
      dailyQuote.value = storedQuote
    } else {
      const defaultQuote = {
        content: '十万伏特，为梦想充电！',
        from: '皮卡丘',
        fromWho: ''
      }
      dailyQuote.value = defaultQuote
      saveQuote(defaultQuote)
    }
    if (!quoteVisible.value) {
      quoteVisible.value = true
    }
  } finally {
    quoteFetching = false
  }
}

// 缓存计算结果
let cachedCategories: Category[] = []
let cachedCategoriesHash = ''

const filteredCategories = computed(() => {
  // 生成缓存哈希，用于检测数据是否变化
  const categoriesHash = JSON.stringify(bookmarkStore.categories)
  
  // 如果数据没有变化，直接返回缓存结果
  if (categoriesHash === cachedCategoriesHash) {
    return cachedCategories
  }
  
  const excludedNames = ['镜像站']
  const subcategoryIds = new Set<string>()
  for (const category of bookmarkStore.categories) {
    for (const subcat of category.subcategories) {
      subcategoryIds.add(subcat.id)
    }
  }
  const result = []
  for (const category of bookmarkStore.categories) {
    if (!excludedNames.includes(category.name) && !subcategoryIds.has(category.id)) {
      result.push(category)
    }
  }
  
  // 更新缓存
  cachedCategories = result
  cachedCategoriesHash = categoriesHash
  
  return result
})

onMounted(async () => {
  try {
    loadTheme()
    
    const storedQuote = getStoredQuote()
    if (storedQuote.content) {
      dailyQuote.value = storedQuote
      quoteVisible.value = true
    }
    
    await bookmarkStore.loadBookmarks()
    if (bookmarkStore.categories.length > 0 && bookmarkStore.categories[0]) {
      activeCategoryId.value = bookmarkStore.categories[0].id
      showCategoryContent(bookmarkStore.categories[0].id)
    }
    
    setTimeout(() => {
      searchInput.value?.focus()
    }, 100)
    
    const now = Date.now()
    const lastTime = getLastQuoteTime()
    if (now - lastTime >= QUOTE_INTERVAL) {
      setTimeout(async () => {
        await getDailyQuote()
        quoteVisible.value = false
        setTimeout(() => {
          quoteVisible.value = true
        }, 50)
      }, 1000)
    }
    
    // 记录渲染完成时间
    performanceMetrics.value.renderTime = performance.now() - startTime
  } catch (error) {
    console.error('加载书签失败:', error)
  }
})

onBeforeUnmount(() => {
  // 清除性能监控定时器
  if (performanceInterval) {
    clearInterval(performanceInterval)
  }
})

function showCategoryContent(categoryId: string) {
  activeCategoryId.value = categoryId
  activeTabId.value = 'all'
  scrollToTop()
}

function showTabContent(categoryId: string, tabId: string) {
  activeCategoryId.value = categoryId
  activeTabId.value = tabId
  scrollToTop()
}

// 缓存当前分类和标签，避免不必要的重新计算
const currentCategoryId = ref('')
const currentTabId = ref('')
const cachedBookmarks = ref<Bookmark[]>([])

const filteredBookmarks = computed(() => {
  if (searchStore.query.trim()) {
    return searchStore.filteredBookmarks
  }
  
  // 只有当分类或标签变化时才重新计算
  if (activeCategoryId.value !== currentCategoryId.value || activeTabId.value !== currentTabId.value) {
    currentCategoryId.value = activeCategoryId.value
    currentTabId.value = activeTabId.value
    cachedBookmarks.value = bookmarkStore.getBookmarksByCategory(activeCategoryId.value, activeTabId.value)
  }
  
  return cachedBookmarks.value
})

// 直接使用filteredBookmarks，优化渲染性能
const displayedBookmarks = computed(() => {
  return filteredBookmarks.value
})

// 监听分类和标签变化，滚动到顶部
watch([activeCategoryId, activeTabId], () => {
  scrollToTop()
})

// 当 store 中书签数据变化时（如拖拽移动后），重置缓存以强制刷新视图
watch(() => bookmarkStore.categories, () => {
  currentCategoryId.value = ''
  currentTabId.value = ''
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

    // 超过上限时清理最旧的条目
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

// 四级降级：本地缓存 → Chrome 缓存 → 网站直取 → Google CDN → 皮卡丘
const getFaviconUrl = (url: string): string => {
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
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
  } catch {
    return ''
  }
}

const checkFaviconError = (event: Event) => {
  const img = event.target as HTMLImageElement
  const url = img.dataset.bookmarkUrl
  if (!url) return
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
    // 已缓存不是空白才会到这里，如果还是空白，清空缓存并降级
    if (getCachedFavicon(url)) {
      try {
        localStorage.removeItem(FAVICON_CACHE_PREFIX + hashUrl(url))
        localStorage.removeItem(FAVICON_CACHE_PREFIX + hashUrl(url) + '_ts')
      } catch {}
    }
    checkFaviconError(event)
  } else {
    // 加载成功，缓存到 localStorage
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
  // 尺寸异常直接判定为空白
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
    // 采样四个角和中心点
    const points = [
      [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
      [Math.floor(w / 2), Math.floor(h / 2)],
    ]

    for (const [x, y] of points) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue
      const data = ctx.getImageData(x, y, 1, 1).data
      if (data[3] > 0) return false // 存在非透明像素，不是空白图
    }
    return true // 所有采样点都是透明的
  } catch {
    return false
  }
}

const getCategoryIcon = (categoryName: string) => {
  const categoryIcons: Record<string, string> = {
    '开发技术': 'png/pkq1.png',
    '效率工具': 'png/pkq2.png',
    '学习资源': 'png/pkq3.png',
    '社交网络': 'png/pkq4.png',
    '视频娱乐': 'png/pkq1.png',
    '新闻媒体': 'png/pkq2.png',
    '电商购物': 'png/pkq3.png',
    '设计创作': 'png/pkq4.png',
    '金融理财': 'png/pkq1.png'
  }
  return categoryIcons[categoryName] || 'png/pkq1.png'
}

const formatCount = (count: number): string => {
  if (count >= 100) return '99+'
  if (count === 0) return '0'
  return String(count)
}

const getBookmarkCount = (categoryId: string, tabId: string = 'all'): number => {
  return bookmarkStore.getBookmarksByCategory(categoryId, tabId).length
}

// 拖拽功能状态
const draggedBookmark = ref<Bookmark | null>(null)
const dragOverCategoryId = ref<string | null>(null)

const probeLatencyMap = ref<Map<string, number>>(new Map())
const isProbing = ref<boolean>(false)
const probeMessage = ref<string>('')
const probeFailureCount = computed(() => {
  let c = 0
  probeLatencyMap.value.forEach(v => { if (v < 0) c++ })
  return c
})

const onDragStart = (event: DragEvent, bookmark: Bookmark) => {
  draggedBookmark.value = bookmark
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', bookmark.id)
  }
  // 延迟设置拖拽样式，避免影响 drag 图像
  setTimeout(() => {
    const el = event.target as HTMLElement
    const card = el.closest('.pk-bookmark-card')
    if (card) card.classList.add('dragging')
  }, 0)
}

const onDragEnd = (event: DragEvent) => {
  draggedBookmark.value = null
  dragOverCategoryId.value = null
  const el = event.target as HTMLElement
  const card = el.closest('.pk-bookmark-card')
  if (card) card.classList.remove('dragging')
}

const onDragOverCategory = (event: DragEvent, categoryId: string) => {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  dragOverCategoryId.value = categoryId
}

const onDragLeaveCategory = (event: DragEvent, _categoryId: string) => {
  // 只在真正离开时清除，避免子元素触发
  const el = event.currentTarget as HTMLElement
  if (!el.contains(event.relatedTarget as Node)) {
    dragOverCategoryId.value = null
  }
}

const onDropOnCategory = async (event: DragEvent, categoryId: string) => {
  event.preventDefault()
  dragOverCategoryId.value = null

  if (!draggedBookmark.value) return

  const bookmark = draggedBookmark.value
  const currentCategory = bookmarkStore.categories.find((c) => c.id === activeCategoryId.value)
  const targetCategory = bookmarkStore.categories.find((c) => c.id === categoryId)

  // 不移动到相同分类
  if (currentCategory && targetCategory && currentCategory.id === targetCategory.id) {
    return
  }

  // 保存当前分类名称（stable），moveBookmark 会触发 loadBookmarks 重生成所有 category ID
  const currentCategoryName = currentCategory?.name

  try {
    await bookmarkStore.moveBookmark(bookmark.id, categoryId)
    // 重载后 category ID 已变，按名称找回当前分类，不跳转到目标分类
    const restored = bookmarkStore.categories.find((c) => c.name === currentCategoryName)
    if (restored) {
      activeCategoryId.value = restored.id
    } else if (bookmarkStore.categories.length > 0) {
      activeCategoryId.value = bookmarkStore.categories[0].id
    }
  } catch (error) {
    console.error('移动书签失败:', error)
  } finally {
    draggedBookmark.value = null
  }
}


const probeBookmarks = async () => {
  if (isProbing.value) return
  probeLatencyMap.value = new Map()
  isProbing.value = true
  probeMessage.value = '正在测速...'

  const minDuration = new Promise(r => setTimeout(r, 600))

  try {
    const urls = [...new Set(displayedBookmarks.value.map(b => b.url))]
    if (urls.length === 0) {
      probeMessage.value = '当前没有书签链接'
      return
    }

    const totalCount = displayedBookmarks.value.length
    probeMessage.value = `正在测速 ${totalCount} 个书签（去重 ${urls.length} 个链接）…`
    const latencyMap = new Map<string, number>()
    let done = 0
    let fast = 0, slow = 0, failed = 0

    await Promise.all(urls.map(url =>
      new Promise<void>(resolve => {
        const start = performance.now()
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 60000)
        fetch(url, { method: 'GET', mode: 'no-cors', signal: ctrl.signal })
          .then(() => {
            const ms = Math.round(performance.now() - start)
            latencyMap.set(url, ms)
            if (ms < 300) fast++
            else slow++
          })
          .catch(() => {
            latencyMap.set(url, -1)
            failed++
          })
          .finally(() => {
            clearTimeout(timer)
            done++
            probeMessage.value = `正在测速 ${done} / ${urls.length} 个链接…`
            resolve()
          })
      })
    ))

    probeLatencyMap.value = latencyMap

    const parts: string[] = []
    if (fast > 0) parts.push(`${fast} 个快速`)
    if (slow > 0) parts.push(`${slow} 个延迟`)
    if (failed > 0) parts.push(`${failed} 个无法访问`)
    probeMessage.value = parts.join('，') || '全部正常'
  } catch (e: any) {
    console.error('测速失败:', e)
    probeMessage.value = `⚠ 检测失败: ${e?.message || '未知错误'}`
    probeLatencyMap.value = new Map()
  } finally {
    await minDuration
    isProbing.value = false
  }
}
</script>

<template>
    <div class="pikachu-container" :class="currentTheme">
      <div class="bg-pattern"></div>
      <div class="pikachu-pattern"></div>
      
      <header class="pk-header">
        <div class="pk-header-content">
          <div class="pk-left-section">
            <div class="pk-logo">
              <img src="/favicon.ico" alt="logo" />
            </div>
            <div class="pk-title">
              <h1>十万伏特导航</h1>
              <span class="pk-version">V1.1.0</span>
            </div>
            <div class="pk-search-box">
              <div class="pk-search-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.35-4.35"></path>
                </svg>
              </div>
              <input
                ref="searchInput"
                v-model="searchStore.query"
                type="text"
                placeholder="搜索书签..."
                @input="$event => searchStore.setSearchQuery(($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>
          <div class="pk-right-section">
            <transition name="pk-fade">
              <div class="pk-quote" v-show="quoteVisible">
                <p class="pk-quote-text">{{ dailyQuote.content }}</p>
                <p class="pk-quote-source" v-if="dailyQuote.from || dailyQuote.fromWho">
                  <span v-if="dailyQuote.fromWho">{{ dailyQuote.fromWho }}</span>
                  <span v-if="dailyQuote.fromWho && dailyQuote.from"> · </span>
                  <span v-if="dailyQuote.from">《{{ dailyQuote.from }}》</span>
                </p>
              </div>
            </transition>
            <a href="https://github.com/carson1993/bookmark-vue" target="_blank" class="pk-header-github-link" title="GitHub 项目">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
              </svg>
            </a>
            <button class="pk-theme-btn" @click="toggleTheme" :title="isDarkMode ? '切换到浅色模式' : '切换到深色模式'">
              <svg v-if="!isDarkMode" class="pk-moon-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
              <svg v-else class="pk-sun-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            </button>
            <div class="pk-probe-wrap">
              <button class="pk-probe-btn" :class="{ probing: isProbing, 'has-failures': probeFailureCount > 0 }" @click="probeBookmarks" :disabled="isProbing" :title="probeMessage || '测速'">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :class="{ 'pk-spin': isProbing }">
                  <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C17.93 4.07 6.07 4.07 1 9z"></path>
                  <path d="M5 13l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.86 9.14 5 13z"></path>
                  <path d="M9 17l2 2c.55-.55 1.45-.55 2 0l2-2c-1.66-1.66-4.34-1.66-6 0z"></path>
                  <circle cx="12" cy="13" r="1"></circle>
                </svg>
                <span v-if="probeFailureCount > 0 && !isProbing" class="pk-probe-badge">{{ probeFailureCount }}</span>
              </button>
              <transition name="pk-fade">
                <span v-if="probeMessage && !isProbing" class="pk-probe-status">{{ probeMessage }}</span>
              </transition>
            </div>
          </div>
        </div>
      </header>

      <div class="pk-main-wrapper">
        <main class="pk-main-content">
          <aside class="pk-sidebar-left">
            <div class="pk-sidebar-card">
              <div class="pk-sidebar-header">
                <span class="pk-sidebar-icon">⚡</span>
                <span>分类导航</span>
              </div>
              <nav class="pk-categories">
                <div
                  v-for="category in filteredCategories"
                  :key="category.id"
                  class="pk-category-item"
                  :class="{ active: activeCategoryId === category.id, 'drag-over': dragOverCategoryId === category.id }"
                  @click="showCategoryContent(category.id)"
                  @dragover="onDragOverCategory($event, category.id)"
                  @dragleave="onDragLeaveCategory($event, category.id)"
                  @drop="onDropOnCategory($event, category.id)"
                >
                  <img :src="getCategoryIcon(category.name)" class="pk-category-icon" alt="" />
                  <span class="pk-category-name">{{ category.name }}</span>
                  <span class="pk-count-badge">{{ formatCount(getBookmarkCount(category.id)) }}</span>
                </div>
              </nav>
            </div>
          </aside>

          <section class="pk-content">
            <div class="pk-tabs">
              <div
                class="pk-tab-item"
                :class="{ active: activeTabId === 'all' }"
                @click="showTabContent(activeCategoryId, 'all')"
              >
                全部<span class="pk-tab-count">{{ formatCount(getBookmarkCount(activeCategoryId)) }}</span>
              </div>
              <div
                v-for="subcat in bookmarkStore.categories.find(c => c.id === activeCategoryId)?.subcategories || []"
                :key="subcat.id"
                class="pk-tab-item"
                :class="{ active: activeTabId === subcat.id }"
                @click="showTabContent(activeCategoryId, subcat.id)"
              >
                {{ subcat.name }}<span class="pk-tab-count">{{ formatCount(getBookmarkCount(activeCategoryId, subcat.id)) }}</span>
              </div>
            </div>

            <div class="pk-bookmarks">
              <div v-if="displayedBookmarks.length === 0" class="pk-empty">
                <div class="pk-empty-icon">⚡</div>
                <p>暂无书签</p>
              </div>
              <div v-else class="pk-bookmark-grid">
                <div
                  v-for="bookmark in displayedBookmarks"
                  :key="bookmark.id"
                  class="pk-bookmark-card"
                  :draggable="true"
                  @dragstart="onDragStart($event, bookmark)"
                  @dragend="onDragEnd($event)"
                >
                  <a :href="bookmark.url" target="_blank" class="pk-bookmark-link">
                    <div class="pk-bookmark-icon-wrapper">
                      <img
                        :src="getFaviconUrl(bookmark.url)"
                        :data-bookmark-url="bookmark.url"
                        class="pk-favicon"
                        loading="lazy"
                        @error="checkFaviconError"
                        @load="checkFaviconLoad"
                        alt=""
                      />
                    </div>
                    <span class="pk-bookmark-title">{{ bookmark.title }}</span>
                    <span
                      v-if="probeLatencyMap.has(bookmark.url)"
                      class="pk-latency-badge"
                      :class="{
                        'latency-fast': probeLatencyMap.get(bookmark.url) >= 0 && probeLatencyMap.get(bookmark.url) < 300,
                        'latency-slow': probeLatencyMap.get(bookmark.url) >= 300,
                        'latency-dead': probeLatencyMap.get(bookmark.url) < 0
                      }"
                    >{{ probeLatencyMap.get(bookmark.url) < 0 ? '--' : probeLatencyMap.get(bookmark.url) + 'ms' }}</span>
                    <div class="pk-bookmark-glow"></div>
                    <div class="pk-bookmark-sparkle"></div>
                  </a>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>

      <footer class="pk-footer">
        <div class="pk-footer-content">
          <div class="pk-footer-info">
            <h3 class="pk-footer-title">十万伏特导航</h3>
            <p class="pk-footer-copyright">© 2026 carson1993. All rights reserved.</p>
          </div>

        </div>
      </footer>
    </div>

    <div class="pk-scroll-controls">
      <button class="pk-scroll-btn" @click="scrollToTop" title="回到顶部">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="18 15 12 9 6 15"></polyline>
        </svg>
      </button>
      <button class="pk-scroll-btn" @click="scrollToBottom" title="到底部">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
    </div>
</template>

<style scoped>
/* ============================================
   十万伏特导航 — 深度视觉优化版
   设计方向：玻璃拟态 × 电光金 × 日系精緻
   ============================================ */

/* --- Container & Base --- */
.pikachu-container {
  min-height: 100vh;
  width: 100%;
  position: relative;
  overflow-x: hidden;
  overflow-y: auto;
  font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans CJK SC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  transition: background 0.6s ease;
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
}

.pikachu-container::before {
  content: '';
  position: fixed;
  inset: 0;
  background: var(--bg-primary);
  z-index: -3;
  pointer-events: none;
}

/* --- Design Tokens --- */
.pikachu-container.pikachu-light {
  --bg-primary: linear-gradient(160deg, #FFF8EC 0%, #FFF3DC 40%, #FFFBF4 100%);
  --bg-secondary: rgba(255, 255, 255, 0.88);
  --bg-card: rgba(255, 255, 255, 0.72);
  --bg-card-hover: rgba(255, 255, 255, 0.92);
  --text-primary: #1C1C1E;
  --text-secondary: #515154;
  --text-muted: #8E8E93;
  --accent-yellow: #F5C400;
  --accent-yellow-soft: #FFE088;
  --accent-yellow-neon: #FFE566;
  --accent-amber: #F0A030;
  --accent-blue: #5BA4E6;
  --shadow-xs: 0 1px 3px rgba(0,0,0,0.04);
  --shadow-sm: 0 2px 8px rgba(0,0,0,0.06);
  --shadow-md: 0 4px 16px rgba(0,0,0,0.08);
  --shadow-lg: 0 8px 32px rgba(0,0,0,0.1);
  --shadow-glow: 0 0 40px rgba(245,196,0,0.25);
  --border-soft: rgba(0,0,0,0.08);
  --border-glow: rgba(245,196,0,0.25);
  --glass-blur: 20px;
  --glass-saturate: 1.4;
  --text-on-accent: #1C1C1E;
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 20px;
  --radius-xl: 24px;
}

.pikachu-container.pikachu-dark {
  --bg-primary: linear-gradient(160deg, #0D0D0F 0%, #141418 40%, #1A1A1E 100%);
  --bg-secondary: rgba(20,20,24,0.88);
  --bg-card: rgba(28,28,34,0.72);
  --bg-card-hover: rgba(36,36,44,0.92);
  --text-primary: #F5F5F7;
  --text-secondary: #AEAEB2;
  --text-muted: #636366;
  --accent-yellow: #F5C400;
  --accent-yellow-soft: #C9A000;
  --accent-yellow-neon: #FFE566;
  --accent-amber: #D48820;
  --accent-blue: #4088CC;
  --shadow-xs: 0 1px 3px rgba(0,0,0,0.2);
  --shadow-sm: 0 2px 8px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 16px rgba(0,0,0,0.35);
  --shadow-lg: 0 8px 32px rgba(0,0,0,0.4);
  --shadow-glow: 0 0 40px rgba(245,196,0,0.18);
  --border-soft: rgba(255,255,255,0.08);
  --border-glow: rgba(245,196,0,0.2);
  --glass-blur: 20px;
  --glass-saturate: 1.2;
  --text-on-accent: #1C1C1E;
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 20px;
  --radius-xl: 24px;
}

/* --- Background Ambient Layer --- */
.bg-pattern {
  position: fixed;
  inset: 0;
  z-index: -2;
  pointer-events: none;
  opacity: 0.6;
}

.pikachu-light .bg-pattern {
  background:
    radial-gradient(ellipse 80% 60% at 20% 30%, rgba(245,196,0,0.04) 0%, transparent 60%),
    radial-gradient(ellipse 60% 80% at 80% 70%, rgba(91,164,230,0.03) 0%, transparent 60%);
}

.pikachu-dark .bg-pattern {
  background:
    radial-gradient(ellipse 80% 60% at 20% 30%, rgba(245,196,0,0.03) 0%, transparent 60%),
    radial-gradient(ellipse 60% 80% at 80% 70%, rgba(64,136,204,0.025) 0%, transparent 60%);
}

.pikachu-pattern {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  opacity: 0.4;
}

.pikachu-light .pikachu-pattern {
  background-image:
    repeating-linear-gradient(0deg, transparent, transparent 59px, rgba(245,196,0,0.025) 59px, rgba(245,196,0,0.025) 60px),
    repeating-linear-gradient(90deg, transparent, transparent 59px, rgba(245,196,0,0.025) 59px, rgba(245,196,0,0.025) 60px);
}

.pikachu-dark .pikachu-pattern {
  background-image:
    repeating-linear-gradient(0deg, transparent, transparent 79px, rgba(245,196,0,0.015) 79px, rgba(245,196,0,0.015) 80px),
    repeating-linear-gradient(90deg, transparent, transparent 79px, rgba(245,196,0,0.015) 79px, rgba(245,196,0,0.015) 80px);
}

/* --- Header --- */
.pk-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--bg-secondary);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  border-bottom: 1px solid var(--border-soft);
  box-shadow: 0 1px 0 rgba(245,196,0,0.06);
}

.pk-header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 48px;
  max-width: 1920px;
  margin: 0 auto;
  gap: 28px;
}

.pk-left-section {
  display: flex;
  align-items: center;
  gap: 24px;
  flex: 1;
}

.pk-logo {
  flex-shrink: 0;
  position: relative;
}

.pk-logo::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 18px;
  background: linear-gradient(135deg, var(--accent-yellow), var(--accent-amber));
  opacity: 0;
  transition: opacity 0.4s ease;
  z-index: -1;
}

.pk-logo:hover::after {
  opacity: 0.3;
}

.pk-logo img {
  width: 46px;
  height: 46px;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  transition: transform 0.35s cubic-bezier(0.34,1.56,0.64,1);
}

.pk-logo:hover img {
  transform: rotate(8deg) scale(1.08);
  box-shadow: var(--shadow-glow);
}

.pk-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-shrink: 0;
}

.pk-title h1 {
  font-size: 28px;
  font-weight: 700;
  margin: 0;
  letter-spacing: -0.02em;
  background: linear-gradient(135deg, var(--accent-yellow) 0%, var(--accent-amber) 50%, var(--accent-yellow) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  filter: drop-shadow(0 1px 2px rgba(245,196,0,0.15));
}

.pk-title h1::before {
  content: '⚡';
  -webkit-text-fill-color: initial;
  margin-right: 6px;
  font-size: 0.85em;
}

.pk-version {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 500;
  padding: 3px 8px;
  background: var(--bg-card);
  border-radius: 100px;
  border: 1px solid var(--border-soft);
  font-family: "SF Mono", "Fira Code", monospace;
}

/* --- Search Box --- */
.pk-search-box {
  flex: 1;
  max-width: 480px;
  min-width: 240px;
  position: relative;
  margin-left: 16px;
}

.pk-search-icon {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  color: var(--text-muted);
  pointer-events: none;
  transition: color 0.3s ease;
  z-index: 2;
}

.pk-search-box input {
  width: 100%;
  padding: 12px 20px 12px 46px;
  border: 1.5px solid var(--border-soft);
  border-radius: var(--radius-xl);
  font-size: 14px;
  outline: none;
  background: var(--bg-card);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  color: var(--text-primary);
  transition: border-color 0.3s ease, box-shadow 0.3s ease, background 0.3s ease;
  box-shadow: var(--shadow-xs);
}

.pk-search-box input::placeholder {
  color: var(--text-muted);
}

.pk-search-box input:focus {
  border-color: var(--accent-yellow);
  box-shadow: 0 0 0 4px rgba(245,196,0,0.12), var(--shadow-sm);
  background: var(--bg-card-hover);
}

.pk-search-box input:focus ~ .pk-search-icon {
  color: var(--accent-yellow);
}

/* --- Right Section --- */
.pk-right-section {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.pk-header-github-link,
.pk-theme-btn {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background: var(--bg-card);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--border-soft);
  cursor: pointer;
  transition: all 0.35s cubic-bezier(0.34,1.56,0.64,1);
  color: var(--text-secondary);
  text-decoration: none;
  box-shadow: var(--shadow-xs);
}

.pk-header-github-link svg,
.pk-theme-btn svg {
  width: 20px;
  height: 20px;
}

.pk-header-github-link:hover,
.pk-theme-btn:hover {
  transform: scale(1.08);
  background: var(--accent-yellow);
  border-color: transparent;
  color: var(--text-on-accent);
  box-shadow: var(--shadow-glow);
}

/* probe button */
.pk-probe-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
}

.pk-probe-btn {
  width: 44px;
  height: 44px;
  border: 1.5px solid rgba(245,196,0,0.25);
  border-radius: 50%;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-sm);
  transition: all 0.35s cubic-bezier(0.34,1.56,0.64,1);
  position: relative;
  flex-shrink: 0;
}

.pk-probe-btn svg {
  width: 18px;
  height: 18px;
}

.pk-probe-btn:hover:not(:disabled) {
  transform: scale(1.08);
  background: var(--accent-yellow);
  border-color: transparent;
  color: var(--text-on-accent);
  box-shadow: var(--shadow-glow);
}

.pk-probe-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.pk-probe-btn.probing {
  border-color: var(--accent-yellow);
  box-shadow: 0 0 12px rgba(245,196,0,0.3);
  background: rgba(245,196,0,0.12);
}

.pk-probe-btn.has-failures {
  border-color: rgba(255,100,80,0.5);
}

.pk-probe-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  background: #FF6450;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  line-height: 1;
  box-shadow: 0 2px 6px rgba(255,100,80,0.4);
  z-index: 2;
}

.pk-probe-status {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pk-spin {
  animation: pk-spin 1s linear infinite;
}

@keyframes pk-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.pk-quote {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  max-width: 360px;
}

.pk-quote-text {
  font-size: 13px;
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.4;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pk-quote-source {
  font-size: 11px;
  margin: 0;
  color: var(--text-muted);
  text-align: right;
}

/* --- Main Layout --- */
.pk-main-wrapper {
  flex: 1;
  max-width: 1920px;
  margin: 0 auto;
  padding: 24px 48px 16px;
  box-sizing: border-box;
  width: 100%;
}

.pk-main-content {
  display: flex;
  gap: 24px;
  align-items: stretch;
}

/* --- Sidebar --- */
.pk-sidebar-left {
  width: 270px;
  position: fixed;
  left: 48px;
  top: 88px;
  bottom: 52px;
  z-index: 90;
}

.pk-sidebar-card {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  border-radius: var(--radius-xl);
  padding: 16px;
  border: 1px solid var(--border-soft);
  box-shadow: var(--shadow-md);
}

.pk-sidebar-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-soft);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.pk-sidebar-icon {
  font-size: 16px;
  filter: drop-shadow(0 0 4px rgba(245,196,0,0.4));
}

.pk-categories {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}

.pk-category-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  height: 40px;
  flex-shrink: 0;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all 0.25s ease;
  color: var(--text-secondary);
  font-weight: 500;
  font-size: 13px;
  position: relative;
  background: transparent;
  border: 1px solid transparent;
}

.pk-category-item::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, rgba(245,196,0,0.08), rgba(240,160,48,0.04));
  opacity: 0;
  transition: opacity 0.25s ease;
}

.pk-category-item::after {
  content: '';
  position: absolute;
  left: 0;
  top: 20%;
  height: 60%;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--accent-yellow);
  transform: scaleY(0);
  transition: transform 0.25s ease;
}

.pk-category-item:hover {
  color: var(--text-primary);
  border-color: var(--border-glow);
}

.pk-category-item:hover::before {
  opacity: 1;
}

.pk-category-item:hover::after {
  transform: scaleY(1);
}

.pk-category-item.active {
  color: var(--text-primary);
  font-weight: 600;
  background: linear-gradient(135deg, rgba(245,196,0,0.12), rgba(240,160,48,0.06));
  border-color: var(--border-glow);
  box-shadow: var(--shadow-sm);
}

.pk-category-item.active::before {
  opacity: 1;
}

.pk-category-item.active::after {
  transform: scaleY(1);
}

.pk-category-item.drag-over {
  background: linear-gradient(135deg, rgba(245,196,0,0.18), rgba(240,160,48,0.1)) !important;
  border-color: var(--accent-yellow) !important;
  box-shadow: var(--shadow-glow) !important;
}

.pk-category-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pk-count-badge {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--bg-card);
  padding: 1px 7px;
  border-radius: 100px;
  border: 1px solid var(--border-soft);
  line-height: 1.5;
  flex-shrink: 0;
  transition: all 0.25s ease;
}

.pk-category-item:hover .pk-count-badge,
.pk-category-item.active .pk-count-badge {
  color: var(--text-primary);
  border-color: var(--border-glow);
  background: rgba(245,196,0,0.08);
}

.pk-category-icon {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  flex-shrink: 0;
}

/* --- Main Content --- */
.pk-content {
  flex: 1;
  min-width: 0;
  margin-left: calc(270px + 24px);
  background: var(--bg-card);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  border-radius: var(--radius-xl);
  padding: 24px;
  border: 1px solid var(--border-soft);
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
}

/* --- Tabs --- */
.pk-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-soft);
}

.pk-tab-item {
  padding: 8px 20px;
  border-radius: 100px;
  cursor: pointer;
  transition: all 0.25s ease;
  font-weight: 500;
  font-size: 13px;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border-soft);
}

.pk-tab-item:hover {
  color: var(--text-primary);
  border-color: var(--border-glow);
  background: rgba(245,196,0,0.06);
}

.pk-tab-item.active {
  background: linear-gradient(135deg, var(--accent-yellow), var(--accent-amber));
  color: var(--text-on-accent);
  font-weight: 600;
  border-color: transparent;
  box-shadow: 0 2px 12px rgba(245,196,0,0.3);
}

/* --- Bookmarks --- */
.pk-tab-count {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  margin-left: 4px;
  opacity: 0.7;
}

.pk-tab-item.active .pk-tab-count {
  color: var(--text-on-accent);
  opacity: 0.75;
}

.pk-bookmarks {
  flex: 1;
  min-height: 200px;
}

.pk-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 12px;
}

.pk-empty-icon {
  font-size: 56px;
  opacity: 0.6;
  animation: float 4s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.pk-empty p {
  margin: 0;
  font-size: 14px;
  color: var(--text-muted);
}

.pk-bookmark-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.pk-bookmark-card.dragging {
  opacity: 0.35;
  transform: scale(0.96);
}


/* latency badge on bookmark cards */
.pk-latency-badge {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 3px;
  line-height: 1.4;
  z-index: 2;
  pointer-events: none;
  white-space: nowrap;
}

.pk-latency-badge.latency-fast {
  background: rgba(52, 211, 153, 0.15);
  color: #34d399;
}

.pk-latency-badge.latency-slow {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
}

.pk-latency-badge.latency-dead {
  background: rgba(248, 113, 113, 0.15);
  color: #f87171;
}
/* --- Bookmark Card --- */
.pk-bookmark-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-radius: var(--radius-lg);
  background: var(--bg-card-hover);
  text-decoration: none;
  color: var(--text-primary);
  transition: all 0.3s cubic-bezier(0.34,1.56,0.64,1);
  border: 1px solid var(--border-soft);
  position: relative;
  overflow: hidden;
  box-shadow: var(--shadow-xs);
  min-height: 52px;
}

.pk-bookmark-link::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, rgba(245,196,0,0.06), transparent 60%);
  opacity: 0;
  transition: opacity 0.35s ease;
  z-index: 0;
}

.pk-bookmark-glow {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(ellipse at 30% 20%, rgba(245,196,0,0.12), transparent 70%);
  opacity: 0;
  transition: opacity 0.35s ease;
  pointer-events: none;
  z-index: 0;
}

.pk-bookmark-sparkle {
  position: absolute;
  top: 12px;
  right: 16px;
  width: 6px;
  height: 6px;
  background: var(--accent-yellow-neon);
  border-radius: 50%;
  opacity: 0;
  transform: scale(0);
  transition: all 0.35s cubic-bezier(0.34,1.56,0.64,1);
  box-shadow: 0 0 8px var(--accent-yellow);
  z-index: 1;
}

.pk-bookmark-link:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md), 0 0 0 1px var(--border-glow);
  border-color: var(--accent-yellow);
}

.pk-bookmark-link:hover::before {
  opacity: 1;
}

.pk-bookmark-link:hover .pk-bookmark-glow {
  opacity: 1;
}

.pk-bookmark-link:hover .pk-bookmark-sparkle {
  opacity: 0.8;
  transform: scale(1);
}

/* --- Bookmark Icon --- */
.pk-bookmark-icon-wrapper {
  width: 42px;
  height: 42px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--bg-card), var(--bg-card-hover));
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.5), var(--shadow-xs);
  transition: all 0.35s cubic-bezier(0.34,1.56,0.64,1);
  position: relative;
  z-index: 1;
  flex-shrink: 0;
}

.pk-bookmark-link:hover .pk-bookmark-icon-wrapper {
  transform: scale(1.08);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.5), 0 4px 16px rgba(245,196,0,0.2);
}

.pk-favicon {
  width: 24px;
  height: 24px;
  border-radius: 7px;
}

.pk-bookmark-title {
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  line-height: 1.3;
  flex: 1;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  position: relative;
  z-index: 1;
}

/* --- Scroll Controls --- */
.pk-scroll-controls {
  position: fixed;
  top: 50%;
  right: 24px;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 200;
  pointer-events: auto;
}

.pk-scroll-btn {
  width: 44px;
  height: 44px;
  border: 1.5px solid rgba(245,196,0,0.25);
  border-radius: 50%;
  background: var(--bg-card);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-sm);
  transition: all 0.35s cubic-bezier(0.34,1.56,0.64,1);
  position: relative;
  overflow: hidden;
}

.pk-scroll-btn::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(245,196,0,0.2), transparent);
  opacity: 0;
  transition: opacity 0.35s ease;
}

.pk-scroll-btn:hover {
  transform: scale(1.1);
  background: var(--accent-yellow);
  border-color: transparent;
  color: var(--text-on-accent);
  box-shadow: var(--shadow-glow);
}

.pk-scroll-btn:hover::after {
  opacity: 1;
}

.pk-scroll-btn:active {
  transform: scale(0.95);
}

.pk-scroll-btn svg {
  width: 18px;
  height: 18px;
  position: relative;
  z-index: 1;
}

/* --- Footer --- */
.pk-footer {
  margin-top: 16px;
  padding: 14px 0;
  border-top: 1px solid var(--border-soft);
  background: var(--bg-secondary);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  position: relative;
  z-index: 1;
  width: 100%;
  box-sizing: border-box;
}

.pk-footer-content {
  max-width: 480px;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  text-align: center;
}

.pk-footer-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pk-footer-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.pk-footer-copyright {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
}

.pk-footer-links {
  display: flex;
  gap: 10px;
}

.pk-footer-link {
  display: flex;
  align-items: center;
  gap: 5px;
  text-decoration: none;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  transition: color 0.25s ease;
  padding: 4px 10px;
  border-radius: 100px;
}

.pk-footer-link:hover {
  color: var(--accent-yellow);
}

.pk-footer-link svg {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}

.pk-footer-acknowledgement {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.pk-footer-text {
  margin: 0;
  font-size: 10px;
  color: var(--text-muted);
}

/* --- Transitions --- */
.pk-fade-enter-active,
.pk-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.pk-fade-enter-from,
.pk-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* ============================================
   Responsive Breakpoints
   ============================================ */

@media (min-width: 1440px) {
  .pk-bookmark-grid {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  }
  .pk-sidebar-left {
    width: 300px;
  }
  .pk-content {
    margin-left: calc(300px + 24px);
  }
}

@media (max-width: 992px) {
  .pk-header-content {
    padding: 10px 20px;
    flex-wrap: wrap;
  }
  .pk-main-wrapper {
    padding: 16px;
  }
  .pk-main-content {
    flex-direction: column;
  }
  .pk-sidebar-left {
    width: 100%;
    position: static;
    left: auto;
    top: auto;
    bottom: auto;
  }
  .pk-sidebar-card {
    position: static;
    height: auto;
    display: block;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
  .pk-categories {
    flex-direction: row;
    flex-wrap: wrap;
    flex: auto;
    min-height: auto;
  }
  .pk-category-item {
    flex: 1;
    min-width: calc(50% - 4px);
    height: auto;
    padding: 10px 12px;
    gap: 8px;
  }
  .pk-content {
    margin-left: 0;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
  .pk-footer-content {
    padding: 0 16px;
    flex-direction: column;
  }
}

@media (max-width: 640px) {
  .pk-title h1 {
    font-size: 22px;
  }
  .pk-left-section {
    flex-wrap: wrap;
  }
  .pk-search-box {
    order: 3;
    width: 100%;
    max-width: 100%;
    margin-left: 0;
  }
  .pk-quote {
    display: none;
  }
  .pk-bookmark-grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 12px;
  }
  .pk-bookmark-link {
    padding: 16px 14px;
    min-height: 64px;
  }
  .pk-bookmark-icon-wrapper {
    width: 48px;
    height: 48px;
  }
  .pk-favicon {
    width: 28px;
    height: 28px;
  }
  .pk-category-item {
    padding: 12px 14px;
    font-size: 12px;
  }
  .pk-footer {
    padding: 20px 0;
  }
  .pk-footer-title {
    font-size: 14px;
  }
  .pk-footer-links {
    flex-direction: column;
    align-items: center;
  }
  .pk-footer-link {
    width: 100%;
    max-width: 180px;
    justify-content: center;
  }
  .pk-scroll-controls {
    right: 12px;
  }
  .pk-scroll-btn {
    width: 40px;
    height: 40px;
  }
}
</style>
