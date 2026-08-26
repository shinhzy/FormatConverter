# FormatDrop

설치와 서버 없이 브라우저 안에서 동작하는 이미지 포맷 변환기입니다.

## 실행

`index.html`을 브라우저로 열면 바로 사용할 수 있습니다. 로컬 서버를 사용하려면 이 폴더에서 다음 명령을 실행하세요.

```powershell
python -m http.server 4173
```

그 후 `http://localhost:4173`을 엽니다.

## 지원 포맷

- 입력: SVG, PNG, JPG/JPEG, WebP, GIF, BMP, AVIF (브라우저 디코더 지원 범위)
- 출력: PNG, JPG, WebP
- 일괄 변환, 1~4배 해상도, JPG/WebP 품질 설정, JPG 배경색 설정
- SVG의 `1×`는 선명도를 위해 SVG 논리 크기의 4배 픽셀로 출력됩니다. 따라서 새 `1×`는 이전 버전의 `4×`와 같은 출력 크기입니다.

이미지 처리는 Canvas API로 수행되며 파일은 외부 서버로 전송되지 않습니다. 애니메이션 GIF/WebP는 첫 프레임만 변환됩니다.
