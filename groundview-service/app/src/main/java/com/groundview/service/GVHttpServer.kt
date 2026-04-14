package com.groundview.service

import android.util.Log
import fi.iki.elonen.NanoHTTPD

/**
 * 경량 HTTP 서버 — 접근성 트리를 XML로 노출.
 *
 * 엔드포인트:
 *   GET /status  → 서버 상태 JSON
 *   GET /source  → uiautomator dump 호환 XML
 */
class GVHttpServer(
    private val service: GVAccessibilityService,
    port: Int
) : NanoHTTPD(port) {

    companion object {
        private const val TAG = "GVHttpServer"
    }

    override fun serve(session: IHTTPSession): Response {
        val uri = session.uri ?: "/"
        Log.d(TAG, "${session.method} $uri")

        return when {
            uri == "/status" || uri == "/" -> {
                val json = """{"ready":true,"service":"groundview-service","port":${GVAccessibilityService.HTTP_PORT}}"""
                newFixedLengthResponse(Response.Status.OK, "application/json", json)
            }

            uri == "/source" -> {
                try {
                    val xml = service.dumpToXml()
                    newFixedLengthResponse(Response.Status.OK, "application/xml", xml)
                } catch (e: Exception) {
                    Log.e(TAG, "/source 실패", e)
                    val err = """{"error":"${e.message?.replace("\"", "'")}"}"""
                    newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "application/json", err)
                }
            }

            else -> {
                newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Not Found")
            }
        }
    }
}
