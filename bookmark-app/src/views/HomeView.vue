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

// 缓存favicon URL，避免重复计算
const faviconCache = new Map()

const getFaviconUrl = (url: string) => {
  // 检查缓存
  if (faviconCache.has(url)) {
    return faviconCache.get(url)
  }
  
  let faviconUrl
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    faviconUrl = getRandomPng()
  } else {
    try {
      const urlObj = new URL(chrome.runtime.getURL('/_favicon/'))
      urlObj.searchParams.set('pageUrl', url)
      urlObj.searchParams.set('size', '16') // 使用更小的尺寸
      faviconUrl = urlObj.toString()
    } catch {
      faviconUrl = getRandomPng()
    }
  }
  
  // 缓存结果
  faviconCache.set(url, faviconUrl)
  return faviconUrl
}

// 缓存随机PNG，避免重复计算
const randomPngs = ['png/pkq1.png', 'png/pkq2.png', 'png/pkq3.png', 'png/pkq4.png']

const getRandomPng = () => {
  const randomIndex = Math.floor(Math.random() * randomPngs.length)
  return randomPngs[randomIndex]
}

const checkFavicon = (_event: Event) => {
  const img = _event.target as HTMLImageElement
  img.src = getRandomPng() ?? ''
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
  return categoryIcons[categoryName] || getRandomPng()
}
</script>

<template>
  <div class="pikachu-container" :class="currentTheme">
    <div class="bg-pattern"></div>
    <div class="tech-grid"></div>
    <div class="lightning-decoration"></div>
    <div class="pikachu-pattern"></div>
    <div class="pikachu-ears"></div>
    <div class="electric-particles"></div>
    
    <header class="pk-header">
      <div class="pk-header-content">
        <div class="pk-left-section">
          <div class="pk-logo">
            <img src="/favicon.ico" alt="logo" />
          </div>
          <div class="pk-title">
            <h1>十万伏特导航</h1>
            <span class="pk-version">V1.0.0</span>
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
                :class="{ active: activeCategoryId === category.id }"
                @click="showCategoryContent(category.id)"
              >
                <img :src="getCategoryIcon(category.name)" class="pk-category-icon" alt="" />
                <span>{{ category.name }}</span>
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
              全部
            </div>
            <div
              v-for="subcat in bookmarkStore.categories.find(c => c.id === activeCategoryId)?.subcategories || []"
              :key="subcat.id"
              class="pk-tab-item"
              :class="{ active: activeTabId === subcat.id }"
              @click="showTabContent(activeCategoryId, subcat.id)"
            >
              {{ subcat.name }}
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
              >
                <a :href="bookmark.url" target="_blank" class="pk-bookmark-link">
                  <div class="pk-bookmark-icon-wrapper">
                    <img
                      :src="getFaviconUrl(bookmark.url)"
                      class="pk-favicon"
                      @error="checkFavicon"
                      alt=""
                    />
                  </div>
                  <span class="pk-bookmark-title">{{ bookmark.title }}</span>
                  <div class="pk-bookmark-glow"></div>
                  <div class="pk-bookmark-sparkle"></div>
                  <div class="pk-bookmark-tech"></div>
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
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

    <footer class="pk-footer">
      <div class="pk-footer-content">
        <div class="pk-footer-info">
          <h3 class="pk-footer-title">十万伏特导航</h3>
          <p class="pk-footer-copyright">© 2026 carson1993. All rights reserved.</p>
        </div>

      </div>
    </footer>
  </div>
</template>

<style scoped>
.pikachu-container {
  min-height: 100vh;
  width: 100%;
  position: relative;
  overflow-x: hidden;
  overflow-y: auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  transition: background-color 0.5s ease;
  contain: layout style;
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
}

/* 确保背景只在内容区域显示 */
.pikachu-container::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--bg-primary);
  z-index: -3;
  pointer-events: none;
}

