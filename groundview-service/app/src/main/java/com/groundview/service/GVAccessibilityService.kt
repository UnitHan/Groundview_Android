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

        // 순회 안전 상한 — 다중 윈도우 병합 시 병적으로 큰 트리로 인한 행/타임아웃 방지
        private const val MAX_DEPTH = 60
        private const val MAX_NODES = 12000

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
     * 모든 상호작용 윈도우의 접근성 트리를 순회하여 uiautomator dump 호환 XML을 생성한다.
     *
     * rootInActiveWindow 하나만 덤프하면 포커스된 메인 윈도우만 잡히고
     * 플로팅 팝업/다이얼로그/바텀시트(예: ChatGPT 첨부 모달)는 별도 윈도우라 누락된다.
     * FLAG_RETRIEVE_INTERACTIVE_WINDOWS 덕에 접근 가능한 windows 전체를 순회해
     * 메인 + 팝업 + 시스템 UI를 한 hierarchy에 병합한다.
     * (GroundView 파서는 <hierarchy> 직속 다중 <node> 루트를 지원함.)
     *
     * z-order(layer) 오름차순으로 정렬해 뒤쪽(팝업/최상단 오버레이)이 나중에 오도록 한다.
     * 우리 서비스 자체 오버레이 윈도우는 제외한다.
     */
    fun dumpToXml(): String {
        // Compose 지연 semantics 대비 — 첫 조회 시 통짜 노드로 잡히는 문제를 서버측에서 흡수.
        settleComposeIfNeeded()

        val sb = StringBuilder()
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
        sb.append("<hierarchy rotation=\"0\">\n")

        var dumpedAny = false
        // 전체 윈도우에 걸친 노드 예산 (한 번의 덤프 총량 상한)
        val budget = intArrayOf(MAX_NODES)

        val wins = try { windows } catch (e: Exception) { null }
        if (!wins.isNullOrEmpty()) {
            val sorted = wins.sortedBy { it.layer }
            for (window in sorted) {
                if (budget[0] <= 0) break
                val root = window.root ?: continue
                // 우리 서비스 자체 윈도우/오버레이는 제외 (자기 UI가 트리에 섞이지 않도록)
                if (root.packageName?.toString() == packageName) { root.recycle(); continue }
                dumpNode(root, sb, depth = 1, index = 0, budget = budget)
                root.recycle()
                dumpedAny = true
            }
        }

        // fallback: windows 접근 불가/비어있으면 rootInActiveWindow 하나만
        if (!dumpedAny) {
            val activeRoot = rootInActiveWindow
            if (activeRoot != null && activeRoot.packageName?.toString() != packageName) {
                dumpNode(activeRoot, sb, depth = 1, index = 0, budget = budget)
                activeRoot.recycle()
            } else {
                activeRoot?.recycle()
            }
        }

        sb.append("</hierarchy>\n")
        return sb.toString()
    }

    /**
     * Compose 지연 semantics 안정화.
     *
     * Jetpack Compose는 접근성 트리를 비동기(~100ms 주기)로 지연 생성한다.
     * 접근성 서비스가 화면을 처음 조회하면 semantics가 아직 안 올라와
     * ComposeView 하나가 화면 전체를 덮는 "통짜 노드"로만 잡힌다.
     * 조회를 한 번 하면 delegate가 활성화되므로, 통짜 상태가 감지되면
     * 짧게 대기 후 재확인하여 첫 캡처부터 완전한 트리가 나오도록 한다.
     *
     * Compose가 없는 화면은 대기하지 않는다(불필요한 지연 방지).
     */
    private fun settleComposeIfNeeded() {
        repeat(4) {
            if (!isComposeCollapsed()) return
            try { Thread.sleep(150) } catch (e: InterruptedException) { return }
        }
    }

    /**
     * 활성 윈도우가 "Compose 통짜" 상태인지 휴리스틱 판정.
     * ComposeView(또는 compose 클래스)가 존재하지만 의미 있는 노드
     * (text/content-desc/clickable)가 거의 없으면 semantics 미생성으로 간주.
     */
    private fun isComposeCollapsed(): Boolean {
        val root = rootInActiveWindow ?: return false
        var hasCompose = false
        var meaningful = 0
        var visited = 0
        val stack = ArrayDeque<AccessibilityNodeInfo>()
        stack.addLast(root)
        try {
            while (stack.isNotEmpty() && visited < 250) {
                val n = stack.removeLast()
                visited++
                val cn = n.className?.toString() ?: ""
                if (cn.contains("ComposeView") || cn.contains("compose", ignoreCase = true)) hasCompose = true
                if (!n.text.isNullOrEmpty() || !n.contentDescription.isNullOrEmpty() || n.isClickable) meaningful++
                val cc = n.childCount
                for (i in 0 until cc) {
                    n.getChild(i)?.let { stack.addLast(it) }
                }
                if (n !== root) n.recycle()
            }
        } catch (e: Exception) {
            // 조회 중 트리가 무효화될 수 있음 — 안전하게 미확정 처리
        } finally {
            while (stack.isNotEmpty()) { val n = stack.removeLast(); if (n !== root) n.recycle() }
            root.recycle()
        }
        return hasCompose && meaningful < 3
    }

    /**
     * AccessibilityNodeInfo를 uiautomator dump 호환 XML로 재귀 직렬화.
     * 속성명은 uiautomator dump와 동일하게 맞춰서 GroundView의 buildTree()가
     * 수정 없이 파싱할 수 있도록 한다.
     */
    private fun dumpNode(node: AccessibilityNodeInfo, sb: StringBuilder, depth: Int, index: Int, budget: IntArray) {
        if (budget[0] <= 0) return
        budget[0]--

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
        sb.append(" index=\"$index\"")
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
        // 깊이 상한 초과 또는 자식 없음 → self-close (깊이 초과 시 하위 트리는 절단)
        if (childCount == 0 || depth >= MAX_DEPTH) {
            sb.append(" />\n")
        } else {
            sb.append(">\n")
            for (i in 0 until childCount) {
                if (budget[0] <= 0) break
                val child = node.getChild(i) ?: continue
                dumpNode(child, sb, depth + 1, index = i, budget = budget)
                child.recycle()
            }
            sb.append(indent).append("</node>\n")
        }
    }

    private fun escXml(s: String): String =
        s.replace("&", "&amp;")
            .replace("\"", "&quot;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("'", "&apos;")
}
