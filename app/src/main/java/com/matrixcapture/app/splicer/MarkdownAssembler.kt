package com.matrixcapture.app.splicer

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MarkdownAssembler(private val context: Context) {
    data class SegmentPayload(val segmentIndex: Int, val startLine: Int, val endLine: Int, val rawContent: String)
    data class AssemblyResult(val isSuccessful: Boolean, val totalLines: Int, val totalCharacters: Int, val outputFile: File?, val outputUri: Uri?, val warnings: List<String>)

    fun assembleAndSave(segments: List<SegmentPayload>, outputBaseName: String = "MatrixCapture_Document"): AssemblyResult {
        val warnings = mutableListOf<String>()
        val sorted = segments.sortedBy { it.segmentIndex }
        if (sorted.isEmpty()) return AssemblyResult(false, 0, 0, null, null, listOf("No segments provided."))

        val merged = mutableListOf<String>()
        for ((i, seg) in sorted.withIndex()) {
            val lines = seg.rawContent.lines()
            if (i == 0) merged.addAll(lines)
            else merged.addAll(stripBoundaryOverlap(merged.toList(), lines, warnings, i))
        }

        validateStructure(merged, warnings)
        val content = merged.joinToString("\n")
        val fileName = "${outputBaseName}_${SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())}.md"
        val (file, uri) = saveToDocuments(fileName, content)
        Log.i(TAG, "Assembly complete: ${merged.size} lines. Saved to: ${file?.absolutePath ?: uri}")
        return AssemblyResult(file != null || uri != null, merged.size, content.length, file, uri, warnings)
    }

    private fun stripBoundaryOverlap(prior: List<String>, incoming: List<String>, warnings: MutableList<String>, segIdx: Int): List<String> {
        if (prior.isEmpty() || incoming.isEmpty()) return incoming
        val pTail = prior.takeLast(25.coerceAtMost(prior.size))
        val iHead = incoming.take(25.coerceAtMost(incoming.size))
        var matchLen = 0; var startIdx = 0

        for (len in 15 downTo 3) {
            for (hIdx in 0..(iHead.size - len)) {
                if (pTail.takeLast(len).zip(iHead.subList(hIdx, hIdx + len)).all { (a, b) -> a.trimEnd() == b.trimEnd() }) {
                    matchLen = len; startIdx = hIdx + len; break
                }
            }
            if (matchLen > 0) break
        }

        return if (matchLen > 0) incoming.drop(startIdx) else {
            warnings.add("Segment $segIdx: No exact overlap found; appended without trim."); incoming
        }
    }

    private fun validateStructure(lines: List<String>, warnings: MutableList<String>) {
        var openCode = 0; var cStarts = 0; var cEnds = 0
        for (l in lines) {
            val t = l.trim()
            if (t.startsWith("```")) openCode = 1 - openCode
            if (t.contains("<!-- CODESCAN_FILE_START")) cStarts++
            if (t.contains("<!-- CODESCAN_FILE_END")) cEnds++
        }
        if (openCode != 0) warnings.add("Syntax Warning: Triple-backtick markdown blocks are not cleanly closed.")
        if (cStarts != cEnds) warnings.add("Parser Warning: CODESCAN markers unbalanced ($cStarts starts vs $cEnds ends).")
    }

    private fun saveToDocuments(fileName: String, content: String): Pair<File?, Uri?> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                val cv = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
                    put(MediaStore.MediaColumns.MIME_TYPE, "text/markdown")
                    put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOCUMENTS}/MatrixCapture")
                }
                val uri = context.contentResolver.insert(MediaStore.Files.getContentUri("external"), cv)
                if (uri != null) {
                    context.contentResolver.openOutputStream(uri)?.use { it.write(content.toByteArray()) }
                    return Pair(null, uri)
                }
            } catch (e: Exception) { Log.e(TAG, "MediaStore save failed", e) }
        }
        val dir = File(context.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS) ?: context.filesDir, "MatrixCapture").apply { mkdirs() }
        val f = File(dir, fileName).apply { FileOutputStream(this).use { it.write(content.toByteArray()) } }
        return Pair(f, null)
    }

    companion object { private const val TAG = "MarkdownAssembler" }
}
