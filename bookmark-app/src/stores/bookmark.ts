import { defineStore } from 'pinia'

export interface Bookmark {
  id: string
  title: string
  url: string
  parentId?: string
}

export interface Subcategory {
  id: string
  name: string
}

export interface Category {
  id: string
  name: string
  bookmarks: Bookmark[]
  subcategories: Subcategory[]
}

export const useBookmarkStore = defineStore('bookmark', {
  state: () => ({
    allBookmarks: [] as Bookmark[],
    categories: [] as Category[],
    loading: true,
    error: null as string | null,
  }),

  actions: {
    async loadBookmarks() {
      this.loading = true
      this.error = null

      try {
        if (!window.chrome?.bookmarks?.getTree) {
          throw new Error('Chrome书签API不可用')
        }

        await new Promise<void>((resolve, reject) => {
          window.chrome!.bookmarks!.getTree((nodes) => {
            if (!nodes || !nodes[0]) {
              reject(new Error('获取书签数据失败'))
              return
            }
            this.processBookmarks(nodes[0])
            resolve()
          })
        })
      } catch (error) {
        this.error = error instanceof Error ? error.message : '未知错误'
        throw error
      } finally {
        this.loading = false
      }
    },

    processBookmarks(node: ChromeBookmarkNode) {
      this.allBookmarks = []
      this.categories = []

      const hasContent = (nodes: ChromeBookmarkNode[]): boolean => {
        if (!nodes || nodes.length === 0) return false
        for (const node of nodes) {
          if (node.url) return true
          if (node.children && hasContent(node.children)) return true
        }
        return false
      }

      const isBookmarksBar = (node: ChromeBookmarkNode): boolean => {
        if (!node.title) return false
        const title = node.title
        return (
          title === '收藏夹栏' ||
          title === 'Bookmarks bar' ||
          title === '书签栏'
        )
      }

      const collectAllBookmarks = (nodes: ChromeBookmarkNode[], parentId?: string) => {
        for (const node of nodes) {
          if (node.url) {
            this.allBookmarks.push({
              id: node.id,
              title: node.title || node.url,
              url: node.url,
              parentId,
            })
          } else if (node.children) {
            collectAllBookmarks(node.children, node.id)
          }
        }
      }

      const collectBookmarksByCategory = (
        nodes: ChromeBookmarkNode[],
        parentCategory: Category | null = null,
        level: number = 0,
      ) => {
        for (const node of nodes) {
          if (node.url) {
            if (parentCategory) {
              parentCategory.bookmarks.push({
                id: node.id,
                title: node.title || node.url,
                url: node.url,
                parentId: node.parentId,
              })
            } else {
              let defaultCategory = this.categories.find((c) => c.id === 'default')
              if (!defaultCategory) {
                defaultCategory = {
                  id: 'default',
                  name: '书签',
                  bookmarks: [],
                  subcategories: [],
                }
                this.categories.push(defaultCategory)
              }
              defaultCategory.bookmarks.push({
                id: node.id,
                title: node.title || node.url,
                url: node.url,
                parentId: node.parentId,
              })
            }
          } else if (node.children) {
            if (!isBookmarksBar(node) && hasContent(node.children)) {
              const id = `category_${Date.now()}_${Math.floor(Math.random() * 1000)}`
              const category: Category = {
                id,
                name: node.title || '未命名文件夹',
                bookmarks: [],
                subcategories: [],
              }

              if (level === 0) {
                this.categories.push(category)
              } else if (parentCategory) {
                parentCategory.subcategories.push({
                  id,
                  name: category.name,
                })
                this.categories.push(category)
              }

              collectBookmarksByCategory(node.children, category, level + 1)
            } else if (isBookmarksBar(node)) {
              collectBookmarksByCategory(node.children, parentCategory, level)
            }
          }
        }
      }

      if (node.children && node.children.length > 0) {
        collectAllBookmarks(node.children)
        collectBookmarksByCategory(node.children)
        const validCategories = []
        for (const category of this.categories) {
          const hasBookmarks = category.bookmarks.length > 0
          let hasSubcategories = false
          for (const subcat of category.subcategories) {
            const subcatData = this.categories.find((c) => c.id === subcat.id)
            if (subcatData && (subcatData.bookmarks.length > 0 || subcatData.subcategories.length > 0)) {
              hasSubcategories = true
              break
            }
          }
          if (hasBookmarks || hasSubcategories) {
            validCategories.push(category)
          }
        }
        this.categories = validCategories
      }
    },

    getBookmarksByCategory(categoryId: string, tabId: string = 'all'): Bookmark[] {
      const category = this.categories.find((c) => c.id === categoryId)
      if (!category) return []

      if (tabId === 'all') {
        const bookmarks = [...category.bookmarks]
        for (const subcat of category.subcategories) {
          const subcatData = this.categories.find((c) => c.id === subcat.id)
          if (subcatData) {
            bookmarks.push(...subcatData.bookmarks)
          }
        }
        return bookmarks
      } else {
        const subcatData = this.categories.find((c) => c.id === tabId)
        return subcatData ? subcatData.bookmarks : []
      }
    },
  },
})
