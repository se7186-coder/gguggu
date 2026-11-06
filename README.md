# 체크리스트 (GitHub Pages + GitHub 저장)

GitHub Pages로 여는 체크리스트 사이트입니다. 서버가 따로 없습니다.

- **이 저장소(공개)**: 사이트 코드만 있습니다. 목록 내용은 없습니다.
- **데이터 저장소(비공개)**: 목록과 체크 상태가 `data.json` 한 파일에 저장됩니다.
- 각 기기에서 처음 한 번 **데이터 저장소 이름**과 **GitHub 토큰**을 넣으면, 그 기기 브라우저(localStorage)에만 저장됩니다.
- 체크나 편집을 하면 데이터 저장소에 커밋이 하나씩 생깁니다. 다른 기기의 변경은 30초마다, 또는 페이지로 돌아올 때 반영됩니다.

> 아래 GitHub 메뉴 이름과 토큰 권한 이름은 작성 시점에 GitHub 문서로 확인하지 못했습니다. 화면과 다르면 비슷한 메뉴를 찾아 주세요.

## 1. 사이트 켜기 (GitHub Pages)
이 저장소 **Settings → Pages → Build and deployment**
- Source: **Deploy from a branch**
- Branch: **main**, 폴더 **/docs** → Save

몇 분 뒤 `https://<아이디>.github.io/<저장소이름>/` 주소로 열립니다.

## 2. 데이터 저장소 만들기
**비공개(Private)** 저장소를 하나 만들고, 맨 위에 `data.json`을 둡니다. 최소 형식은 다음과 같습니다.

```json
{ "title": "체크리스트", "owners": { "m": "담당자1", "s": "담당자2" }, "sections": [], "checks": {} }
```

## 3. 토큰 만들기
GitHub **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
- Repository access: **Only select repositories** → 데이터 저장소 **하나만** 선택
- Permissions → Repository permissions → **Contents: Read and write**
- 만료일은 필요한 기간에 맞게 정합니다.

이 토큰으로는 선택한 데이터 저장소만 읽고 쓸 수 있습니다. 토큰은 비밀번호처럼 다뤄 주세요.

## 4. 사이트에서 연결
사이트를 열고 **데이터 저장소**(`아이디/저장소이름`)와 **토큰**을 넣은 뒤 **연결하기**를 누릅니다.
다른 기기에서도 같은 정보를 한 번씩 넣으면 됩니다.
상단의 **연결 설정**을 누르면 그 기기에 저장된 토큰이 지워집니다.

## 코드 수정
`src/app.js`를 고친 뒤 다시 빌드합니다. 결과는 `docs/app.js`에 만들어집니다.

```bash
npm install && npm run build
```
