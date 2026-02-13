; NSIS uninstaller script to clean up user data
; This script is included in the NSIS installer

!macro customUnInstall
  ; Show confirmation dialog
  MessageBox MB_YESNO|MB_ICONQUESTION "프로그램 설정 파일과 캐시를 모두 삭제하시겠습니까?$\n$\n• API Key 설정$\n• 캐시 파일$\n• 로그 파일$\n$\n'아니오'를 선택하면 프로그램만 삭제됩니다." IDYES DeleteUserData IDNO SkipUserData

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

; Show info about remaining files if user chose to keep them
!macro customUnInstallCheck
  ; This runs before uninstall confirmation
!macroend
