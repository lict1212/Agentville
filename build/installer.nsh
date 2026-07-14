; Custom NSIS hooks for the Agentville installer / uninstaller.
;
; customInstall runs after the files are copied. We persist the language the
; user picked in the installer's language selector so the app can adopt it as
; the default UI language on first launch (the renderer only applies it when
; the user hasn't chosen a language in-app yet — see app:getInstallerLanguage).
;
; Silent installs (auto-updater) skip the marker on purpose: $LANGUAGE is not
; a user choice there, and long-time users may run with the implicit default
; language (nothing in localStorage), which a stray marker could flip.
;
; customUnInstall runs while the app is being removed. We ask the user whether
; their personal Agentville data should be deleted as well.
;
; What "data" means here: only Agentville's own settings folder
;   %APPDATA%\Agentville   (electron-store config, window-bounds.json, custom sounds)
; It deliberately does NOT touch:
;   - Documents\Agentville  (real project files the user migrated there)
;   - %USERPROFILE%\.claude (shared with the Claude Code CLI)
;
; The MessageBox uses /SD IDNO, so during a silent uninstall triggered by the
; auto-updater the data is always KEPT (no prompt, safe default).

!macro customInstall
  IfSilent AgentvilleLangDone

  ; 2052 = zh_CN; every other selectable language falls back to English.
  StrCpy $1 "en"
  StrCmp $LANGUAGE "2052" 0 +2
    StrCpy $1 "zh"

  CreateDirectory "$APPDATA\${PRODUCT_NAME}"
  ClearErrors
  FileOpen $0 "$APPDATA\${PRODUCT_NAME}\installer-language.txt" w
  IfErrors AgentvilleLangDone
  FileWrite $0 $1
  FileClose $0

  AgentvilleLangDone:
!macroend

!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Do you also want to delete your Agentville settings and data?$\r$\n$\r$\nYes  -  remove settings, window layout and custom sounds.$\r$\nNo   -  keep them for a future reinstall.$\r$\n$\r$\nThis does NOT affect your projects in Documents\Agentville or your Claude Code files in the .claude folder." \
    /SD IDNO IDYES AgentvilleDeleteData IDNO AgentvilleKeepData

  AgentvilleDeleteData:
    RMDir /r "$APPDATA\${PRODUCT_NAME}"
    RMDir /r "$LOCALAPPDATA\${PRODUCT_NAME}"
    Goto AgentvilleDataDone

  AgentvilleKeepData:
  AgentvilleDataDone:
!macroend
