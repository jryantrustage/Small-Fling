#!/usr/bin/env node
/**
 * Persistent & One-Shot TypeScript & AST Compiler Validator Worker (ts_analyzer_worker.mjs)
 *
 * Reads a JSON payload from stdin (persistent JSON-RPC or one-shot EOF JSON) or a temp file:
 *   {
 *     files: {
 *       [path: string]: { content: string, start_md_line: number, frame_ids: string[] }
 *     },
 *     tsconfig: object
 *   }
 * (Also supports `files` as an array of VFS file entries for backward compatibility.)
 *
 * Uses `typescript` (`ts.createCompilerHost` backed by an in-memory `Map` / `memfs`) to run:
 *   - Lexical & syntactic AST validation (`program.getSyntacticDiagnostics()`)
 *   - Semantic & import resolution validation (`program.getSemanticDiagnostics()`)
 *
 * Returns structured JSON diagnostics with:
 *   `{ file, line, column, code, category, message, global_md_line, snippet }`
 */

import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Resolve TypeScript from web/node_modules/typescript or shared_node_modules
let ts = null;
let tsLibDir = "";
const tsCandidatePaths = [
  path.resolve(__dirname, "../../web/node_modules/typescript"),
  path.resolve(__dirname, "../storage/shared_node_modules/typescript"),
  "typescript",
];

for (const cand of tsCandidatePaths) {
  try {
    ts = require(cand);
    if (ts && ts.createSourceFile) {
      try {
        tsLibDir = path.dirname(require.resolve(cand));
      } catch {
        tsLibDir = "";
      }
      break;
    }
  } catch {
    // try next candidate
  }
}

if (!ts) {
  process.stderr.write("[ts_analyzer_worker] ERROR: Could not resolve 'typescript' module.\n");
  process.exit(1);
}

const sharedNodeModulesDirs = [
  path.resolve(__dirname, "../storage/shared_node_modules"),
  path.resolve(__dirname, "../../web/node_modules"),
].filter((d) => {
  try {
    return fs.existsSync(d);
  } catch {
    return false;
  }
});

// Optional memfs integration + in-memory Map VFS volume
let memfsModule = null;
for (const cand of [
  path.resolve(__dirname, "../../web/node_modules/memfs"),
  path.resolve(__dirname, "../storage/shared_node_modules/memfs"),
  "memfs",
]) {
  try {
    memfsModule = require(cand);
    if (memfsModule) break;
  } catch {
    // fallback to built-in Map volume
  }
}

class MemoryVfsVolume {
  constructor() {
    this.files = new Map();
    this.directories = new Set(["/"]);
    this._memfsVol = null;
  }

  normalize(filePath) {
    let p = String(filePath || "").replace(/\\/g, "/").trim();
    if (!p.startsWith("/")) p = "/" + p;
    p = path.posix.normalize(p);
    if (!p.startsWith("/")) p = "/" + p;
    return p;
  }

