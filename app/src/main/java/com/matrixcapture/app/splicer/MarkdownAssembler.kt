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

/**
 * Module E: Splicing & Verification Engine.
 *
 * 1. Merges discrete OCR text blocks from each video segment.
 * 2. Deduplicates overlapping boundary lines (5–10 lines overlap window).
 * 3. Validates balanced triple-backtick markdown blocks (```).
 * 4. Validates balanced <!-- CODESCAN_FILE_START --> and <!-- CODESCAN_FILE_END --> tags.
 * 5. Saves the final unified markdown file to the public Documents/MatrixCapture folder.
 */
class MarkdownAssembler(
    private val context: Context
) {

    data class SegmentPayload(
        val segmentIndex: Int,
        val startLine: Int,
        val endLine: Int,
        val rawContent: String
    )

    data class AssemblyResult(
        val isSuccessful: Boolean,
        val totalLines: Int,
        val totalCharacters: Int,
        val outputFile: File?,
        val outputUri: Uri?,
        val warnings: List<String>
    )

    /**
     * Stitches ordered segment texts into a single, clean markdown document.
     */
    fun assembleAndSave(
        segments: List<SegmentPayload>,
        outputBaseName: String = "MatrixCapture_Document"
    ): AssemblyResult {
        val warnings = mutableListOf<String>()
        val sortedSegments = segments.sortedBy { it.segmentIndex }

        if (sortedSegments.isEmpty()) {
            return AssemblyResult(
                isSuccessful = false,
                totalLines = 0,
                totalCharacters = 0,
                outputFile = null,
                outputUri = null,
                warnings = listOf("No segments provided for assembly.")
            )
        }

        // 1. Splice and strip boundary overlaps
        val mergedLines = mutableListOf<String>()
        for (i in sortedSegments.indices) {
            val segment = sortedSegments[i]
            val segmentLines = segment.rawContent.lines()

            if (i == 0) {
                mergedLines.addAll(segmentLines)
            } else {
                val previousLines = mergedLines.toList()
                val deduplicatedLines = stripBoundaryOverlap(previousLines, segmentLines, warnings, i)
                mergedLines.addAll(deduplicatedLines)
            }
        }

        // 2. Validate structural integrity
        validateStructure(mergedLines, warnings)

        val finalContent = mergedLines.joinToString("\n")

        // 3. Save to public Documents directory
        val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        val fileName = "${outputBaseName}_$timestamp.md"
        val (file, uri) = saveToDocuments(fileName, finalContent)

        Log.i(
            TAG,
            "Document assembly complete: ${mergedLines.size} lines, ${finalContent.length} chars. " +
                    "Saved to: ${file?.absolutePath ?: uri?.toString()}"
        )

        return AssemblyResult(
            isSuccessful = file != null || uri != null,
            totalLines = mergedLines.size,
            totalCharacters = finalContent.length,
            outputFile = file,
            outputUri = uri,
            warnings = warnings
        )
    }

    /**
     * Finds matching overlap window at segment boundary and strips the duplicate prefix.
     */
    private fun stripBoundaryOverlap(
        priorLines: List<String>,
        incomingLines: List<String>,
        warnings: MutableList<String>,
        segmentIndex: Int
    ): List<String> {
        if (priorLines.isEmpty() || incomingLines.isEmpty()) return incomingLines

        // Inspect the last 25 lines of prior segment and first 25 lines of incoming segment
        val lookbackCount = 25.coerceAtMost(priorLines.size)
        val priorTail = priorLines.takeLast(lookbackCount)
        val lookforwardCount = 25.coerceAtMost(incomingLines.size)
        val incomingHead = incomingLines.take(lookforwardCount)

        var bestMatchLength = 0
        var bestIncomingStartIndex = 0

        // Search for the longest overlapping suffix in priorTail matching a prefix in incomingHead
        for (overlapLen in 15 downTo 3) {
            for (headIdx in 0..(incomingHead.size - overlapLen)) {
                val candidateSlice = incomingHead.subList(headIdx, headIdx + overlapLen)

                // Check if candidateSlice matches the tail of priorLines
                if (priorTail.takeLast(overlapLen).matchesNormalized(candidateSlice)) {
                    bestMatchLength = overlapLen
                    bestIncomingStartIndex = headIdx + overlapLen
                    break
                }
            }
            if (bestMatchLength > 0) break
        }

        return if (bestMatchLength > 0) {
            Log.i(
                TAG,
                "Segment $segmentIndex: Stripped boundary overlap of $bestMatchLength lines " +
                        "(Starting from line index $bestIncomingStartIndex of incoming segment)."
            )
            incomingLines.drop(bestIncomingStartIndex)
        } else {
            warnings.add("Segment $segmentIndex: No exact boundary overlap found; appending without trim.")
            Log.w(TAG, "Segment $segmentIndex: Overlap detection fell back to clean append.")
            incomingLines
        }
    }

    private fun List<String>.matchesNormalized(other: List<String>): Boolean {
        if (this.size != other.size) return false
        for (i in indices) {
            val a = this[i].trimEnd()
            val b = other[i].trimEnd()
            if (a != b) return false
        }
        return true
    }

    /**
     * Performs structural validation on the combined lines:
     * - Balanced ``` code fences
     * - Balanced <!-- CODESCAN_FILE_START --> and <!-- CODESCAN_FILE_END -->
     */
    private fun validateStructure(lines: List<String>, warnings: MutableList<String>) {
        var openCodeBlocks = 0
        var codeScanStarts = 0
        var codeScanEnds = 0

        for ((idx, line) in lines.withIndex()) {
            val trimmed = line.trim()
            if (trimmed.startsWith("```")) {
                openCodeBlocks = if (openCodeBlocks == 0) 1 else 0
            }
            if (trimmed.contains("<!-- CODESCAN_FILE_START")) {
                codeScanStarts++
            }
            if (trimmed.contains("<!-- CODESCAN_FILE_END -->") || trimmed.contains("<!-- CODESCAN_FILE_END")) {
                codeScanEnds++
            }
        }

        if (openCodeBlocks != 0) {
            val warnMsg = "Syntax Warning: Triple-backtick markdown blocks (```) are not cleanly closed (Odd number of fences)."
            Log.w(TAG, warnMsg)
            warnings.add(warnMsg)
        }

        if (codeScanStarts != codeScanEnds) {
            val warnMsg = "Parser Warning: CODESCAN markers unbalanced (Starts: $codeScanStarts, Ends: $codeScanEnds)."
            Log.w(TAG, warnMsg)
            warnings.add(warnMsg)
        }
    }

    /**
     * Saves the generated file to the public Documents directory via MediaStore / File API.
     */
    private fun saveToDocuments(fileName: String, content: String): Pair<File?, Uri?> {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                val resolver = context.contentResolver
                val contentValues = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
                    put(MediaStore.MediaColumns.MIME_TYPE, "text/markdown")
                    put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOCUMENTS}/MatrixCapture")
                }
                val uri = resolver.insert(MediaStore.Files.getContentUri("external"), contentValues)
                if (uri != null) {
                    resolver.openOutputStream(uri)?.use { os ->
                        os.write(content.toByteArray(Charsets.UTF_8))
                        os.flush()
                    }
                    Pair(null, uri)
                } else {
                    saveFallbackFile(fileName, content)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error saving via MediaStore, attempting fallback", e)
                saveFallbackFile(fileName, content)
            }
        } else {
            saveFallbackFile(fileName, content)
        }
    }

    private fun saveFallbackFile(fileName: String, content: String): Pair<File?, Uri?> {
        val documentsDir = context.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS)
            ?: File(context.filesDir, "Documents")
        val matrixCaptureDir = File(documentsDir, "MatrixCapture")
        if (!matrixCaptureDir.exists()) {
            matrixCaptureDir.mkdirs()
        }
        val targetFile = File(matrixCaptureDir, fileName)
        FileOutputStream(targetFile).use { fos ->
            fos.write(content.toByteArray(Charsets.UTF_8))
            fos.flush()
        }
        return Pair(targetFile, null)
    }

    companion object {
        private const val TAG = "MarkdownAssembler"
    }
}
