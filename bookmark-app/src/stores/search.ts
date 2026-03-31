import { defineStore } from 'pinia'
import { useBookmarkStore } from './bookmark'

export interface SearchBookmark {
  id: string
  title: string
  url: string
}

export const useSearchStore = defineStore('search', {
  state: () => ({
    query: '',
    filteredBookmarks: [] as SearchBookmark[],
    searchTimeout: null as NodeJS.Timeout | null,
  }),

  actions: {
    setSearchQuery(query: string) {
      this.query = query
      if (query.trim() === '') {
        this.filteredBookmarks = []
        return
      }

      // 清除之前的定时器
      if (this.searchTimeout) {
        clearTimeout(this.searchTimeout)
      }

      // 设置新的定时器，延迟300ms执行搜索，避免频繁过滤
      this.searchTimeout = setTimeout(() => {
        const bookmarkStore = useBookmarkStore()
        const allBookmarks = bookmarkStore.allBookmarks
        const lowerQuery = query.toLowerCase()

        const filtered = []
        for (const bookmark of allBookmarks) {
          if (bookmark.title.toLowerCase().includes(lowerQuery) ||
              bookmark.url.toLowerCase().includes(lowerQuery)) {
            filtered.push(bookmark)
          }
        }

        this.filteredBookmarks = filtered
      }, 300)
    },

    clearSearch() {
      if (this.searchTimeout) {
        clearTimeout(this.searchTimeout)
      }
      this.query = ''
      this.filteredBookmarks = []
    },
  },
})
