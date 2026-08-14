package com.groundview.service

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * 최소 설정 화면 — 접근성 서비스 활성화 안내.
 * 활성화 후에는 이 앱을 열 필요 없이 HTTP 서버가 자동으로 동작한다.
 */
class SetupActivity : AppCompatActivity() {

    private lateinit var statusText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(64, 120, 64, 64)
        }

        val title = TextView(this).apply {
            text = "Appkium Inspector Service"
            textSize = 24f
            setTypeface(null, android.graphics.Typeface.BOLD)
        }
        layout.addView(title)

        val desc = TextView(this).apply {
            text = "\n접근성 서비스를 활성화하면 HTTP API(port ${GVAccessibilityService.HTTP_PORT})로\n" +
                    "화면의 UI 트리를 제공합니다.\n\n" +
                    "Compose 앱 포함 모든 접근성 노드를 지원합니다.\n"
            textSize = 14f
        }
        layout.addView(desc)

        statusText = TextView(this).apply {
            textSize = 16f
            setPadding(0, 24, 0, 24)
        }
        layout.addView(statusText)

        val btn = Button(this).apply {
            text = "접근성 설정 열기"
            setOnClickListener {
                startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            }
        }
        layout.addView(btn)

        val info = TextView(this).apply {
            text = "\n설정 → 접근성 → Appkium Inspector Service → 활성화\n\n" +
                    "활성화 후 연동:\n" +
                    "  adb forward tcp:9800 tcp:9800\n" +
                    "  curl http://127.0.0.1:9800/source"
            textSize = 12f
            setTypeface(null, android.graphics.Typeface.ITALIC)
        }
        layout.addView(info)

        setContentView(layout)
    }

    override fun onResume() {
        super.onResume()
        updateStatus()
    }

    private fun updateStatus() {
        if (GVAccessibilityService.isRunning()) {
            statusText.text = "✅ 서비스 활성화됨 (port ${GVAccessibilityService.HTTP_PORT})"
            statusText.setTextColor(0xFF2E7D32.toInt())
        } else {
            statusText.text = "❌ 서비스 비활성화 — 아래 버튼으로 활성화하세요"
            statusText.setTextColor(0xFFC62828.toInt())
        }
    }
}