.pikachu-container.pikachu-light {
  --bg-primary: linear-gradient(135deg, #FFF5DB 0%, #FFF8E7 50%, #FFFBF0 100%);
  --bg-secondary: rgba(255, 255, 255, 0.95);
  --bg-card: rgba(255, 255, 255, 0.85);
  --bg-card-hover: rgba(255, 255, 255, 0.98);
  --text-primary: #1A1A1A;
  --text-secondary: #4A4A4A;
  --text-muted: #7A7A7A;
  --accent-yellow: #FFD700;
  --accent-yellow-soft: #FFE566;
  --accent-yellow-neon: #FFFF00;
  --tech-blue: #00BFFF;
  --tech-purple: #9370DB;
  --shadow-soft: 0 8px 32px rgba(0, 0, 0, 0.1);
  --shadow-medium: 0 12px 48px rgba(0, 0, 0, 0.15);
  --shadow-glow: 0 0 60px rgba(255, 215, 0, 0.45);
  --shadow-neon: 0 0 80px rgba(0, 191, 255, 0.3);
  --border-soft: rgba(0, 0, 0, 0.1);
  --border-glow: 1px solid rgba(255, 215, 0, 0.3);
  --glass-blur: 32px;
}

.pikachu-container.pikachu-dark {
  --bg-primary: linear-gradient(135deg, #0A0A0A 0%, #1A1A1A 50%, #252525 100%);
  --bg-secondary: rgba(20, 20, 20, 0.98);
  --bg-card: rgba(30, 30, 30, 0.9);
  --bg-card-hover: rgba(40, 40, 40, 0.98);
  --text-primary: #FFFFFF;
  --text-secondary: #E0E0E0;
  --text-muted: #B0B0B0;
  --accent-yellow: #FFD700;
  --accent-yellow-soft: #E6C200;
  --accent-yellow-neon: #FFFF00;
  --tech-blue: #00BFFF;
  --tech-purple: #9370DB;
  --shadow-soft: 0 8px 32px rgba(0, 0, 0, 0.5);
  --shadow-medium: 0 12px 48px rgba(0, 0, 0, 0.6);
  --shadow-glow: 0 0 60px rgba(255, 215, 0, 0.35);
  --shadow-neon: 0 0 80px rgba(0, 191, 255, 0.25);
  --border-soft: rgba(255, 255, 255, 0.12);
  --border-glow: 1px solid rgba(255, 215, 0, 0.4);
  --glass-blur: 32px;
}

.bg-pattern {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: -2;
  pointer-events: none;
}

.pikachu-light .bg-pattern::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: 
    linear-gradient(rgba(255, 215, 0, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 215, 0, 0.03) 1px, transparent 1px);
  background-size: 50px 50px;
  pointer-events: none;
  z-index: -1;
}

.pikachu-dark .bg-pattern::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: 
    linear-gradient(rgba(255, 215, 0, 0.01) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 215, 0, 0.01) 1px, transparent 1px);
  background-size: 100px 100px;
  pointer-events: none;
}

.tech-grid {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: 
    radial-gradient(circle at center, rgba(0, 191, 255, 0.05) 0%, transparent 70%);
  background-size: 100% 100%;
  z-index: -1;
  pointer-events: none;
}

.electric-particles {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: -1;
  overflow: hidden;
}

.electric-particles::before,
.electric-particles::after {
  content: '';
  position: absolute;
  width: 4px;
  height: 4px;
  background: var(--accent-yellow);
  border-radius: 50%;
  box-shadow: 0 0 10px var(--accent-yellow), 0 0 20px var(--accent-yellow);
  opacity: 0.5;
}

.electric-particles::before {
  top: 20%;
  left: 30%;
}

.electric-particles::after {
  top: 60%;
  right: 20%;
}

.lightning-decoration {
  position: fixed;
  top: -100px;
  right: -50px;
  width: 400px;
  height: 400px;
  background: linear-gradient(135deg, transparent 40%, rgba(255, 215, 0, 0.05) 50%, transparent 60%);
  transform: rotate(45deg);
  z-index: -1;
  pointer-events: none;
}

.pikachu-pattern {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 800px;
  height: 800px;
  background-image: 
    radial-gradient(circle at 20% 20%, rgba(255, 215, 0, 0.03) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(255, 215, 0, 0.03) 0%, transparent 50%);
  z-index: -1;
  pointer-events: none;
}

.pikachu-ears {
  position: fixed;
  top: -50px;
  left: 10%;
  width: 120px;
  height: 120px;
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.05) 0%, transparent 70%);
  border-radius: 50% 50% 0 0;
  transform: rotate(-30deg);
  z-index: -1;
  pointer-events: none;
}

.pikachu-ears::after {
  content: '';
  position: absolute;
  top: -30px;
  right: -80px;
  width: 100px;
  height: 100px;
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.05) 0%, transparent 70%);
  border-radius: 50% 50% 0 0;
  transform: rotate(60deg);
}



