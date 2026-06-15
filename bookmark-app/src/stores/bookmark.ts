import { defineStore } from 'pinia'
import { pinyin } from 'pinyin-pro'

export interface Bookmark {
  id: string
  title: string
  url: string
  parentId?: string
  /** 拼音索引：包含全拼和首字母，用于搜索匹配 */
  pinyinIndex: string
}

/** 为中文文本生成拼音索引（全拼 + 首字母） */
export function buildPinyinIndex(text: string): string {
  if (!text) return ''
  try {
    const py = pinyin(text, { toneType: 'none', type: 'array' })
    const full = py.join('').toLowerCase()
    const first = py.map((s) => s[0]).join('').toLowerCase()
    return `${full} ${first}`
  } catch {
    return ''
  }
}

export interface Subcategory {
  id: string
  name: string
}

export interface Category {
  id: string
  name: string
  chromeFolderId?: string
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

      const isSystemFolder = (node: ChromeBookmarkNode): boolean => {
        if (!node.title) return false
        const t = node.title
        return (
          t === '书签栏' || t === '收藏夹栏' || t === 'Bookmarks bar' ||
          t === '其他书签' || t === 'Other Bookmarks' ||
          t === '移动书签' || t === 'Mobile Bookmarks'
        )
      }

      const collectAllBookmarks = (nodes: ChromeBookmarkNode[], parentId?: string) => {
        for (const node of nodes) {
          if (node.url) {
            const title = node.title || node.url
            this.allBookmarks.push({
              id: node.id,
              title,
              url: node.url,
              parentId,
              pinyinIndex: buildPinyinIndex(title),
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
            const title = node.title || node.url
            if (parentCategory) {
              parentCategory.bookmarks.push({
                id: node.id,
                title,
                url: node.url,
                parentId: node.parentId,
                pinyinIndex: buildPinyinIndex(title),
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
                title,
                url: node.url,
                parentId: node.parentId,
                pinyinIndex: buildPinyinIndex(title),
              })
            }
          } else if (node.children) {
            if (!isSystemFolder(node) && hasContent(node.children)) {
              const id = `category_${Date.now()}_${Math.floor(Math.random() * 1000)}`
              const category: Category = {
                id,
                name: node.title || '未命名文件夹',
                chromeFolderId: node.id,
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
            } else if (isSystemFolder(node)) {
              collectBookmarksByCategory(node.children, parentCategory, level)
            }
          }
        }
      }

      if (node.children && node.children.length > 0) {
        collectAllBookmarks(node.children)
        collectBookmarksByCategory(node.children)
      }
    },

    async moveBookmark(bookmarkId: string, targetCategoryId: string) {
      const category = this.categories.find((c) => c.id === targetCategoryId)
      if (!category) {
        throw new Error('目标分类不存在')
      }

      if (!category.chromeFolderId) {
        throw new Error('无法移动到该分类')
      }

      if (!chrome?.bookmarks?.move) {
        throw new Error('Chrome书签API不可用')
      }

      await chrome.bookmarks.move(bookmarkId, { parentId: category.chromeFolderId })

      await this.loadBookmarks()
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
