# HR FLOW 개발 및 배포 가이드 (gemini.md)

이 문서는 프로젝트의 빌드 환경 및 핵심 개발 정책을 명시하여 개발 시 항상 반영되도록 합니다.

## 1. 빌드 및 배포 환경
- **Node.js**: `v22` 이상 필수 (GitHub Actions `deploy.yml`과 일치)
- **PackageManager**: `npm`
- **Frontend Framework**: `React v18` + `Vite`
- **CI/CD**: GitHub Actions (GitHub Pages 배포)

## 2. 데이터베이스 및 보안 (SaaS 아키텍처)
- **Firebase Database**: Firestore (Database ID: `weberp`)
- **멀티테넌트 정책**: 모든 데이터 문서는 `companyId` 필드를 포함해야 하며, 모든 Firestore 쿼리는 반드시 이 필드를 통한 필터링을 포함해야 합니다.
- **Null Safety**: `useAuthStore`의 `userData` 접근 시 반드시 옵셔널 체이닝(`?.`) 또는 조기 반환(early return)을 사용하여 런타임 에러를 방지합니다.

## 3. 주요 환경 변수 (.env)
- `VITE_FIREBASE_DATABASE_ID=weberp`
- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN` 등 (GitHub Secrets에 등록됨)

---
*이 가이드는 시스템의 무결성과 안정적인 배포를 위해 반드시 준수되어야 합니다.*