.pk-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-soft);
  box-shadow: 0 4px 32px rgba(255, 215, 0, 0.15);
  overflow: hidden;
  contain: layout style;
}

.pk-header::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 215, 0, 0.2), transparent);
  animation: headerShine 3s ease-in-out infinite;
  pointer-events: none;
}

@keyframes headerShine {
  0% { left: -100%; }
  100% { left: 100%; }
}

.pk-header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 48px;
  max-width: 1920px;
  margin: 0 auto;
  gap: 32px;
}

.pk-left-section {
  display: flex;
  align-items: center;
  gap: 32px;
  flex: 1;
  justify-content: flex-start;
}

.pk-logo {
  flex-shrink: 0;
  position: relative;
}

.pk-logo img {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  box-shadow: var(--shadow-soft);
  transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  will-change: transform;
}

.pk-logo:hover img {
  transform: rotate(10deg) scale(1.1);
  box-shadow: var(--shadow-glow);
}

.pk-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-shrink: 0;
}

.pk-title h1 {
  font-size: 32px;
  font-weight: 800;
  margin: 0;
  letter-spacing: 2px;
  background: linear-gradient(135deg, var(--accent-yellow) 0%, var(--accent-yellow-soft) 50%, var(--accent-yellow) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-shadow: 0 4px 12px rgba(255, 215, 0, 0.3);
  position: relative;
  animation: titleGlow 3s ease-in-out infinite;
}

@keyframes titleGlow {
  0%, 100% { text-shadow: 0 4px 12px rgba(255, 215, 0, 0.3); }
  50% { text-shadow: 0 6px 20px rgba(255, 215, 0, 0.5), 0 0 30px rgba(255, 215, 0, 0.2); }
}

.pk-title h1::before {
  content: '⚡';
  margin-right: 8px;
  animation: lightningFlash 2s ease-in-out infinite;
}

@keyframes lightningFlash {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.1); text-shadow: 0 0 20px var(--accent-yellow); }
}

.pk-version {
  font-size: 13px;
  color: var(--text-muted);
  font-weight: 500;
  padding: 4px 10px;
  background: var(--bg-card);
  border-radius: 20px;
  border: 1px solid var(--border-soft);
}

.pk-search-box {
  flex: 1;
  max-width: 520px;
  min-width: 280px;
  position: relative;
  margin-left: 24px;
}

.pk-search-icon {
  position: absolute;
  left: 18px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  color: var(--text-muted);
  pointer-events: none;
  transition: all 0.3s ease;
}

.pk-search-box input {
  width: 100%;
  padding: 16px 24px 16px 56px;
  border: 2px solid var(--border-soft);
  border-radius: 50px;
  font-size: 16px;
  outline: none;
  background: var(--bg-card);
  color: var(--text-primary);
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(255, 215, 0, 0.1);
  position: relative;
  z-index: 1;
}

.pk-search-box input::placeholder {
  color: var(--text-muted);
  font-style: italic;
}

.pk-search-box input:focus {
  border-color: var(--accent-yellow);
  box-shadow: 0 0 0 4px rgba(255, 215, 0, 0.2), 0 8px 32px rgba(255, 215, 0, 0.3), 0 0 60px rgba(0, 191, 255, 0.15);
  transform: scale(1.03);
  background: var(--bg-card-hover);
}

.pk-search-box input:focus + .pk-search-icon {
  color: var(--accent-yellow);
  transform: translateY(-50%) scale(1.2) rotate(10deg);
  filter: drop-shadow(0 0 10px var(--accent-yellow));
}

.pk-right-section {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
  justify-content: flex-start;
  max-width: 600px;
  margin-right: 12px;
  margin-left: -12px;
}

.pk-header-github-link {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  color: var(--text-secondary);
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  border-radius: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-soft);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.pk-header-github-link:hover {
  transform: scale(1.1) rotate(15deg);
  box-shadow: var(--shadow-soft);
  background: linear-gradient(135deg, var(--accent-yellow-soft) 0%, var(--accent-yellow) 100%);
  color: #1A1A1A;
}

.pk-header-github-link svg {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}

.pk-quote {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  max-width: 520px;
}

