#!/usr/bin/env node
/**
 * Persistent TypeScript & AST Compiler Validator Worker (ts_analyzer_worker.mjs)
 * Uses the TypeScript Compiler API (typescript) and an in-memory Virtual File System (memfs / VFS volume)
 * to parse and validate .ts, .tsx, .js, .jsx, .json, and .css files extracted by DAG Node 10.
 *
 * Protocol:
 *   Reads newline-delimited JSON requests from stdin and writes newline-delimited JSON responses to stdout.
 */

import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Resolve TypeScript from web/node_modules/typescript or standard node resolution
let ts = null;
const tsCandidatePaths = [
  path.resolve(__dirname, "../../web/node_modules/typescript"),
  path.resolve(__dirname, "../storage/shared_node_modules/typescript"),
  "typescript",
];

for (const cand of tsCandidatePaths) {
  try {
    ts = require(cand);
    if (ts && ts.createSourceFile) break;
  } catch {
    // try next candidate
  }
}

if (!ts) {
  process.stderr.write("[ts_analyzer_worker] ERROR: Could not resolve 'typescript' module.\n");
  process.exit(1);
}

// Optional memfs integration + built-in InMemoryVolume with identical API
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
    // fallback to built-in MemoryVolume
  }
}

class MemoryVfsVolume {
  constructor() {
    this.files = new Map();
  }

  normalize(filePath) {
    let p = String(filePath || "").replace(/\\/g, "/").trim();
    if (!p.startsWith("/")) p = "/" + p;
    return p.replace(/\/+/g, "/");
  }

  fromJSON(jsonMap) {
    this.files.clear();
    if (memfsModule && memfsModule.Volume) {
      try {
        this._memfsVol = memfsModule.Volume.fromJSON(jsonMap, "/");
      } catch {
        this._memfsVol = null;
      }
    }
    for (const [k, v] of Object.entries(jsonMap || {})) {
      this.files.set(this.normalize(k), String(v ?? ""));
    }
  }

  writeFileSync(filePath, content) {
    const norm = this.normalize(filePath);
    this.files.set(norm, String(content ?? ""));
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

  readFileSync(filePath) {
    const norm = this.normalize(filePath);
    return this.files.get(norm);
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

/**
 * Validates CSS syntax for balanced curly braces, unclosed block comments, and unclosed quotes.
 */
function validateCssContent(filePath, normalizedPath, content) {
  const diagnostics = [];
  const lines = String(content ?? "").split(/\r?\n/);
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
            diagnostics.push({
              file_path: filePath,
              normalized_path: normalizedPath,
              file_line: lineNum,
              file_col: j + 1,
              code: "CSS1001",
              category: "error",
              message: "Unexpected closing '}' in CSS stylesheet.",
            });
            braceDepth = 0;
          }
        }
      }
    }

    if (inSingleQuote || inDoubleQuote) {
      diagnostics.push({
        file_path: filePath,
        normalized_path: normalizedPath,
        file_line: lineNum,
        file_col: 1,
        code: "CSS1002",
        category: "error",
        message: "Unclosed string literal on CSS line.",
      });
    }
  }

  if (inComment) {
    diagnostics.push({
      file_path: filePath,
      normalized_path: normalizedPath,
      file_line: commentStartLine,
      file_col: commentStartCol,
      code: "CSS1003",
      category: "error",
      message: "Unclosed CSS block comment '/*'.",
    });
  }

  if (braceDepth > 0) {
    diagnostics.push({
      file_path: filePath,
      normalized_path: normalizedPath,
      file_line: lastOpenBraceLine,
      file_col: lastOpenBraceCol,
      code: "CSS1004",
      category: "error",
      message: `Unclosed CSS rule block '{' (${braceDepth} missing '}').`,
    });
  }

  return diagnostics;
}

/**
 * Validates JSON syntax using TypeScript's parseJsonText for accurate line/column positions.
 */
function validateJsonContent(filePath, normalizedPath, content) {
  const diagnostics = [];
  const sf = ts.parseJsonText(normalizedPath || filePath, String(content ?? ""));
  const parseDiags = sf.parseDiagnostics || [];
  for (const d of parseDiags) {
    const pos = typeof d.start === "number" ? d.start : 0;
    const lc = sf.getLineAndCharacterOfPosition(pos);
    const msg = ts.flattenDiagnosticMessageText(d.messageText, "\n");
    diagnostics.push({
      file_path: filePath,
      normalized_path: normalizedPath,
      file_line: lc.line + 1,
      file_col: lc.character + 1,
      code: `TS${d.code}`,
      category: "error",
      message: msg,
    });
  }
  return diagnostics;
}

/**
 * Runs TypeScript Compiler AST & Syntactic validation across all VFS files in memory.
 */
