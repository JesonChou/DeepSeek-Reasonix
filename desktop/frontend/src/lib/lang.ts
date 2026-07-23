// Pure language resolution — no highlight.js dependency. Non-lazy consumers (e.g.
// ToolCard) guess a language from a path without pulling the highlighter into the
// main bundle; highlight.js stays behind the lazy editor seam. highlight.ts
// imports ALIASES from here and adds the hljs-backed validation.

export const ALIASES: Record<string, string> = {
  // JavaScript ecosystem
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  coffee: "coffeescript",
  // Shell
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  // Python
  py: "python",
  // Rust
  rs: "rust",
  // YAML
  yml: "yaml",
  // XML / markup dialects — no native hljs lexer for XAML, so map to XML
  html: "xml",
  xaml: "xml",
  // Markdown
  md: "markdown",
  // C family
  cs: "csharp",
  "c#": "csharp",
  cxx: "cpp",
  cc: "cpp",
  h: "c",
  hpp: "cpp",
  // Ruby
  rb: "ruby",
  // Kotlin
  kt: "kotlin",
  kts: "kotlin",
  // PowerShell
  ps1: "powershell",
  psd1: "powershell",
  psm1: "powershell",
  // Config / data
  toml: "ini",
  // Docker / build
  dockerfile: "dockerfile",
  makefile: "makefile",
  // Objective-C
  objc: "objectivec",
  // F#
  "f#": "fsharp",
  // Perl
  pm: "perl",
  // Haskell
  lhs: "haskell",
  // Erlang
  hrl: "erlang",
  // Clojure
  cljc: "clojure",
  cljs: "clojure",
  // Julia
  jl: "julia",
  // R
  r: "r",
  // LaTeX
  tex: "latex",
  ltx: "latex",
  // SCSS
  scss: "scss",
  // Less
  less: "less",
  // Vim
  vim: "vim",
  // Nginx
  nginx: "nginx",
  // Apache
  apache: "apache",
  // Protobuf
  proto: "protobuf",
  // GraphQL
  graphql: "graphql",
  gql: "graphql",
  // CMake
  cmake: "cmake",
  // Gradle
  gradle: "gradle",
  // Properties
  properties: "properties",
  // Groovy
  groovy: "groovy",
  gvy: "groovy",
  // Lua
  lua: "lua",
  // Dart
  dart: "dart",
  // MATLAB
  matlab: "matlab",
};

const EXT: Record<string, string> = {
  // JavaScript
  go: "go",
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  coffee: "coffeescript",
  // Data
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  xaml: "xml",
  html: "xml",
  // Shell
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  // Python
  py: "python",
  // Rust
  rs: "rust",
  // CSS
  css: "css",
  scss: "scss",
  less: "less",
  // Markdown
  md: "markdown",
  // C family
  cs: "csharp",
  c: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  h: "c",
  hpp: "cpp",
  // Java / JVM
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  scala: "scala",
  groovy: "groovy",
  gvy: "groovy",
  gradle: "gradle",
  // .NET
  fs: "fsharp",
  fsx: "fsharp",
  vb: "vbnet",
  // Database
  sql: "sql",
  // Scripting
  rb: "ruby",
  php: "php",
  lua: "lua",
  dart: "dart",
  perl: "perl",
  pl: "perl",
  pm: "perl",
  r: "r",
  // Apple
  swift: "swift",
  m: "objectivec",
  mm: "objectivec",
  // Functional
  haskell: "haskell",
  hs: "haskell",
  lhs: "haskell",
  elixir: "elixir",
  ex: "elixir",
  exs: "elixir",
  clojure: "clojure",
  clj: "clojure",
  cljs: "clojure",
  cljc: "clojure",
  erlang: "erlang",
  erl: "erlang",
  hrl: "erlang",
  fsharp: "fsharp",
  // Scientific
  julia: "julia",
  jl: "julia",
  matlab: "matlab",
  // Shell / config
  ps1: "powershell",
  psd1: "powershell",
  psm1: "powershell",
  dockerfile: "dockerfile",
  nginx: "nginx",
  properties: "properties",
  protobuf: "protobuf",
  proto: "protobuf",
  graphql: "graphql",
  gql: "graphql",
  toml: "ini",
  makefile: "makefile",
  cmake: "cmake",
  // Document
  latex: "latex",
  tex: "latex",
  ltx: "latex",
  // Editor
  vim: "vim",
};

// extToLang infers a language name from a file path's extension (for tool diffs).
export function extToLang(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return "";
  return EXT[path.slice(dot + 1).toLowerCase()] ?? "";
}
