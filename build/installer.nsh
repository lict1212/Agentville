; Custom NSIS hooks for the Agentville installer / uninstaller.
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
