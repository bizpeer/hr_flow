# 프로젝트 작업 지침

- 현재 상태: 1차 개발 완료. 이후 작업은 기존 기능을 기반으로 한 추가 개발 단계이다.
- 서비스 웹 배포 대상은 Cloudflare다. Cloudflare의 프로젝트명과 배포 연결 방식은 저장소에 아직 명시되어 있지 않으므로 확인 후 설정한다.
- Firebase Authentication, Firestore, Storage, Cloud Functions는 애플리케이션의 백엔드 서비스로 사용한다. 웹 배포와 Firebase 리소스 배포를 구분한다.
- 기존 `npm run deploy`는 Firebase Hosting을 포함하는 레거시 명령이다. Cloudflare 웹 배포 명령으로 사용하지 않는다.
- `.github/workflows/deploy.yml`의 Firebase Hosting 및 GitHub Pages 배포는 레거시 수동 워크플로다. 새 웹 배포 자동화는 Cloudflare 설정이 확인된 뒤 구성한다.
- GitHub 접근 토큰은 로컬 `.env.local`에 있다. 향후 `git push`가 필요할 때만 안전하게 사용하고, 값은 출력하거나 커밋하거나 문서에 기록하지 않는다. Git은 `.env.local`을 자동으로 읽지 않는다.
- `.env.local`은 Git 추적 대상에서 제외한다. 배포용 자격 증명은 로컬 파일과 별도로 해당 배포 환경의 비밀 변수에 설정한다.