  _registerDirs(normPath) {
    let dir = path.posix.dirname(normPath);
    while (dir && dir !== "." && !this.directories.has(dir)) {
      this.directories.add(dir);
      const parent = path.posix.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  fromJSON(jsonMap) {
    this.files.clear();
    this.directories = new Set(["/"]);
    if (memfsModule && memfsModule.Volume) {
      try {
        this._memfsVol = memfsModule.Volume.fromJSON(jsonMap, "/");
      } catch {
        this._memfsVol = null;
      }
    }
    for (const [k, v] of Object.entries(jsonMap || {})) {
      const norm = this.normalize(k);
      this.files.set(norm, String(v ?? ""));
      this._registerDirs(norm);
    }
  }

  writeFileSync(filePath, content) {
    const norm = this.normalize(filePath);
    this.files.set(norm, String(content ?? ""));
    this._registerDirs(norm);
    if (this._memfsVol) {
      try {
        const dir = path.posix.dirname(norm);
        this._memfsVol.mkdirSync(dir, { recursive: true });
        this._memfsVol.writeFileSync(norm, String(content ?? ""));
      } catch {
        // ignore
      }
    }
  }

  existsSync(filePath) {
    return this.files.has(this.normalize(filePath));
  }

  directoryExists(dirPath) {
    return this.directories.has(this.normalize(dirPath));
  }

  readFileSync(filePath) {
    return this.files.get(this.normalize(filePath));
  }
}

function getScriptKindForExt(ext) {
  const cleanExt = String(ext || "").toLowerCase();
  if (cleanExt === ".tsx") return ts.ScriptKind.TSX;
  if (cleanExt === ".ts") return ts.ScriptKind.TS;
  if (cleanExt === ".jsx") return ts.ScriptKind.JSX;
  if (cleanExt === ".js" || cleanExt === ".mjs" || cleanExt === ".cjs") return ts.ScriptKind.JS;
  if (cleanExt === ".json") return ts.ScriptKind.JSON;
  return ts.ScriptKind.TS;
}

function getLineSnippet(content, lineOneBased) {
  const lines = String(content ?? "").split(/\r?\n/);
  const idx = Math.max(0, Math.min(lines.length - 1, (lineOneBased || 1) - 1));
  return lines[idx] !== undefined ? lines[idx] : "";
}

function formatDiagnosticEntry({
  file,
  rawPath,
  normRel,
  line,
  column,
  code,
  category,
  message,
  startMdLine,
  frameIds,
  content,
  sourceType,
}) {
  const safeLine = Math.max(1, Number(line || 1));
  const safeCol = Math.max(1, Number(column || 1));
  const startMd = Number(startMdLine || 0);
  const globalMdLine = startMd > 0 ? startMd + safeLine : safeLine;
  const snippet = getLineSnippet(content, safeLine);
  const fids = Array.isArray(frameIds) ? frameIds : [];

  return {
    file: file || normRel || rawPath,
    line: safeLine,
    column: safeCol,
    code: String(code),
    category: String(category || "error"),
    message: String(message || ""),
    global_md_line: globalMdLine,
    snippet,
    // Additional fields for DAG Node 11 & Monaco source-map compatibility
    file_path: rawPath || normRel || file,
    normalized_path: normRel || file,
    file_line: safeLine,
    file_col: safeCol,
    frame_ids: fids,
    frame_id: fids.length > 0 ? fids[0] : "",
    diagnostic_type: sourceType || "syntactic",
  };
}

/**
 * Validates CSS syntax for balanced curly braces, unclosed block comments, and unclosed quotes.
 */
function validateCssContent(meta) {
  const diagnostics = [];
  const lines = String(meta.content ?? "").split(/\r?\n/);
  let braceDepth = 0;
  let lastOpenBraceLine = 1;
  let lastOpenBraceCol = 1;
  let inComment = false;
  let commentStartLine = 1;
  let commentStartCol = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      const next = j + 1 < line.length ? line[j + 1] : "";

      if (inComment) {
        if (ch === "*" && next === "/") {
          inComment = false;
          j++;
        }
        continue;
      }

      if (!inSingleQuote && !inDoubleQuote && ch === "/" && next === "*") {
        inComment = true;
        commentStartLine = lineNum;
        commentStartCol = j + 1;
        j++;
        continue;
      }

      if (!inSingleQuote && !inDoubleQuote && ch === "/" && next === "/") {
        break;
      }

      if (ch === "'" && !inDoubleQuote && (j === 0 || line[j - 1] !== "\\")) {
        inSingleQuote = !inSingleQuote;
        continue;
      }
      if (ch === '"' && !inSingleQuote && (j === 0 || line[j - 1] !== "\\")) {
        inDoubleQuote = !inDoubleQuote;
        continue;
      }

      if (!inSingleQuote && !inDoubleQuote) {
        if (ch === "{") {
          if (braceDepth === 0) {
            lastOpenBraceLine = lineNum;
            lastOpenBraceCol = j + 1;
          }
          braceDepth++;
        } else if (ch === "}") {
          braceDepth--;
          if (braceDepth < 0) {
            diagnostics.push(
              formatDiagnosticEntry({
                file: meta.normRel,
                rawPath: meta.rawPath,
                normRel: meta.normRel,
                line: lineNum,
                column: j + 1,
                code: "CSS1001",
                category: "error",
                message: "Unexpected closing '}' in CSS stylesheet.",
                startMdLine: meta.start_md_line,
                frameIds: meta.frame_ids,
                content: meta.content,
                sourceType: "syntactic",
              })
            );
            braceDepth = 0;
          }
        }
      }
    }

    if (inSingleQuote || inDoubleQuote) {
      diagnostics.push(
        formatDiagnosticEntry({
          file: meta.normRel,
          rawPath: meta.rawPath,
          normRel: meta.normRel,
          line: lineNum,
          column: 1,
          code: "CSS1002",
          category: "error",
          message: "Unclosed string literal on CSS line.",
          startMdLine: meta.start_md_line,
          frameIds: meta.frame_ids,
          content: meta.content,
          sourceType: "syntactic",
        })
      );
    }
  }

