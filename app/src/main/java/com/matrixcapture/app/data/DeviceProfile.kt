package com.matrixcapture.app.data

import android.os.Build

enum class DeviceModel(
    val id: String,
    val displayName: String,
    val linesPerPage: Int,
    val arrowCountInitial: Int,
    val arrowCountStep: Int,
    val stepSize: Int
) {
    PIXEL_8(
        id = "pixel_8",
        displayName = "Pixel 8",
        linesPerPage = 31,
        arrowCountInitial = 63,
        arrowCountStep = 30,
        stepSize = 30
    ),
    PIXEL_10(
        id = "pixel_10",
        displayName = "Pixel 10",
        linesPerPage = 49,
        arrowCountInitial = 99,
        arrowCountStep = 48,
        stepSize = 48
    ),
    AUTO(
        id = "auto",
        displayName = "Auto-Detect",
        linesPerPage = 49,
        arrowCountInitial = 99,
        arrowCountStep = 48,
        stepSize = 48
    );

    fun resolve(): DeviceModel {
        if (this != AUTO) return this
        val model = Build.MODEL.orEmpty()
        return if (model.contains("Pixel 8", ignoreCase = true)) PIXEL_8 else PIXEL_10
    }

    /**
     * Calculates expected (topLine, bottomLine) for a given 1-based page number.
     * Page 1: 1 .. linesPerPage (e.g. 1..31 on P8, 1..49 on P10)
     * Page 2: (linesPerPage + 1) .. (linesPerPage + 1 + stepSize) (e.g. 32..62 on P8, 50..98 on P10)
     * Page P: (linesPerPage + 1) + (P - 2) * stepSize .. expectedTop + stepSize
     */
    fun expectedBounds(page: Int): Pair<Int, Int> {
        val target = resolve()
        if (page <= 1) return Pair(1, target.linesPerPage)
        val top = (target.linesPerPage + 1) + (page - 2) * target.stepSize
        val bot = top + target.stepSize
        return Pair(top, bot)
    }

    /**
     * Calculates required Down Arrow presses to advance from the current page.
     * pageIndex = 1 (advancing from Page 1 to Page 2) requires arrowCountInitial (63 on P8, 99 on P10)
     * pageIndex >= 2 (advancing subsequent pages) requires arrowCountStep (30 on P8, 48 on P10)
     */
    fun arrowCountForPage(pageIndex: Int): Int {
        val target = resolve()
        return if (pageIndex <= 1) target.arrowCountInitial else target.arrowCountStep
    }

    fun displayPageForTopLine(topLine: Int): Int {
        val target = resolve()
        return if (topLine > 0) ((topLine - 1) / target.stepSize + 1) else 1
    }

    companion object {
        fun fromString(str: String?): DeviceModel {
            val s = (str ?: "").trim().lowercase()
            return entries.firstOrNull {
                it.id == s || it.name.equals(s, ignoreCase = true) || (s.contains("pixel_8") || s.contains("pixel 8")) && it == PIXEL_8 || (s.contains("pixel_10") || s.contains("pixel 10")) && it == PIXEL_10
            } ?: AUTO
        }
    }
}
