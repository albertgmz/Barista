; Copyright (C) 2026 Albert Gomez. SPDX-License-Identifier: GPL-3.0-only
!macro customInstall
  CreateShortCut "$SMPROGRAMS\Barista Station.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--station" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 SW_SHOWNORMAL "" "Launch Barista in Print Station mode"
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\Barista Station.lnk"
  ReadRegStr $0 HKCU "Software\Classes\.bar" ""
  ${If} $0 == "Barista Label"
    DeleteRegKey HKCU "Software\Classes\.bar"
  ${EndIf}
!macroend

!macro customUnInstallSection
  Section /o "Remove Barista settings and user data"
    RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
  SectionEnd
!macroend
