# 회사별 공문 작성·결재·PDF 발행

## 사용 순서

1. 회사 최고관리자 **ADMIN**이 `공문 관리 → 회사 공문 템플릿`에서 회사명·주소·대표자·로고·인감을 등록합니다. 이미지 형식은 PNG/JPEG, 최대 300KB·4096px입니다. 전화·이메일도 함께 보관합니다.
2. 최초 등록 때 마지막으로 발행한 문서번호의 앞·뒤 숫자를 입력합니다. 처음 발행하는 회사는 둘 다 `000`입니다.
3. 조직관리에서 팀장(`teams.leaderId`)과 본부장(`divisions.headId`)을 지정합니다. 작성자 소속의 팀장·본부장이 순서대로 결재라인에 자동 배정됩니다. 겸직자는 한 번만 배정하고, 작성자 본인과 ADMIN은 중간 결재에서 제외합니다. ADMIN은 항상 최종 승인자입니다.
4. 모든 회사 사용자가 수신·참조·제목·본문·붙임 목록을 작성하고 저장한 뒤 결재를 요청할 수 있습니다. 결재자는 순서대로 승인하거나 사유를 기입하여 반려합니다.
5. 회사 ADMIN이 최종 승인할 때 발행일과 번호를 확정합니다. 승인된 현재 개정본만 PDF 다운로드·열기·인쇄가 가능합니다. 작성본 미리보기에는 인감을 표시하지 않으며 브라우저 인쇄도 숨깁니다.
6. 발행 전 내용은 작성자·지정 결재자·회사 ADMIN이 수정할 수 있습니다. 한 번 발행된 공문은 회사 ADMIN만 수정할 수 있습니다. 저장할 때 수정 전 내용을 보관하고 새 개정번호를 부여하며 모든 결재를 초기화합니다.
7. 수정 전 보관본은 ADMIN 전용 보관함에서 확인·영구 삭제합니다. 삭제하더라도 이미 발행한 번호의 예약은 유지합니다.

플랫폼 `SUPER_ADMIN`은 회사 공문 승인자가 아닙니다. 공문 목록·내용·PDF에 대한 접근은 같은 회사의 작성자와 지정 결재자, 회사 ADMIN에게만 허용합니다.

## 번호 규칙

- 예: `001-261023-025`, 날짜 표기 `2026년 10월 23일`.
- **앞·뒤 세 자리 모두 새 발행마다 증가**합니다. 날짜나 연도가 바뀌어도 카운터를 초기화하지 않습니다. 수정본의 재발행도 새 번호를 받습니다.
- 최초 시작점은 회사 템플릿에 한 번 등록합니다. ADMIN은 최종 승인 창에서 앞·뒤 번호와 발행일을 직접 지정할 수 있습니다.
- 자동 번호는 각 숫자의 마지막 최대 발행값 다음부터 부여합니다. 수동으로 작은 번호를 지정해도 자동 카운터를 낮추지 않습니다. 같은 회사의 동일한 전체 문서번호는 재사용할 수 없습니다.
- 999를 초과하면 자동 발행을 중단합니다. ADMIN이 사용하지 않은 번호를 직접 지정해야 합니다. 네 자리 번호나 연도별 초기화가 필요하면 정책을 확장해야 합니다.
- 기본 발행일은 서버 시간대를 따르지 않고 `Asia/Seoul`로 계산합니다. 화면의 예상 번호는 확정 번호가 아니며, 최종 승인 시 Firestore 트랜잭션에서 원자적으로 확정합니다.

## 저장·보안 구조

