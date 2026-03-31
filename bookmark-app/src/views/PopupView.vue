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

const getRandomPng = () => {
  const randomIndex = Math.floor(Math.random() * 4) + 1
  return `png/pkq${randomIndex}.png`
}

const checkFavicon = (event: Event) => {
  const img = event.target as HTMLImageElement
  if (!img.src.includes('png/pkq')) {
    img.src = getRandomPng()
  }
}

const getFaviconUrl = (url: string) => {
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    return getRandomPng()
  }
  return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`
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
          class="favicon"
          @error="checkFavicon"
          alt=""
        />
        <a :href="bookmark.url" target="_blank" class="link-text">{{ bookmark.title }}</a>
      </div>
      <div v-for="subcat in category.subcategories" :key="subcat.id" class="subcategory">
        <div class="category-title">{{ subcat.name }}</div>
        <div v-for="bookmark in bookmarkStore.getBookmarksByCategory(category.id, subcat.id)" :key="bookmark.id" class="link-item">
          <img
            :src="getFaviconUrl(bookmark.url)"
            class="favicon"
            @error="checkFavicon"
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
