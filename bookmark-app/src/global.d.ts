// 为 Chrome API 添加类型声明
export {}

declare global {
  interface ChromeBookmarkNode {
    id: string
    parentId?: string
    title: string
    url?: string
    children?: ChromeBookmarkNode[]
  }
  
  interface Window {
    chrome?: {
      runtime: {
        getURL: (path: string) => string
      }
      bookmarks: {
        getTree: (callback: (nodes: ChromeBookmarkNode[]) => void) => void
      }
      action: {
        onClicked: {
          addListener: (callback: (tab: chrome.tabs.Tab) => void) => void
        }
      }
    }
  }
}
