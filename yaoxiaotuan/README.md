# 药小团

慢病用药小管家移动端网页应用，面向「问诊－购药－用药－续方」的连续服务场景。

## 本地运行

```bash
npm install
npm run dev
```

本地预览地址：

```text
http://localhost:5173/yaoxiaotuan/
```

## 构建

```bash
npm run build
```

构建产物输出到 `dist/`。`vite.config.ts` 已配置：

```ts
base: "/yaoxiaotuan/"
```

适配部署地址：

```text
https://idhuohua.github.io/yaoxiaotuan/
```

## AI 配置

进入「我的」页填写：

- API Key
- Base URL / 网关地址
- 模型名

密钥不会写入代码。默认仅保存在当前页面状态；打开「记住配置」后才会保存到当前浏览器的 `localStorage`。
