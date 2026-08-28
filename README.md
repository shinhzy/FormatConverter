# FormatDrop

파일을 서버로 업로드하지 않고 브라우저 안에서 이미지와 PDF를 상호 변환하는 도구입니다.

## 실행

### Windows 릴리스

`release/FormatDrop-1.0.0.exe`를 더블클릭하면 내장 로컬 서버와 기본 브라우저가 자동으로 실행됩니다. Python이나 별도의 설치가 필요하지 않습니다. 배포용 압축 파일과 SHA256 체크섬도 `release` 폴더에서 확인할 수 있습니다.

### 소스에서 실행

이미지 변환은 `index.html`을 직접 열어도 사용할 수 있습니다. PDF 변환은 브라우저의 로컬 파일 보안 제한을 피하기 위해 이 폴더에서 로컬 서버를 실행하는 방식을 권장합니다.

```powershell
python -m http.server 4173
```

그 후 `http://localhost:4173`을 엽니다.

## 지원 기능

- 입력: PDF, SVG, PNG, JPG/JPEG, WebP, GIF, BMP, AVIF (브라우저 디코더 지원 범위)
- 이미지 출력: PNG, JPG, WebP
- PDF → 이미지: 모든 페이지를 개별 이미지로 변환하고 페이지별 또는 ZIP으로 다운로드
- 이미지 → PDF: 여러 이미지를 목록 순서대로 하나의 다중 페이지 PDF로 생성
- 목록의 위/아래 버튼으로 PDF 페이지 순서 변경
- 이미지 일괄 변환, 1~4배 해상도, JPG/WebP/PDF 품질 설정, JPG/PDF 배경색 설정
- SVG의 `1×`는 선명도를 위해 SVG 논리 크기의 4배 픽셀로 출력
- PDF의 `1×`는 144 DPI로 출력

모든 파일 처리는 브라우저 안에서 수행되며 원본 파일은 외부 서버로 전송되지 않습니다. 애니메이션 GIF/WebP는 첫 프레임만 변환됩니다.

## 포함된 라이브러리

- PDF.js 6.1.200 (Apache-2.0)
- jsPDF 4.2.1 (MIT)
- JSZip 3.10.1 (MIT 또는 GPL-3.0)

각 라이선스 전문은 `vendor` 하위 폴더에 포함되어 있습니다.

## 릴리스 빌드

Windows PowerShell에서 다음 명령을 실행합니다.

```powershell
.\build_release.ps1
```

빌드 스크립트는 웹 파일을 실행 파일 안에 포함하고, 실행 파일 자체 점검, 압축 배포본 생성, SHA256 체크섬 생성을 수행합니다.
