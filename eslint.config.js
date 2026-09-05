export default [
  {
    ignores: [
      "**/node_modules/**",
      "dist/**",
      "models/**",
      "assets/**",
      "project/**",
      ".agents/**",
      "popup/popup.css",
      "lib/ort/**"
    ]
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        chrome: "readonly",
        window: "readonly",
        document: "readonly",
        console: "readonly",
        Blob: "readonly",
        URL: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        fetch: "readonly",
        Response: "readonly",
        Headers: "readonly",
        FileReader: "readonly",
        Image: "readonly",
        ImageData: "readonly",
        OffscreenCanvas: "readonly",
        createImageBitmap: "readonly",
        navigator: "readonly",
        performance: "readonly",
        crypto: "readonly",
        btoa: "readonly",
        atob: "readonly",
        alert: "readonly",
        confirm: "readonly",
        prompt: "readonly",
        importScripts: "readonly",
        CustomEvent: "readonly",
        Event: "readonly",
        Node: "readonly",
        process: "readonly"
      }
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "warn"
    }
  }
];