- `officialLetters`: 현재 내용·개정·상태·작성자·결재라인·최종 승인 정보.
- `officialLetters/{id}/history`: 수정 전 전체 스냅샷. 클라이언트의 직접 덮어쓰기·삭제를 허용하지 않습니다.
- `officialLetterSettings`: 회사 템플릿과 카운터·설정 버전.
- `officialLetterNumbers`: 회사별 번호 중복 방지 예약. 보관본 삭제와 별도로 유지합니다.
- Storage `companies/{companyId}/official-assets/{sha256}.{png|jpg}`: 로고·인감의 변경 불가능한 콘텐츠 주소. 공개 다운로드 URL을 발급하지 않습니다.
- 모든 공문 API는 `manageOfficialLetters` callable 하나로 처리합니다. 인증 프로필의 현재 역할·활성 상태·회사 소속을 서버에서 확인하고, 브라우저의 역할 값과 작성자·결재자 주장을 신뢰하지 않습니다.
- Firestore·Storage 보안규칙은 공문 경로의 모든 클라이언트 직접 접근을 차단합니다. 기존 SUPER_ADMIN wildcard에서도 해당 경로를 제외합니다.
- 결재 요청 당시 회사명·주소·대표자·로고·인감 경로를 고정합니다. 이후 회사 템플릿을 변경해도 해당 결재본과 발행 PDF는 바뀌지 않습니다. ADMIN 최종 승인 화면은 요청 당시의 인감을 표시합니다.
- 동시 수정은 개정번호로, 회사 템플릿 저장은 설정 버전으로 충돌을 검사합니다. 수정·중간 승인·최종 승인·번호 예약은 서버 트랜잭션으로 처리합니다.
- PDF는 저장된 승인 스냅샷과 Noto Sans KR 글꼴을 사용해 서버에서 생성합니다. 생성 후에도 현재 개정·승인·사용자 권한을 다시 검사합니다. 원본 인감 데이터는 ADMIN에게만 반환합니다.
- 본문은 일반 텍스트와 줄바꿈을 지원하며, HTML을 실행하지 않습니다. 긴 본문은 A4 여러 페이지로 나누고 각 페이지에 문서번호·개정·페이지 번호를 표시합니다.

## 검증

Node.js 24 기준입니다. 테스트는 `FIRESTORE_EMULATOR_HOST`가 없으면 실행을 거부하므로 운영 DB를 대상으로 실행할 수 없습니다.

```powershell
npm --prefix client run build
npx firebase-tools emulators:exec --only firestore,storage --config firebase.security-test.json --project demo-hr-flow "npm run test:official-letters && npm run test:rules"
npm --prefix client run test:payroll
npm --prefix functions audit --omit=dev
```

공문 테스트는 실제 Firestore 에뮬레이터의 트랜잭션을 사용하고 Storage만 메모리 대역으로 처리합니다. 보안규칙 테스트는 실제 Firestore·Storage 에뮬레이터를 사용합니다. 공문 테스트는 동시 번호 발행, 번호 수동 지정·중복·소진, 결재 순서, 회사 간 접근, 발행본 수정·재승인, 보관본 삭제, 템플릿 고정, PDF 생성 중 권한 취소, 한글 PDF 페이지 나눔을 검사합니다.

한글 글꼴은 `functions/fonts/`에 포함하며 OFL 라이선스를 함께 보관합니다. PDFKit 공식 문서: <https://pdfkit.org/docs/text.html>. 번호 발행 트랜잭션 원칙: <https://firebase.google.com/docs/firestore/manage-data/transactions>.

## 운영 반영

웹은 GitHub main 푸시로 Cloudflare Pages가 배포합니다. **Firebase 백엔드는 별도 배포가 필요**합니다. 아래 명령은 Firebase Hosting이나 기존 다른 Functions를 배포하지 않습니다. 운영 Firebase 배포는 담당자의 명시적 승인을 받고 실행합니다.

```powershell
npx firebase-tools deploy --only functions:manageOfficialLetters,firestore:rules,firestore:indexes,storage --project weberp-8f25f
```

`firestore.indexes.json`에는 확인 당시 운영 중인 attendance 인덱스와 새 공문 인덱스를 포함합니다. 운영에서 수동 추가한 인덱스가 있다면 배포 전에 목록을 대조하여 보존해야 합니다. 공문 인덱스의 준비 완료 후 실제 회사 테스트 계정으로 작성자 → 팀장 → 본부장 → ADMIN → PDF 발행을 한 번 확인합니다.

후속 서비스 개발 단계는 결재 알림·공문함 페이지 단위 조회, 신규 네 자리 번호 정책, 보관 기간·미사용 인감 자산 정리 정책의 순서로 권장합니다. 이 작업은 해당 후속 기능을 변경하지 않습니다.