  if (inComment) {
    diagnostics.push(
      formatDiagnosticEntry({
        file: meta.normRel,
        rawPath: meta.rawPath,
        normRel: meta.normRel,
        line: commentStartLine,
        column: commentStartCol,
        code: "CSS1003",
        category: "error",
        message: "Unclosed CSS block comment '/*'.",
        startMdLine: meta.start_md_line,
        frameIds: meta.frame_ids,
        content: meta.content,
        sourceType: "syntactic",
      })
    );
  }

  if (braceDepth > 0) {
    diagnostics.push(
      formatDiagnosticEntry({
        file: meta.normRel,
        rawPath: meta.rawPath,
        normRel: meta.normRel,
        line: lastOpenBraceLine,
        column: lastOpenBraceCol,
        code: "CSS1004",
        category: "error",
        message: `Unclosed CSS rule block '{' (${braceDepth} missing '}').`,
        startMdLine: meta.start_md_line,
        frameIds: meta.frame_ids,
        content: meta.content,
        sourceType: "syntactic",
      })
    );
  }

  return diagnostics;
}

/**
 * Validates JSON syntax using TypeScript's parseJsonText for accurate line/column positions.
 */
function validateJsonContent(meta) {
  const diagnostics = [];
  const sf = ts.parseJsonText(meta.normRel || meta.rawPath, String(meta.content ?? ""));
  const parseDiags = sf.parseDiagnostics || [];
  for (const d of parseDiags) {
    const pos = typeof d.start === "number" ? d.start : 0;
    const lc = sf.getLineAndCharacterOfPosition(pos);
    const msg = ts.flattenDiagnosticMessageText(d.messageText, "\n");
    diagnostics.push(
      formatDiagnosticEntry({
        file: meta.normRel,
        rawPath: meta.rawPath,
        normRel: meta.normRel,
        line: lc.line + 1,
        column: lc.character + 1,
        code: `TS${d.code}`,
        category: "error",
        message: msg,
        startMdLine: meta.start_md_line,
        frameIds: meta.frame_ids,
        content: meta.content,
        sourceType: "syntactic",
      })
    );
  }
  return diagnostics;
}

/**
 * Normalizes `payload.files` whether passed as:
 *   1. Object map: `{ [path: string]: { content: string, start_md_line: number, frame_ids: string[] } }`
 *   2. Array of VFS file entries: `Array<{ path, normalized_path, ext, content, start_md_line, source_frame_ids }>`
 */
