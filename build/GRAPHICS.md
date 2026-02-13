# Installer Graphics Guide

NSIS 인스톨러를 위한 그래픽 파일을 생성해야 합니다.

## 📐 필요한 이미지

### 1. installerHeader.bmp
- **크기**: 150 x 57 픽셀
- **포맷**: BMP (24-bit)
- **용도**: 인스톨러 상단 헤더
- **내용**: GroundView 로고 + 타이틀
- **배경**: 그라디언트 또는 단색 (#2563eb → #1e3a8a)

### 2. installerSidebar.bmp
- **크기**: 164 x 314 픽셀
- **포맷**: BMP (24-bit)
- **용도**: 인스톨러 왼쪽 사이드바
- **내용**: 수직 배너 (로고 + 버전 + 설명)
- **배경**: 그라디언트 또는 이미지

## 🎨 디자인 가이드라인

### 색상 팔레트
```
Primary Blue:   #2563eb
Dark Blue:      #1e3a8a
Light Blue:     #60a5fa
Gray:           #6b7280
White:          #ffffff
```

### 폰트
- **제목**: Inter Bold / Segoe UI Bold
- **부제**: Inter Regular / Segoe UI Regular
- **크기**: 헤더 14-16pt, 사이드바 12-14pt

## 🛠️ 제작 도구

### 무료 도구
1. **GIMP** (https://www.gimp.org/)
   - 전문가 수준 이미지 편집
   
2. **Paint.NET** (https://www.getpaint.net/)
   - 간단하고 빠른 편집

3. **Photopea** (https://www.photopea.com/)
   - 온라인 Photoshop 대체

### 템플릿
```
installerHeader.bmp:
┌─────────────────────────────────────┐
│  🔍 GroundView                      │ 150x57
│  AI-Powered Mobile Test Automation  │
└─────────────────────────────────────┘

installerSidebar.bmp:
┌─────────────┐
│             │
│     🔍      │
│ GroundView  │
│             │
│   v0.0.5    │ 164x314
│             │
│ AI Locator  │
│  Generator  │
│             │
└─────────────┘
```

## 📝 빠른 생성 (임시용)

이미지가 없으면 인스톨러는 기본 NSIS 그래픽을 사용합니다.

### PowerShell로 단색 BMP 생성 (테스트용)
```powershell
# 간단한 단색 헤더 생성
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap(150, 57)
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(37, 99, 235))
$graphics.FillRectangle($brush, 0, 0, 150, 57)
$bmp.Save("$PSScriptRoot\installerHeader.bmp", [System.Drawing.Imaging.ImageFormat]::Bmp)

# 사이드바 생성
$bmp2 = New-Object System.Drawing.Bitmap(164, 314)
$graphics2 = [System.Drawing.Graphics]::FromImage($bmp2)
$graphics2.FillRectangle($brush, 0, 0, 164, 314)
$bmp2.Save("$PSScriptRoot\installerSidebar.bmp", [System.Drawing.Imaging.ImageFormat]::Bmp)

Write-Host "임시 그래픽 파일이 생성되었습니다." -ForegroundColor Green
```

## ✅ 체크리스트

- [ ] installerHeader.bmp 생성 (150x57)
- [ ] installerSidebar.bmp 생성 (164x314)
- [ ] 파일을 `build/` 폴더에 배치
- [ ] BMP 포맷 확인 (24-bit)
- [ ] 크기 확인
- [ ] `npm run dist` 테스트

## 🔄 대체 방안

그래픽 파일 없이 빌드하려면 `package.json`에서 다음 라인 제거:
```json
"installerHeader": "build/installerHeader.bmp",
"installerSidebar": "build/installerSidebar.bmp",
"uninstallerSidebar": "build/installerSidebar.bmp",
```
