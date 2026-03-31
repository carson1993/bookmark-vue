// 后台服务 worker
console.log('Bookmark Navigator background service worker started')

// 检查是否已存在打开的新标签页
const checkExistingNewTab = (callback: (tab: chrome.tabs.Tab | null) => void) => {
  if (chrome?.tabs?.query) {
    chrome.tabs.query({ url: 'chrome://newtab' }, (tabs) => {
      if (tabs && tabs.length > 0) {
        // 找到已存在的新标签页
        callback(tabs[0])
      } else {
        callback(null)
      }
    })
  } else {
    callback(null)
  }
}

// 监听插件图标点击事件
if (chrome?.action?.onClicked) {
  chrome.action.onClicked.addListener((tab: chrome.tabs.Tab) => {
    checkExistingNewTab((existingTab) => {
      if (existingTab && chrome?.tabs?.update) {
        // 切换到已存在的新标签页
        chrome.tabs.update(existingTab.id, { active: true })
      } else if (chrome?.tabs?.create) {
        // 创建新的标签页
        chrome.tabs.create({ url: 'chrome://newtab' })
      }
    })
  })
}

// 监听新标签页创建事件，确保只打开一个实例
if (chrome?.tabs?.onCreated) {
  chrome.tabs.onCreated.addListener((newTab) => {
    if (newTab.url === 'chrome://newtab') {
      // 检查是否有其他打开的新标签页
      if (chrome?.tabs?.query) {
        chrome.tabs.query({ url: 'chrome://newtab' }, (tabs) => {
          if (tabs && tabs.length > 1) {
            // 关闭多余的新标签页，只保留第一个
            const tabsToClose = tabs.slice(1)
            tabsToClose.forEach((tab) => {
              if (tab.id && chrome?.tabs?.remove) {
                chrome.tabs.remove(tab.id)
              }
            })
          }
        })
      }
    }
  })
}