function validateVfsFiles(payload) {
  const files = Array.isArray(payload.files) ? payload.files : [];
  const vfs = new MemoryVfsVolume();
  const jsonVolumeInit = {};
  const fileMetaByVfsPath = new Map();
  const tsFileNames = [];
  const allDiagnostics = [];
  const fileStatuses = {};

  for (const f of files) {
    const rawPath = f.path || f.normalized_path || "unnamed.ts";
    const normRel = String(f.normalized_path || rawPath).replace(/\\/g, "/").replace(/^\/+/, "");
    const vfsPath = "/" + normRel;
    const ext = (f.ext || path.posix.extname(normRel) || "").toLowerCase();
    const content = String(f.content ?? "");

    jsonVolumeInit[vfsPath] = content;
    fileMetaByVfsPath.set(vfsPath, {
      rawPath,
      normRel,
      ext,
      content,
      start_md_line: f.start_md_line || 0,
      end_md_line: f.end_md_line || 0,
    });

    if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
      tsFileNames.push(vfsPath);
    }
  }

  vfs.fromJSON(jsonVolumeInit);

  // 1. Validate TS/TSX/JS/JSX via TypeScript Compiler API + in-memory CompilerHost
  if (tsFileNames.length > 0) {
    const compilerOptions = {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.Preserve,
      allowJs: true,
      checkJs: false,
      noEmit: true,
      skipLibCheck: true,
      noResolve: true,
      isolatedModules: true,
    };

    const sourceFileCache = new Map();
    const getOrCreateSourceFile = (fileName, languageVersion) => {
      const norm = vfs.normalize(fileName);
      if (sourceFileCache.has(norm)) return sourceFileCache.get(norm);
      const text = vfs.readFileSync(norm);
      if (text === undefined) return undefined;
      const meta = fileMetaByVfsPath.get(norm);
      const scriptKind = getScriptKindForExt(meta ? meta.ext : path.posix.extname(norm));
      const sf = ts.createSourceFile(norm, text, languageVersion || ts.ScriptTarget.ESNext, true, scriptKind);
      sourceFileCache.set(norm, sf);
      return sf;
    };

    const compilerHost = {
      getSourceFile: getOrCreateSourceFile,
      getDefaultLibFileName: () => "/lib.d.ts",
      writeFile: () => {},
      getCurrentDirectory: () => "/",
      getCanonicalFileName: (f) => vfs.normalize(f),
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => "\n",
      fileExists: (f) => vfs.existsSync(f),
      readFile: (f) => vfs.readFileSync(f),
    };

    const program = ts.createProgram(tsFileNames, compilerOptions, compilerHost);

    for (const vfsPath of tsFileNames) {
      const meta = fileMetaByVfsPath.get(vfsPath);
      const sf = program.getSourceFile(vfsPath) || getOrCreateSourceFile(vfsPath, ts.ScriptTarget.ESNext);
      if (!sf) continue;

      const syntDiags = program.getSyntacticDiagnostics(sf) || [];
      const fileDiags = [];

      for (const d of syntDiags) {
        const pos = typeof d.start === "number" ? d.start : 0;
        const lc = sf.getLineAndCharacterOfPosition(pos);
        const msg = ts.flattenDiagnosticMessageText(d.messageText, "\n");
        const diagObj = {
          file_path: meta.rawPath,
          normalized_path: meta.normRel,
          file_line: lc.line + 1,
          file_col: lc.character + 1,
          code: `TS${d.code}`,
          category: d.category === ts.DiagnosticCategory.Warning ? "warning" : "error",
          message: msg,
        };
        fileDiags.push(diagObj);
        allDiagnostics.push(diagObj);
      }

      fileStatuses[meta.normRel] = {
        compilable: fileDiags.length === 0,
        errors_count: fileDiags.length,
        diagnostics: fileDiags,
      };
    }
  }

  // 2. Validate JSON and CSS files
  for (const [vfsPath, meta] of fileMetaByVfsPath.entries()) {
    if (meta.ext === ".json") {
      const jDiags = validateJsonContent(meta.rawPath, meta.normRel, meta.content);
      allDiagnostics.push(...jDiags);
      fileStatuses[meta.normRel] = {
        compilable: jDiags.length === 0,
        errors_count: jDiags.length,
        diagnostics: jDiags,
      };
    } else if (meta.ext === ".css" || meta.ext === ".scss" || meta.ext === ".less") {
      const cDiags = validateCssContent(meta.rawPath, meta.normRel, meta.content);
      allDiagnostics.push(...cDiags);
      fileStatuses[meta.normRel] = {
        compilable: cDiags.length === 0,
        errors_count: cDiags.length,
        diagnostics: cDiags,
      };
    } else if (!fileStatuses[meta.normRel]) {
      fileStatuses[meta.normRel] = {
        compilable: true,
        errors_count: 0,
        diagnostics: [],
      };
    }
  }

  const totalFiles = files.length;
  const compilableFiles = Object.values(fileStatuses).filter((s) => s.compilable).length;

  return {
    id: payload.id || null,
    status: "ok",
    typescript_version: ts.version,
    memfs_active: Boolean(memfsModule),
    total_files: totalFiles,
    compilable_files: compilableFiles,
    syntax_errors_count: allDiagnostics.length,
    diagnostics: allDiagnostics,
    file_statuses: fileStatuses,
  };
}

// Persistent JSON-RPC over stdin/stdout loop
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on("line", (line) => {
  const trimmed = (line || "").trim();
  if (!trimmed) return;
  let req = {};
  try {
    req = JSON.parse(trimmed);
  } catch (err) {
    process.stdout.write(
      JSON.stringify({ status: "error", error: `Invalid JSON request: ${err.message}` }) + "\n"
    );
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

