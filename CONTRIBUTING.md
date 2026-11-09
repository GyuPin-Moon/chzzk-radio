# 개발 안내

## 폴더 구조

```
extension/        크롬에 로드하는 확장 프로그램 (배포 zip에는 이 폴더와 LICENSE만 들어감)
  manifest.json
  background.js   서비스 워커: 방송 상태 확인, 채팅 전송, 듣기 탭, 통나무
  pages/          팝업과 설정 페이지
  shared/         두 페이지가 같이 쓰는 카드, 팔로잉 목록, 스타일
  icons/
scripts/
  check.mjs       manifest 참조, 문법, 금지 패턴(innerHTML, eval 등) 검사
  build.sh        커밋된 extension/로 dist/에 zip과 SHA256SUMS.txt 생성
  release-notes.mjs  CHANGELOG.md에서 해당 버전의 릴리스 노트를 뽑음
docs/images/      README 스크린샷
```

## 로컬에서 실행

1. `chrome://extensions`에서 개발자 모드를 켜고 **압축해제된 확장 프로그램을 로드합니다**로 `extension/` 폴더를 고릅니다.
2. 코드를 고친 뒤 확장 프로그램 카드의 새로고침(↻)을 누르고, 열려 있는 팝업이나 설정 페이지도 다시 엽니다.
3. 커밋 전에 `node scripts/check.mjs`를 실행합니다.

외부 의존성과 빌드 단계는 없습니다. Node.js는 검사와 빌드 스크립트에만 씁니다.

## 브랜치

- `dev`: 개발 브랜치. 작업은 여기서 하거나, `dev`에서 딴 브랜치에서 하고 `dev`로 PR을 엽니다.
- `main`: 배포된 상태만 둡니다. `dev`에서 `main`으로 가는 PR로만 바뀌고, CI가 통과해야 합칠 수 있습니다.

커밋 메시지는 [Conventional Commits](https://www.conventionalcommits.org/) 형식(`feat:`, `fix:`, `docs:` …)을 따릅니다.

## 릴리스

1. `dev`에서 `extension/manifest.json`의 `version`을 올리고, `CHANGELOG.md`에 같은 버전의 섹션을 추가합니다.
2. `dev`에서 `main`으로 PR을 열고 CI가 통과하면 **merge commit**으로 합칩니다. squash로 합치면 `dev`와 `main`의 기록이 갈라집니다.
3. `main`에서 `vX.Y.Z` 태그를 만들어 푸시합니다.

   ```bash
   git switch main && git pull && git tag v0.1.1 && git push origin v0.1.1
   ```

4. Release 워크플로가 태그와 manifest 버전이 같은지 확인하고, zip과 체크섬, 빌드 출처 증명을 만들어 릴리스를 올립니다.

`v*` 태그와 릴리스는 한 번 올리면 수정하거나 지울 수 없습니다. 잘못 올렸다면 버전을 올려 새로 배포합니다.