.pk-quote-text {
  font-size: 16px;
  margin: 0;
  color: var(--text-secondary);
  font-style: italic;
  line-height: 1.5;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pk-quote-source {
  font-size: 13px;
  margin: 0;
  color: var(--text-muted);
  text-align: right;
}

.pk-theme-btn {
  width: 48px;
  height: 48px;
  border: none;
  border-radius: 16px;
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  border: 1px solid var(--border-soft);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.pk-theme-btn:hover {
  transform: scale(1.1) rotate(15deg);
  box-shadow: var(--shadow-soft);
  background: linear-gradient(135deg, var(--accent-yellow-soft) 0%, var(--accent-yellow) 100%);
  color: #1A1A1A;
}

.pk-theme-btn svg {
  width: 22px;
  height: 22px;
}

.pk-main-wrapper {
  flex: 1;
  max-width: 1920px;
  margin: 0 auto;
  padding: 32px 48px 16px 48px;
  box-sizing: border-box;
  width: 100%;
}

.pk-main-content {
  display: flex;
  gap: 28px;
  align-items: stretch;
  flex: 1;
  min-height: 400px;
}

.pk-sidebar-left {
  width: 280px;
  flex-shrink: 0;
  position: sticky;
  top: 100px;
  contain: layout style;
}

.pk-sidebar-card {
  background: var(--bg-card);
  border-radius: 24px;
  padding: 24px;
  border: 1px solid var(--border-soft);
  box-shadow: var(--shadow-soft);
  contain: layout style;
}

.pk-sidebar-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-soft);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.pk-sidebar-icon {
  font-size: 20px;
}

.pk-categories {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pk-category-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 22px 24px;
  border-radius: 20px;
  cursor: pointer;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 16px;
  position: relative;
  overflow: hidden;
  background: var(--bg-card-hover);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
  border: 1px solid var(--border-soft);
  will-change: transform;
  contain: layout style;
}

.pk-category-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  width: 6px;
  height: 100%;
  background: linear-gradient(135deg, var(--accent-yellow) 0%, var(--accent-yellow-soft) 100%);
  border-radius: 0 6px 6px 0;
  transform: scaleY(0);
  transition: transform 0.3s ease;
  box-shadow: 0 0 12px rgba(255, 215, 0, 0.3);
}

.pk-category-item::after {
  content: '';
  position: absolute;
  top: 50%;
  right: -20px;
  width: 10px;
  height: 10px;
  background: var(--accent-yellow);
  border-radius: 50%;
  opacity: 0;
  transform: translateY(-50%) scale(0);
  transition: all 0.3s ease;
  box-shadow: 0 0 12px var(--accent-yellow);
}

.pk-category-item:hover {
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.1) 0%, var(--bg-card-hover) 100%);
  transform: translateX(8px) scale(1.02);
  color: var(--text-primary);
  box-shadow: 0 6px 20px rgba(255, 215, 0, 0.15);
  border-color: rgba(255, 215, 0, 0.3);
}

.pk-category-item:hover::before {
  transform: scaleY(1);
}

.pk-category-item:hover::after {
  opacity: 1;
  transform: translateY(-50%) scale(1);
  right: 16px;
}

.pk-category-item.active {
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.2) 0%, rgba(255, 215, 0, 0.1) 100%);
  color: var(--text-primary);
  transform: translateX(8px) scale(1.02);
  box-shadow: 0 8px 24px rgba(255, 215, 0, 0.25);
  border-color: rgba(255, 215, 0, 0.4);
}

.pk-category-item.active::before {
  transform: scaleY(1);
}

.pk-category-item.active::after {
  opacity: 1;
  transform: translateY(-50%) scale(1);
  right: 16px;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: translateY(-50%) scale(1); opacity: 1; }
  50% { transform: translateY(-50%) scale(1.2); opacity: 0.8; }
}

.pk-category-icon {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.pk-content {
  flex: 1;
  min-width: 0;
  background: var(--bg-card);
  border-radius: 24px;
  padding: 24px;
  border: 1px solid var(--border-soft);
  box-shadow: var(--shadow-soft);
  contain: layout style;
  min-height: 400px;
  display: flex;
  flex-direction: column;
}

.pk-tabs {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  flex-wrap: wrap;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-soft);
}

.pk-tab-item {
  padding: 14px 28px;
  border-radius: 20px;
  cursor: pointer;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  font-weight: 600;
  font-size: 14px;
  color: var(--text-secondary);
  position: relative;
  overflow: hidden;
  background: var(--bg-card-hover);
  border: 1px solid var(--border-soft);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  contain: layout style;
}