function normalizeFilesInput(rawFiles) {
  const normalizedList = [];
  if (!rawFiles) return normalizedList;

  if (Array.isArray(rawFiles)) {
    for (const f of rawFiles) {
      if (!f || typeof f !== "object") continue;
      const rawPath = f.path || f.normalized_path || f.file || "unnamed.ts";
      const normRel = String(f.normalized_path || rawPath)
        .replace(/\\/g, "/")
        .replace(/^\/+/, "");
      const ext = (f.ext || path.posix.extname(normRel) || "").toLowerCase();
      const frameIds = Array.isArray(f.frame_ids)
        ? f.frame_ids
        : Array.isArray(f.source_frame_ids)
        ? f.source_frame_ids
        : [];
      normalizedList.push({
        rawPath,
        normRel,
        ext: ext.startsWith(".") || !ext ? ext : "." + ext,
        content: String(f.content ?? ""),
        start_md_line: Number(f.start_md_line || 0),
        end_md_line: Number(f.end_md_line || 0),
        frame_ids: frameIds.map(String),
      });
    }
  } else if (typeof rawFiles === "object") {
    for (const [fileKey, fileVal] of Object.entries(rawFiles)) {
      const isObj = fileVal && typeof fileVal === "object";
      const content = isObj ? String(fileVal.content ?? "") : String(fileVal ?? "");
      const normRel = String((isObj && fileVal.normalized_path) || fileKey)
        .replace(/\\/g, "/")
        .replace(/^\/+/, "");
      const ext = ((isObj && fileVal.ext) || path.posix.extname(normRel) || "").toLowerCase();
      const frameIds =
        isObj && Array.isArray(fileVal.frame_ids)
          ? fileVal.frame_ids
          : isObj && Array.isArray(fileVal.source_frame_ids)
          ? fileVal.source_frame_ids
          : [];
      normalizedList.push({
        rawPath: fileKey,
        normRel,
        ext: ext.startsWith(".") || !ext ? ext : "." + ext,
        content,
        start_md_line: isObj ? Number(fileVal.start_md_line || 0) : 0,
        end_md_line: isObj ? Number(fileVal.end_md_line || 0) : 0,
        frame_ids: frameIds.map(String),
      });
    }
  }

  return normalizedList;
}

const AMBIENT_GLOBAL_DECLS = `
declare module "*.css" { const content: { [className: string]: string }; export default content; }
declare module "*.scss" { const content: { [className: string]: string }; export default content; }
declare module "*.svg" { const content: string; export default content; }
declare module "*.png" { const content: string; export default content; }
declare module "*.jpg" { const content: string; export default content; }
declare module "*.json" { const content: any; export default content; }
`;

/**
 * Runs TypeScript Compiler AST (Syntactic) & Semantic validation across all VFS files in memory.
 */
