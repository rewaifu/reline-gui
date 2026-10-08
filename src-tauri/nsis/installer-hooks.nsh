; Removes the heavy Python workspace (git clone + .venv with torch/reline) and
; the app-managed uv download on a real uninstall. Logs and the rest of the data
; directory are kept.
;
; Tauri's installer runs this uninstaller with "_?=<installdir>" (and sometimes
; /UPDATE) whenever it upgrades or reinstalls the app. That must not wipe the
; user's dependencies, so only delete when neither signal is present.
!macro NSIS_HOOK_PREUNINSTALL
  ${GetOptions} $CMDLINE "_?=" $R0
  ${If} ${Errors}
  ${AndIf} $UpdateMode <> 1
    RMDir /r "$LOCALAPPDATA\reline-configurator\reline_ws"
    RMDir /r "$LOCALAPPDATA\reline-configurator\uv_bin"
  ${EndIf}
!macroend
