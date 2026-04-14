package com.groundview.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * GroundView 접근성 서비스.
 *
 * AccessibilityService를 통해 Compose 포함 전체 접근성 트리에 접근하고,
 * 내장 HTTP 서버(NanoHTTPD)로 XML을 외부에 노출한다.
 *
 * appkium의 AutoTestAccessibilityService 패턴을 참고하되,
 * 오버레이/녹화/재생 기능은 제거하고 HTTP 서버만 탑재.
 */
class GVAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "GVA11yService"
        const val HTTP_PORT = 9800

        @Volatile
        private var instance: GVAccessibilityService? = null

        fun getInstance(): GVAccessibilityService? = instance
        fun isRunning(): Boolean = instance != null
    }

    private var httpServer: GVHttpServer? = null

    override fun onServiceConnected() {
        instance = this
        Log.i(TAG, "GroundView AccessibilityService 연결됨")

        // 접근성 플래그 설정
        val info = serviceInfo
        info.flags = info.flags or
                AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS or
                AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS
        serviceInfo = info

        // HTTP 서버 시작
        try {
            httpServer = GVHttpServer(this, HTTP_PORT)
            httpServer?.start()
            Log.i(TAG, "HTTP 서버 시작: port=$HTTP_PORT")
        } catch (e: Exception) {
            Log.e(TAG, "HTTP 서버 시작 실패", e)
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        // 이벤트 처리 불필요 — HTTP 요청 시에만 트리를 덤프
    }

    override fun onInterrupt() {
        Log.w(TAG, "AccessibilityService 인터럽트")
    }

    override fun onDestroy() {
        Log.i(TAG, "GroundView AccessibilityService 종료")
        httpServer?.stop()
        httpServer = null
        instance = null
        super.onDestroy()
    }

    /**
     * 모든 윈도우의 접근성 트리를 순회하여 uiautomator dump 호환 XML을 생성한다.
     * 전략:
     *  1. rootInActiveWindow — 현재 포커스된 앱 윈도우 (가장 신뢰도 높음)
     *  2. TYPE_APPLICATION 윈도우 — 앱 윈도우만 필터링
     *  3. 전체 윈도우 fallback
     */
    fun dumpToXml(): String {
        val sb = StringBuilder()
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
        sb.append("<hierarchy rotation=\"0\">\n")

        var dumped = false

        // 1순위: rootInActiveWindow — 현재 포커스 앱의 루트
        val activeRoot = rootInActiveWindow
        if (activeRoot != null && activeRoot.packageName?.toString() != packageName) {
            dumpNode(activeRoot, sb, depth = 1)
            activeRoot.recycle()
            dumped = true
        } else {
            activeRoot?.recycle()
        }

        // 2순위: TYPE_APPLICATION 윈도우 (appkium 패턴)
        if (!dumped) {
            for (window in windows) {
                if (window.type != android.view.accessibility.AccessibilityWindowInfo.TYPE_APPLICATION) continue
                val root = window.root ?: continue
                if (root.packageName?.toString() == packageName) { root.recycle(); continue }
                dumpNode(root, sb, depth = 1)
                root.recycle()
                dumped = true
            }
        }

        // 3순위: 전체 윈도우 (시스템 UI 포함)
        if (!dumped) {
            for (window in windows) {
                val root = window.root ?: continue
                if (root.packageName?.toString() == packageName) { root.recycle(); continue }
                dumpNode(root, sb, depth = 1)
                root.recycle()
            }
        }

        sb.append("</hierarchy>\n")
        return sb.toString()
    }

    /**
     * AccessibilityNodeInfo를 uiautomator dump 호환 XML로 재귀 직렬화.
     * 속성명은 uiautomator dump와 동일하게 맞춰서 GroundView의 buildTree()가
     * 수정 없이 파싱할 수 있도록 한다.
     */
    private fun dumpNode(node: AccessibilityNodeInfo, sb: StringBuilder, depth: Int) {
        val indent = "  ".repeat(depth)
        val bounds = android.graphics.Rect()
        node.getBoundsInScreen(bounds)

        val cls = escXml(node.className?.toString() ?: "")
        val pkg = escXml(node.packageName?.toString() ?: "")
        val text = escXml(node.text?.toString() ?: "")
        val desc = escXml(node.contentDescription?.toString() ?: "")
        val rid = escXml(node.viewIdResourceName ?: "")
        val boundsStr = "[${bounds.left},${bounds.top}][${bounds.right},${bounds.bottom}]"

        sb.append(indent)
        sb.append("<node")
        sb.append(" index=\"${node.indexInParent()}\"")
        sb.append(" text=\"$text\"")
        sb.append(" resource-id=\"$rid\"")
        sb.append(" class=\"$cls\"")
        sb.append(" package=\"$pkg\"")
        sb.append(" content-desc=\"$desc\"")
        sb.append(" checkable=\"${node.isCheckable}\"")
        sb.append(" checked=\"${node.isChecked}\"")
        sb.append(" clickable=\"${node.isClickable}\"")
        sb.append(" enabled=\"${node.isEnabled}\"")
        sb.append(" focusable=\"${node.isFocusable}\"")
        sb.append(" focused=\"${node.isFocused}\"")
        sb.append(" scrollable=\"${node.isScrollable}\"")
        sb.append(" long-clickable=\"${node.isLongClickable}\"")
        sb.append(" password=\"${node.isPassword}\"")
        sb.append(" selected=\"${node.isSelected}\"")
        sb.append(" bounds=\"$boundsStr\"")

        val childCount = node.childCount
        if (childCount == 0) {
            sb.append(" />\n")
        } else {
            sb.append(">\n")
            for (i in 0 until childCount) {
                val child = node.getChild(i) ?: continue
                dumpNode(child, sb, depth + 1)
                child.recycle()
            }
            sb.append(indent).append("</node>\n")
        }
    }

    /** indexInParent — API에 없으므로 부모 기준 추정 (fallback 0) */
    private fun AccessibilityNodeInfo.indexInParent(): Int {
        val p = parent ?: return 0
        for (i in 0 until p.childCount) {
            val c = p.getChild(i)
            val same = c?.hashCode() == this.hashCode()
            c?.recycle()
            if (same) { p.recycle(); return i }
        }
        p.recycle()
        return 0
    }

    private fun escXml(s: String): String =
        s.replace("&", "&amp;")
            .replace("\"", "&quot;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("'", "&apos;")
}
