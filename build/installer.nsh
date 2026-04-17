; NSIS installer customization script
; Adds custom pages and enhanced installation experience

!include "MUI2.nsh"
!include "FileFunc.nsh"

; Custom pages
!macro customWelcomePage
  ; Welcome page with description
  !define MUI_WELCOMEPAGE_TITLE "GroundView 설치 마법사에 오신 것을 환영합니다"
  !define MUI_WELCOMEPAGE_TITLE_3LINES
  !define MUI_WELCOMEPAGE_TEXT "이 마법사는 GroundView를 설치하도록 안내합니다.$\r$\n$\r$\nGroundView는 AI 기반 모바일 테스트 자동화 도우미로, Appium 로케이터 생성과 오프라인 분석을 지원합니다.$\r$\n$\r$\n계속하려면 [다음]을 클릭하세요."
!macroend

!macro customInstallPage
  ; Custom installation progress messages
  DetailPrint "GroundView 설치 중..."
  DetailPrint ""
  DetailPrint "설치 정보:"
  DetailPrint "• 프로그램: $INSTDIR"
  DetailPrint "• 사용자 데이터: $APPDATA\GroundView"
  DetailPrint "• Python 패키지는 첫 실행 시 자동 설치됩니다"
!macroend

; Custom header text for installer
!macro customHeader
  !define MUI_HEADERIMAGE
  !define MUI_HEADERIMAGE_RIGHT
  !define MUI_HEADERIMAGE_BITMAP "${NSISDIR}\Contrib\Graphics\Header\nsis3-grey.bmp"
  !define MUI_HEADERIMAGE_UNBITMAP "${NSISDIR}\Contrib\Graphics\Header\nsis3-grey.bmp"
  
  ; Installer window title
  !define MUI_TEXT_WELCOME_INFO_TITLE "GroundView 설치 마법사"
  !define MUI_TEXT_WELCOME_INFO_TEXT "이 프로그램은 GroundView ${VERSION}를 설치합니다.$\r$\n$\r$\nGroundView는 Appium 테스트 자동화를 위한 AI 기반 로케이터 생성 도구입니다.$\r$\n$\r$\n시스템 요구사항:$\r$\n• Windows 10/11 (64비트)$\r$\n• 4GB RAM 이상 권장$\r$\n• 700MB 디스크 공간$\r$\n$\r$\n계속하려면 [다음]을 클릭하세요."
!macroend

; Custom installation type page
!macro customInstallMode
  ; Directory page description
  !define MUI_DIRECTORYPAGE_TEXT_TOP "GroundView를 설치할 폴더를 선택하세요.$\r$\n$\r$\n기본 경로: $INSTDIR$\r$\n필요한 공간: 약 700MB"
  !define MUI_DIRECTORYPAGE_TEXT_DESTINATION "대상 폴더"
!macroend

; Pre-install checks
!macro preInstall
  ; Check if already installed
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}" "UninstallString"
  ${If} $0 != ""
    MessageBox MB_YESNO|MB_ICONQUESTION "GroundView가 이미 설치되어 있습니다.$\r$\n$\r$\n기존 버전을 제거하고 계속하시겠습니까?$\r$\n$\r$\n설정 파일은 보존됩니다." IDYES Uninstall IDNO Cancel
    
    Uninstall:
      ; Run uninstaller
      ExecWait '"$0" /S _?=$INSTDIR'
      Delete "$0"
      RMDir /r "$INSTDIR"
      Goto Continue
      
    Cancel:
      Abort "설치가 취소되었습니다."
      
    Continue:
  ${EndIf}
  
  ; Python is bundled in resources/python-bundle — no system Python required.
  ; Skipping Python check.
!macroend

; Post-install actions
!macro postInstall
  ; Create additional registry keys
  WriteRegStr HKCU "Software\GroundView" "InstallPath" "$INSTDIR"
  WriteRegStr HKCU "Software\GroundView" "Version" "${VERSION}"
  
  ; Create quick launch shortcut
  CreateShortcut "$QUICKLAUNCH\GroundView.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  
  DetailPrint ""
  DetailPrint "설치가 완료되었습니다!"
  DetailPrint ""
  DetailPrint "다음 단계:"
  DetailPrint "1. GroundView를 실행하세요"
  DetailPrint "2. Settings에서 Gemini API Key를 등록하세요"
  DetailPrint "3. ADB 경로를 설정하고 디바이스를 연결하세요"
  DetailPrint "   (ADB는 Android SDK Platform Tools에 포함되어 있습니다)"
!macroend

; Custom installer init
!macro customInit
  ; Installer init
  SetShellVarContext current
!macroend

; ============================================
; UNINSTALLER CUSTOMIZATION
; ============================================

; NSIS uninstaller script to clean up user data
!macro customUnInstall
  ; Kill running GroundView process if exists (silently)
  DetailPrint "실행 중인 GroundView 프로세스를 확인하는 중..."
  
  ; Try to kill process silently - if not running, command will fail harmlessly
  nsExec::ExecToStack 'taskkill /F /IM GroundView.exe 2>nul'
  Pop $0
  Pop $1
  
  ; Only show message if process was actually killed (exitcode 0 and output contains SUCCESS)
  ${If} $0 == 0
    StrCpy $2 $1 7  ; Get first 7 chars
    ${If} $2 == "SUCCESS"
      DetailPrint "실행 중인 프로세스를 종료했습니다."
      Sleep 1000
    ${EndIf}
  ${EndIf}
  
  ; Show confirmation dialog for user data deletion
  MessageBox MB_YESNO|MB_ICONQUESTION "프로그램 설정 파일과 캐시를 모두 삭제하시겠습니까?$\r$\n$\r$\n• API Key 설정$\r$\n• 캐시 파일$\r$\n• 로그 파일$\r$\n$\r$\n'아니오'를 선택하면 프로그램만 삭제됩니다." IDYES DeleteUserData IDNO SkipUserData

  DeleteUserData:
    ; Delete AppData\Roaming\GroundView
    RMDir /r "$APPDATA\GroundView"
    
    ; Delete AppData\Local\GroundView
    RMDir /r "$LOCALAPPDATA\GroundView"
    
    ; Delete PaddleOCR cache (if exists)
    RMDir /r "$PROFILE\.paddleocr"
    
    DetailPrint "사용자 데이터가 삭제되었습니다."
    Goto Done

  SkipUserData:
    DetailPrint "프로그램 파일만 삭제되었습니다."
    DetailPrint "설정 파일 위치: $APPDATA\GroundView"
    
  Done:
!macroend