function validateVfsFiles(payload) {
  const fileEntries = normalizeFilesInput(payload.files);
  const vfs = new MemoryVfsVolume();
  const jsonVolumeInit = {
    "/__ambient_vfs__.d.ts": AMBIENT_GLOBAL_DECLS,
  };
  const fileMetaByVfsPath = new Map();
  const tsFileNames = ["/__ambient_vfs__.d.ts"];
  const syntacticDiagnostics = [];
  const semanticDiagnostics = [];
  const allDiagnostics = [];
  const fileStatuses = {};

  for (const meta of fileEntries) {
    const vfsPath = "/" + meta.normRel;
    jsonVolumeInit[vfsPath] = meta.content;
    fileMetaByVfsPath.set(vfsPath, meta);

    if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(meta.ext)) {
      tsFileNames.push(vfsPath);
    }
  }

  vfs.fromJSON(jsonVolumeInit);

  // Build CompilerOptions from payload.tsconfig (if provided) + defaults
  const rawTsConfig = payload.tsconfig && typeof payload.tsconfig === "object" ? payload.tsconfig : {};
  const rawCompilerOpts = rawTsConfig.compilerOptions || rawTsConfig;
  let parsedOpts = {};
  if (rawCompilerOpts && Object.keys(rawCompilerOpts).length > 0) {
    try {
      const conv = ts.convertCompilerOptionsFromJson(rawCompilerOpts, "/");
      parsedOpts = conv.options || {};
    } catch {
      parsedOpts = {};
    }
  }

  const compilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    jsx: ts.JsxEmit.ReactJSX,
    allowJs: true,
    checkJs: false,
    noEmit: true,
    skipLibCheck: true,
    isolatedModules: true,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    resolveJsonModule: true,
    strict: false,
    ...parsedOpts,
  };

  // Disk file cache for TypeScript lib.*.d.ts and shared_node_modules
  const diskFileCache = new Map();
  function resolveDiskFallbackPath(normPath) {
    // 1. Check TypeScript built-in lib files (e.g., /lib.esnext.d.ts, /lib.dom.d.ts)
    const baseName = path.posix.basename(normPath);
    if (tsLibDir && baseName.startsWith("lib.") && baseName.endsWith(".d.ts")) {
      const candidate = path.join(tsLibDir, baseName);
      if (fs.existsSync(candidate)) return candidate;
    }
    // 2. Check node_modules in shared_node_modules / web/node_modules
    if (normPath.startsWith("/node_modules/")) {
      const relFromNm = normPath.slice("/node_modules/".length);
      for (const nmRoot of sharedNodeModulesDirs) {
        const candidate = path.join(nmRoot, relFromNm);
        try {
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            return candidate;
          }
        } catch {
          // ignore
        }
      }
    }
    return null;
  }

  function hostFileExists(fileName) {
    const norm = vfs.normalize(fileName);
    if (vfs.existsSync(norm)) return true;
    const diskPath = resolveDiskFallbackPath(norm);
    return Boolean(diskPath);
  }

  function hostReadFile(fileName) {
    const norm = vfs.normalize(fileName);
    if (vfs.existsSync(norm)) return vfs.readFileSync(norm);
    if (diskFileCache.has(norm)) return diskFileCache.get(norm);
    const diskPath = resolveDiskFallbackPath(norm);
    if (diskPath) {
      try {
        const text = fs.readFileSync(diskPath, "utf-8");
        diskFileCache.set(norm, text);
        return text;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  function hostDirectoryExists(dirName) {
    const norm = vfs.normalize(dirName);
    if (vfs.directoryExists(norm)) return true;
    if (norm === "/node_modules") return sharedNodeModulesDirs.length > 0;
    if (norm.startsWith("/node_modules/")) {
      const relFromNm = norm.slice("/node_modules/".length);
      for (const nmRoot of sharedNodeModulesDirs) {
        try {
          const candidate = path.join(nmRoot, relFromNm);
          if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
            return true;
          }
        } catch {
          // ignore
        }
      }
    }
    return false;
  }

  if (tsFileNames.length > 1) {
    const sourceFileCache = new Map();
    const getOrCreateSourceFile = (fileName, languageVersion) => {
      const norm = vfs.normalize(fileName);
      if (sourceFileCache.has(norm)) return sourceFileCache.get(norm);
      const text = hostReadFile(norm);
      if (text === undefined) return undefined;
      const meta = fileMetaByVfsPath.get(norm);
      const scriptKind = getScriptKindForExt(meta ? meta.ext : path.posix.extname(norm));
      const sf = ts.createSourceFile(
        norm,
        text,
        languageVersion || ts.ScriptTarget.ESNext,
        true,
        scriptKind
      );
      sourceFileCache.set(norm, sf);
      return sf;
    };

    const compilerHost = {
      getSourceFile: getOrCreateSourceFile,
      getDefaultLibFileName: (opts) => "/" + ts.getDefaultLibFileName(opts),
      getDefaultLibLocation: () => "/",
      writeFile: () => {},
      getCurrentDirectory: () => "/",
      getCanonicalFileName: (f) => vfs.normalize(f),
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => "\n",
      fileExists: hostFileExists,
      readFile: hostReadFile,
      directoryExists: hostDirectoryExists,
      getDirectories: () => [],
      realpath: (f) => vfs.normalize(f),
    };

    const program = ts.createProgram(tsFileNames, compilerOptions, compilerHost);

    for (const vfsPath of tsFileNames) {
      if (vfsPath === "/__ambient_vfs__.d.ts") continue;
      const meta = fileMetaByVfsPath.get(vfsPath);
      if (!meta) continue;
      const sf = program.getSourceFile(vfsPath) || getOrCreateSourceFile(vfsPath, ts.ScriptTarget.ESNext);
      if (!sf) continue;

      const syntDiags = program.getSyntacticDiagnostics(sf) || [];
      let semDiags = [];
      try {
        semDiags = program.getSemanticDiagnostics(sf) || [];
      } catch {
        semDiags = [];
      }

      const fileSyntacticDiags = [];
      const fileSemanticDiags = [];

      for (const d of syntDiags) {
        const pos = typeof d.start === "number" ? d.start : 0;
        const lc = sf.getLineAndCharacterOfPosition(pos);
        const msg = ts.flattenDiagnosticMessageText(d.messageText, "\n");
        const cat =
          d.category === ts.DiagnosticCategory.Warning
            ? "warning"
            : d.category === ts.DiagnosticCategory.Suggestion
            ? "suggestion"
            : "error";
        const diagObj = formatDiagnosticEntry({
          file: meta.normRel,
          rawPath: meta.rawPath,
          normRel: meta.normRel,
          line: lc.line + 1,
          column: lc.character + 1,
          code: `TS${d.code}`,
          category: cat,
          message: msg,
          startMdLine: meta.start_md_line,
          frameIds: meta.frame_ids,
          content: meta.content,
          sourceType: "syntactic",
        });
        fileSyntacticDiags.push(diagObj);
        syntacticDiagnostics.push(diagObj);
        allDiagnostics.push(diagObj);
      }

      for (const d of semDiags) {
        const pos = typeof d.start === "number" ? d.start : 0;
        const lc = sf.getLineAndCharacterOfPosition(pos);
        const msg = ts.flattenDiagnosticMessageText(d.messageText, "\n");
        const cat =
          d.category === ts.DiagnosticCategory.Warning
            ? "warning"
            : d.category === ts.DiagnosticCategory.Suggestion
            ? "suggestion"
            : "error";
        const diagObj = formatDiagnosticEntry({
          file: meta.normRel,
          rawPath: meta.rawPath,
          normRel: meta.normRel,
          line: lc.line + 1,
          column: lc.character + 1,
          code: `TS${d.code}`,
          category: cat,
          message: msg,
          startMdLine: meta.start_md_line,
          frameIds: meta.frame_ids,
          content: meta.content,
          sourceType: "semantic",
        });
        fileSemanticDiags.push(diagObj);
        semanticDiagnostics.push(diagObj);
        if (payload.include_semantic_in_diagnostics) {
          allDiagnostics.push(diagObj);
        }
      }

      fileStatuses[meta.normRel] = {
        compilable: fileSyntacticDiags.length === 0,
        errors_count: fileSyntacticDiags.length,
        semantic_errors_count: fileSemanticDiags.length,
        diagnostics: fileSyntacticDiags,
        semantic_diagnostics: fileSemanticDiags,
      };
    }
  }

  // 2. Validate JSON and CSS files
  for (const [, meta] of fileMetaByVfsPath.entries()) {
    if (meta.ext === ".json") {
      const jDiags = validateJsonContent(meta);
      syntacticDiagnostics.push(...jDiags);
      allDiagnostics.push(...jDiags);
      fileStatuses[meta.normRel] = {
        compilable: jDiags.length === 0,
        errors_count: jDiags.length,
        semantic_errors_count: 0,
        diagnostics: jDiags,
        semantic_diagnostics: [],
      };
    } else if (meta.ext === ".css" || meta.ext === ".scss" || meta.ext === ".less") {
      const cDiags = validateCssContent(meta);
      syntacticDiagnostics.push(...cDiags);
      allDiagnostics.push(...cDiags);
      fileStatuses[meta.normRel] = {
        compilable: cDiags.length === 0,
        errors_count: cDiags.length,
        semantic_errors_count: 0,
        diagnostics: cDiags,
        semantic_diagnostics: [],
      };
    } else if (!fileStatuses[meta.normRel]) {
      fileStatuses[meta.normRel] = {
        compilable: true,
        errors_count: 0,
        semantic_errors_count: 0,
        diagnostics: [],
        semantic_diagnostics: [],
      };
    }
  }

  const totalFiles = fileEntries.length;
  const compilableFiles = Object.values(fileStatuses).filter((s) => s.compilable).length;
  const combinedDiagnostics =
    payload.include_semantic_in_diagnostics === false
      ? syntacticDiagnostics
      : [...syntacticDiagnostics, ...semanticDiagnostics];

  return {
    id: payload.id || null,
    status: "ok",
    typescript_version: ts.version,
    memfs_active: Boolean(memfsModule),
    total_files: totalFiles,
    compilable_files: compilableFiles,
    syntax_errors_count: syntacticDiagnostics.length,
    semantic_errors_count: semanticDiagnostics.length,
    total_diagnostics_count: syntacticDiagnostics.length + semanticDiagnostics.length,
    diagnostics: payload.include_semantic_in_diagnostics ? combinedDiagnostics : syntacticDiagnostics,
    syntactic_diagnostics: syntacticDiagnostics,
    semantic_diagnostics: semanticDiagnostics,
    all_diagnostics: combinedDiagnostics,
    file_statuses: fileStatuses,
  };
}

// Check if invoked with a temp file argument: `node ts_analyzer_worker.mjs <temp.json>` or `--input <temp.json>`
const args = process.argv.slice(2);
let inputFilePath = null;
let outputFilePath = null;
for (let i = 0; i < args.length; i++) {
  if ((args[i] === "--input" || args[i] === "-i") && args[i + 1]) {
    inputFilePath = args[i + 1];
    i++;
  } else if ((args[i] === "--output" || args[i] === "-o") && args[i + 1]) {
    outputFilePath = args[i + 1];
    i++;
  } else if (!args[i].startsWith("-") && !inputFilePath) {
    inputFilePath = args[i];
  }
}

if (inputFilePath) {
  try {
    const rawJson = fs.readFileSync(path.resolve(inputFilePath), "utf-8");
    const req = JSON.parse(rawJson);
    const res = validateVfsFiles(req);
    const outStr = JSON.stringify(res);
    if (outputFilePath) {
      fs.writeFileSync(path.resolve(outputFilePath), outStr, "utf-8");
    } else {
      process.stdout.write(outStr + "\n");
    }
    process.exit(0);
  } catch (err) {
    const errPayload = JSON.stringify({
      status: "error",
      error: String(err && err.stack ? err.stack : err),
      diagnostics: [],
    });
    if (outputFilePath) {
      fs.writeFileSync(path.resolve(outputFilePath), errPayload, "utf-8");
    } else {
      process.stdout.write(errPayload + "\n");
    }
    process.exit(1);
  }
}

// Persistent JSON-RPC over stdin/stdout loop (also handles multi-line EOF stdin if piped)
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

let multiLineBuffer = "";

rl.on("line", (line) => {
  const trimmed = (line || "").trim();
  if (!trimmed) return;

  const candidate = multiLineBuffer ? multiLineBuffer + "\n" + trimmed : trimmed;
  let req = null;
  try {
    req = JSON.parse(candidate);
    multiLineBuffer = "";
  } catch {
    multiLineBuffer = candidate;
    return;
  }

  if (req.action === "ping") {
    process.stdout.write(
      JSON.stringify({
        id: req.id || null,
        status: "pong",
        typescript_version: ts.version,
      }) + "\n"
    );
    return;
  }

  if (req.action === "shutdown") {
    process.stdout.write(JSON.stringify({ id: req.id || null, status: "bye" }) + "\n");
    process.exit(0);
  }

  try {
    const result = validateVfsFiles(req);
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (err) {
    process.stdout.write(
      JSON.stringify({
        id: req.id || null,
        status: "error",
        error: String(err && err.stack ? err.stack : err),
      }) + "\n"
    );
  }
});

rl.on("close", () => {
  if (multiLineBuffer.trim()) {
    try {
      const req = JSON.parse(multiLineBuffer);
      const result = validateVfsFiles(req);
      process.stdout.write(JSON.stringify(result) + "\n");
    } catch (err) {
      process.stdout.write(
        JSON.stringify({
          status: "error",
          error: `Invalid JSON request: ${err.message}`,
        }) + "\n"
      );
    }
  }
});
