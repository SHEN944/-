# 🚀 部署「旅途手账」到线上分享

本项目是纯前端（HTML + CSS + JS），无需后端和构建工具，部署非常简单。

---

## 方案一：GitHub Pages（最推荐）

既然代码已在 GitHub，只需 3 步：

1. 打开仓库 `https://github.com/SHEN944/-`
2. 进入 **Settings → Pages**
3. **Branch** 选择 `main`，点击 **Save**
4. 等待 1-2 分钟，访问：**`https://shen944.github.io/-/`**

每次 push 代码，网站自动更新。

---

## 方案二：Vercel / Netlify（拖拽即上线）

### Vercel
1. 访问 [vercel.com](https://vercel.com) 用 GitHub 登录
2. 点击 **New Project → Import** 选择你的 GitHub 仓库
3. 框架选 **Other**，其他默认即可
4. 点击 **Deploy**，几秒钟获得 `xxx.vercel.app` 公网链接

### Netlify
1. 访问 [netlify.com](https://netlify.com) 用 GitHub 登录
2. 点击 **Add new site → Import an existing project**
3. 选择 GitHub 仓库，Build command 留空
4. 点击 **Deploy site**，获得 `xxx.netlify.app` 链接

---

## 方案三：本地直接运行（无需部署）

1. 从 GitHub 仓库点击 **Code → Download ZIP** 下载代码
2. 解压到本地
3. **双击 `index.html`** 即可用浏览器打开使用

---

## 项目结构

```
/workspace
├── index.html    # 页面结构
├── styles.css    # 样式
└── app.js        # 核心逻辑
```