.pk-tab-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 215, 0, 0.2), transparent);
  transition: left 0.6s ease;
}

.pk-tab-item:hover {
  color: var(--text-primary);
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.1) 0%, var(--bg-card-hover) 100%);
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 6px 20px rgba(255, 215, 0, 0.15);
  border-color: rgba(255, 215, 0, 0.3);
}

.pk-tab-item:hover::before {
  left: 100%;
}

.pk-tab-item.active {
  background: linear-gradient(135deg, var(--accent-yellow) 0%, var(--accent-yellow-soft) 100%);
  color: #1A1A1A;
  box-shadow: 0 6px 24px rgba(255, 215, 0, 0.4);
  transform: translateY(-2px) scale(1.02);
  border-color: transparent;
}

.pk-tab-item.active::before {
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
  animation: tabShine 2s ease-in-out infinite;
}

@keyframes tabShine {
  0% { left: -100%; }
  100% { left: 100%; }
}

.pk-bookmarks {
  flex: 1;
  contain: layout style;
  min-height: 200px;
}

.pk-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  gap: 16px;
}

.pk-empty-icon {
  font-size: 64px;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-12px); }
}

.pk-empty p {
  margin: 0;
  font-size: 16px;
  color: var(--text-muted);
}

.pk-bookmark-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 24px;
  contain: layout style;
}

.pk-bookmark-card {
  /* 移除动画效果以提升性能 */
}

.pk-bookmark-link {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 22px;
  border-radius: 24px;
  background: var(--bg-card-hover);
  text-decoration: none;
  color: var(--text-primary);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  border: 1px solid var(--border-soft);
  position: relative;
  overflow: hidden;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 215, 0, 0.1);
  min-height: 67px;
  will-change: transform;
  contain: layout style;
}

.pk-bookmark-link::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 215, 0, 0.2), transparent);
  transition: left 0.6s ease;
  z-index: 0;
}

.pk-bookmark-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 100%;
  height: 100%;
  background: radial-gradient(circle, rgba(255, 215, 0, 0.45) 0%, rgba(0, 191, 255, 0.2) 70%, transparent 100%);
  transform: translate(-50%, -50%) scale(0);
  opacity: 0;
  transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  pointer-events: none;
  z-index: 0;
}

.pk-bookmark-sparkle {
  position: absolute;
  top: 24px;
  right: 24px;
  width: 10px;
  height: 10px;
  background: var(--accent-yellow-neon);
  border-radius: 50%;
  opacity: 0;
  transform: scale(0);
  transition: all 0.4s ease;
  box-shadow: 0 0 16px var(--accent-yellow-neon), 0 0 32px var(--accent-yellow);
  z-index: 1;
}

.pk-bookmark-tech {
  position: absolute;
  bottom: -20px;
  right: -20px;
  width: 60px;
  height: 60px;
  background: linear-gradient(135deg, rgba(0, 191, 255, 0.1) 0%, transparent 70%);
  border-radius: 50%;
  z-index: 0;
  transition: all 0.4s ease;
}

.pk-bookmark-link:hover {
  transform: translateY(-8px) scale(1.02);
  box-shadow: 
    0 8px 24px rgba(255, 215, 0, 0.2), 
    0 0 40px rgba(255, 215, 0, 0.1);
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.1) 0%, rgba(255, 215, 0, 0.05) 100%);
  border-color: rgba(255, 215, 0, 0.4);
}

.pk-bookmark-link:hover::before {
  left: 100%;
}

.pk-bookmark-link:hover .pk-bookmark-glow {
  transform: translate(-50%, -50%) scale(3);
  opacity: 1;
}

.pk-bookmark-link:hover .pk-bookmark-sparkle {
  opacity: 1;
  transform: scale(1);
  animation: sparkle 2s ease-in-out infinite;
}

.pk-bookmark-link:hover .pk-bookmark-tech {
  transform: scale(1.5);
  opacity: 1;
}

@keyframes sparkle {
  0%, 100% { opacity: 0; transform: scale(0); }
  50% { opacity: 1; transform: scale(1.2); box-shadow: 0 0 24px var(--accent-yellow-neon), 0 0 48px var(--accent-yellow); }
}

.pk-bookmark-icon-wrapper {
  width: 50px;
  height: 50px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--bg-card) 0%, var(--bg-card-hover) 100%);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  position: relative;
  z-index: 1;
}

