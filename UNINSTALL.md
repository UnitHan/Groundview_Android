# GroundView 완전 제거 가이드

## 🗑️ 윈도우에서 완전히 삭제하기

GroundView를 제거해도 일부 파일이 남아있을 수 있습니다. 완전히 삭제하려면 아래 단계를 따르세요.

### 1️⃣ 프로그램 제거

**방법 A: 설정에서 제거**
```
설정 > 앱 > 설치된 앱 > GroundView > 제거
```

**방법 B: 제어판에서 제거**
```
제어판 > 프로그램 및 기능 > GroundView > 제거
```

### 2️⃣ 사용자 데이터 수동 삭제

제거 시 대화상자에서 "예"를 선택하면 자동으로 삭제되지만, 그렇지 않은 경우 아래 폴더들을 수동으로 삭제하세요:

#### 📂 삭제할 폴더 목록

```batch
# 1. 앱 설정 및 데이터 (API Key, 로그 등)
%APPDATA%\GroundView

# 2. 캐시 및 임시 파일
%LOCALAPPDATA%\GroundView

# 3. PaddleOCR 모델 캐시 (선택사항)
%USERPROFILE%\.paddleocr
```

#### 🖥️ 실제 경로 예시

```
C:\Users\[사용자명]\AppData\Roaming\GroundView
C:\Users\[사용자명]\AppData\Local\GroundView
C:\Users\[사용자명]\.paddleocr
```

### 3️⃣ 빠른 삭제 스크립트

**PowerShell로 한 번에 삭제** (관리자 권한 불필요)

```powershell
# PowerShell 관리자 모드에서 실행
Remove-Item -Path "$env:APPDATA\GroundView" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$env:LOCALAPPDATA\GroundView" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$env:USERPROFILE\.paddleocr" -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "GroundView 데이터가 삭제되었습니다." -ForegroundColor Green
```

**배치 파일로 삭제**

위 스크립트를 `clean_groundview.bat` 파일로 저장하고 실행하세요.

---

## 📝 저장되는 데이터 상세

### 보존되는 데이터

| 폴더 | 내용 | 크기 |
|------|------|------|
| `%APPDATA%\GroundView\` | • settings.json (API Key 암호화)<br>• groundview.log<br>• 앱 설정 | ~100KB |
| `%LOCALAPPDATA%\GroundView\` | • GPU 캐시<br>• IndexedDB<br>• 임시 파일 | ~10MB |
| `%USERPROFILE%\.paddleocr\` | • OCR 모델 파일<br>• 추론 캐시 | ~50-200MB |

### 삭제되는 데이터

- **프로그램 파일**: `C:\Program Files\GroundView\` (자동 삭제)
- **바로가기**: 시작 메뉴, 바탕화면 (자동 삭제)

---

## ⚠️ 주의사항

### 🔐 API Key 백업
삭제 전에 Gemini API Key를 별도로 저장해두세요:
```
설정 > API Key > 복사
```

### 📦 ZIP 파일 백업
저장한 캡처 ZIP 파일들을 백업하세요.

### 🔄 재설치 시
재설치 후에는 API Key를 다시 입력해야 합니다.

---

## 🐧 Linux/macOS에서 제거

### Linux
```bash
# 프로그램 제거
sudo apt remove groundview  # 또는 dpkg -r groundview

# 사용자 데이터 삭제
rm -rf ~/.config/GroundView
rm -rf ~/.cache/GroundView
rm -rf ~/.paddleocr
```

### macOS
```bash
# 프로그램 제거
rm -rf /Applications/GroundView.app

# 사용자 데이터 삭제
rm -rf ~/Library/Application\ Support/GroundView
rm -rf ~/Library/Caches/GroundView
rm -rf ~/Library/Logs/GroundView
rm -rf ~/.paddleocr
```

---

## 📞 문제 해결

- **삭제 실패**: 앱이 실행 중인지 확인하고 종료 후 재시도
- **권한 오류**: PowerShell/CMD를 관리자 권한으로 실행
- **폴더가 보이지 않음**: 파일 탐색기에서 "숨김 항목" 표시 활성화

---

<div align="center">
  <sub>완전 제거 후에도 언제든 다시 설치할 수 있습니다! 😊</sub>
</div>
