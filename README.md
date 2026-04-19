# Easy Works ERP 개발 및 배포 가이드 (gemini.md)

이 문서는 프로젝트의 빌드 환경 및 핵심 개발 정책을 명시하여 개발 시 항상 반영되도록 합니다.

## 1. 빌드 및 배포 환경
- **Node.js**: `v24` 이상 권장 (Node.js 24 런타임 네이티브 지원 및 GitHub Actions 최신 규격 준수)
- **PackageManager**: `npm`
- **Frontend Framework**: `React v18` + `Vite`
- **CI/CD**: GitHub Actions (Node.js 24 최적화 배포)

## 2. 데이터베이스 및 보안 (SaaS 아키텍처)
- **Firebase Database**: Firestore (**ID: `weberp`**, (default) 데이터베이스 사용 금지)
- **데이터베이스 정책**: 모든 코드에서 Firestore 초기화 시 반드시 `weberp` ID를 명시해야 합니다.
- **멀티테넌트 정책**: 모든 데이터 문서는 `companyId` 필드를 포함해야 하며, 모든 Firestore 쿼리는 반드시 이 필드를 통한 필터링을 포함해야 합니다.
- **Null Safety**: `useAuthStore`의 `userData` 접근 시 반드시 옵셔널 체이닝(`?.`) 또는 조기 반환(early return)을 사용하여 런타임 에러를 방지합니다.

## 3. 주요 환경 변수 (.env)
- `VITE_FIREBASE_DATABASE_ID=weberp`
- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN` 등 (GitHub Secrets에 등록됨)

## 4. 본 시스템은 단일 코드 베이스로 여러 기업을 서비스하는 
- **Multi-tenant SaaS 모델을 채택하고 있습니다. 모든 데이터는 companyId를 기준으로 물리적/논리적으로 격리되어 보안을 보장합니다.
- ** Frontend: React + TypeScript + Tailwind CSS + Zustand (상태 관리)
- ** Backend/DB: Firebase Auth (인증) + Firestore (DB ID: weberp)
- **Serverless Logic: Firebase Cloud Functions (비밀번호 강제 초기화 등 관리자 기능)

## 5. 권한별 접근 메뉴 (RBAC Matrix)

| 구분 | 메뉴명 | SUPER_ADMIN | ADMIN (Owner) | SUB_ADMIN | MEMBER |
| :--- | :--- | :---: | :---: | :---: | :---: |
| 플랫폼 | 플랫폼 관리 (기업 관리) | ✅ | ❌ | ❌ | ❌ |
| 공통 | 대시보드 | ❌ | ✅ | ✅ | ✅ |
| 공통 | 내 휴가 및 근태 | ❌ | ✅ | ✅ | ✅ |
| 공통 | 지출결의 신청 | ❌ | ✅ | ✅ | ✅ |
| 공통 | 공지사항 게시판 | ❌ | ✅ | ✅ | ✅ |
| 관리자 | 결재/승인 관리함 | ❌ | ✅ | ✅ | ❌ |
| 관리자 | 조직관리 | ❌ | ✅ | ❌ | ❌ |
| 관리자 | 급여 및 연봉 관리 | ❌ | ✅ | ❌ | ❌ |
| 관리자 | 지출결의 통합 조회 | ❌ | ✅ | ❌ | ❌ |
| 관리자 | 인사관리 (직원 등록/수정) | ❌ | ✅ | ❌ | ❌ |
| 관리자 | 시스템 설정 (도메인 등) | ❌ | ✅ | ❌ | ❌ |

> [!NOTE]
> - **SUPER_ADMIN**: 플랫폼 전체 관리. 특정 회사에 소속되지 않으며 플랫폼 관리 대시보드(`/super-admin`)만 접근합니다.
> - **SUB_ADMIN**: 팀 단위 관리자. 본인 소속 본부/팀의 결재 승인만 가능하며 인사/재무 데이터 접근은 차단됩니다.

---
*이 가이드는 시스템의 무결성과 안정적인 배포를 위해 반드시 준수되어야 합니다.*