.pk-bookmark-link:hover .pk-bookmark-icon-wrapper {
  transform: scale(1.1) rotate(5deg);
  box-shadow: 0 12px 32px rgba(255, 215, 0, 0.25);
}

.pk-favicon {
  width: 28px;
  height: 28px;
  border-radius: 10px;
}

.pk-bookmark-title {
  font-size: 14px;
  font-weight: 600;
  text-align: left;
  line-height: 1.4;
  flex: 1;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  position: relative;
  z-index: 1;
}

.pk-scroll-controls {
  position: fixed;
  right: 24px;
  bottom: 32px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 99;
}

.pk-scroll-btn {
  width: 52px;
  height: 52px;
  border: none;
  border-radius: 16px;
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-soft);
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  border: 1px solid var(--border-soft);
  opacity: 0.7;
}

.pk-scroll-btn:hover {
  opacity: 1;
  transform: scale(1.1);
  background: linear-gradient(135deg, var(--accent-yellow) 0%, var(--accent-yellow-soft) 100%);
  color: #1A1A1A;
  box-shadow: var(--shadow-glow);
}

.pk-scroll-btn svg {
  width: 22px;
  height: 22px;
}

.pk-footer {
  margin-top: 16px;
  padding: 16px 0;
  border-top: 1px solid var(--border-soft);
  background: var(--bg-secondary);
  contain: layout style;
  position: relative;
  z-index: 1;
  width: 100%;
  box-sizing: border-box;
}

.pk-footer-content {
  max-width: 1920px;
  margin: 0 auto;
  padding: 0 48px;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  text-align: center;
}

.pk-footer-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pk-footer-title {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  background: linear-gradient(135deg, var(--accent-yellow) 0%, var(--accent-yellow-soft) 50%, var(--accent-yellow) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-shadow: 0 4px 12px rgba(255, 215, 0, 0.3);
}

.pk-footer-copyright {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.pk-footer-links {
  display: flex;
  gap: 12px;
}

.pk-footer-link {
  display: flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  transition: all 0.3s ease;
  padding: 6px 12px;
  border-radius: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-soft);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.pk-footer-link:hover {
  transform: translateY(-2px);
  color: var(--accent-yellow);
  box-shadow: 0 6px 20px rgba(255, 215, 0, 0.15);
  border-color: rgba(255, 215, 0, 0.3);
}

.pk-footer-link svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.pk-footer-acknowledgement {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.pk-footer-text {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
}

.pk-fade-enter-active,
.pk-fade-leave-active {
  transition: opacity 0.4s ease, transform 0.4s ease;
}

.pk-fade-enter-from,
.pk-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (min-width: 1440px) {
  .pk-bookmark-grid {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 24px;
  }
  .pk-sidebar-left {
    width: 300px;
  }
}

@media (max-width: 992px) {
  .pk-header-content {
    padding: 16px 24px;
    flex-wrap: wrap;
  }
  .pk-main-wrapper {
    padding: 24px;
  }
  .pk-main-content {
    flex-direction: column;
  }
  .pk-sidebar-left {
    width: 100%;
    position: static;
  }
  .pk-categories {
    flex-direction: row;
    flex-wrap: wrap;
  }
  .pk-category-item {
    flex: 1;
    min-width: calc(50% - 6px);
  }
  .pk-footer-content {
    padding: 0 24px;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .pk-footer-acknowledgement {
    align-items: center;
  }
}

@media (max-width: 640px) {
  .pk-left-section {
    flex-wrap: wrap;
  }
  .pk-search-box {
    order: 3;
    width: 100%;
    max-width: 100%;
  }
  .pk-quote {
    display: none;
  }
  .pk-bookmark-grid {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px;
  }
  .pk-bookmark-link {
    padding: 22px 18px;
    min-height: 88px;
  }
  .pk-bookmark-icon-wrapper {
    width: 64px;
    height: 64px;
  }
  .pk-favicon {
    width: 36px;
    height: 36px;
  }
  .pk-category-item {
    padding: 18px 20px;
    font-size: 15px;
  }
  .pk-footer {
    padding: 30px 0;
  }
  .pk-footer-title {
    font-size: 20px;
  }
  .pk-footer-links {
    flex-direction: column;
    align-items: center;
  }
  .pk-footer-link {
    width: 100%;
    max-width: 200px;
    justify-content: center;
  }
}
</style>
