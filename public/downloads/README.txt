이 폴더는 설정 > 연동 페이지의 다운로드 버튼이 참조하는 설치 파일 호스팅 위치입니다.

[ 필수 업로드 파일 ]
- KkeutPrintAgent_Setup_v1.0.0.exe
  → 빌드 방법: print-agent\installer\build.bat 실행
  → 빌드 후 print-agent\dist\ 에 생성되며, build.bat 가 이 폴더(frontend\public\downloads\)로
    자동 복사합니다.

[ 주의 ]
- 이 폴더의 파일은 Vite 빌드시 그대로 dist 에 복사되어 서비스됩니다.
- 설치 파일이 없으면 프론트엔드는 로그인 페이지 fallback 으로 빠집니다.
  (현재 링크 핸들러가 HEAD 체크 후 안내 alert 를 띄우도록 처리되어 있으나,
   근본적으로는 이 폴더에 .exe 가 있어야 정상 동작합니다.)
- 파일명을 바꾸려면 frontend/.env 에 다음 환경변수를 설정하세요:
    VITE_PRINT_AGENT_DOWNLOAD_URL=/downloads/<새파일명>.exe
