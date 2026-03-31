# 十万伏特导航

动漫风格的书签导航浏览器扩展插件（Chrome / Edge）

## 📝 版权声明

**作者**: carson1993  
**GitHub**: [https://github.com/carson1993/bookmark-vue](https://github.com/carson1993/bookmark-vue)  
**License**: MIT  
**版权年份**: 2026

本项目采用 MIT 许可证。使用本项目即表示您同意遵守许可证中的所有条款。

### 第三方组件

本项目使用以下第三方库，均采用 MIT 许可证：

- Vue 3
- Pinia
- Vue Router
- Vite

### 代码质量工具

本项目使用以下代码质量工具：

- Oxlint - 极速 Rust linter
- ESLint - 代码检查
- Prettier - 代码格式化
- Vitest - 单元测试框架

### 致谢

本项目使用 TRAE 工具进行开发，特别鸣谢 TRAE 提供的优秀开发环境和工具。

- TRAE: [https://github.com/trae-ai/trae](https://github.com/trae-ai/trae)

## 🛠️ 推荐的 IDE 设置

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (并禁用 Vetur)。

## 🌐 推荐的浏览器设置

- 基于 Chromium 的浏览器 (Chrome, Edge, Brave 等):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [在 Chrome DevTools 中启用自定义对象格式化器](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [在 Firefox DevTools 中启用自定义对象格式化器](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## 📄 TypeScript 对 `.vue` 文件的类型支持

TypeScript 默认无法处理 `.vue` 文件的类型信息，因此我们使用 `vue-tsc` 替代 `tsc` 进行类型检查。在编辑器中，我们需要 [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) 来使 TypeScript 语言服务识别 `.vue` 类型。

## ⚙️ 自定义配置

参见 [Vite 配置参考](https://vite.dev/config/)。

## 📦 项目安装

```sh
npm install
```

### 🚀 开发模式运行

```sh
npm run dev
```

### 🏗️ 生产环境编译

```sh
npm run build
```

### 🧪 使用 [Vitest](https://vitest.dev/) 运行单元测试

```sh
npm run test:unit
```

### 🐛 使用 [ESLint](https://eslint.org/) 进行代码检查

```sh
npm run lint
```

### 📝 代码格式化

```sh
npx prettier --write "src/**/*.{vue,ts,tsx}"
```

### 🔍 类型检查

```sh
npm run type-check
```
