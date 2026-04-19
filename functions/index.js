const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

// (default) 데이터베이스 사용을 금지하기 위한 상수 정의
const DATABASE_ID = 'weberp';
 * 관리자 권한으로 사용자의 비밀번호를 초기화합니다.
 * 호출자는 반드시 'ADMIN' 권한을 가지고 있어야 합니다.
 */
exports.adminResetPassword = onCall(async (request) => {
  // 1. 인증 정보 확인
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "인증이 필요한 요청입니다."
    );
  }

  const { uid, password } = request.data;

  // 2. 입력 데이터 검증
  if (!uid || !password) {
    throw new HttpsError(
      "invalid-argument",
      "UID와 비밀번호가 누락되었습니다."
    );
  }

  try {
    // 3. 권한 및 소속 확인 (Firestore UserProfile 조회)
    const db = admin.firestore(DATABASE_ID);
    const callerRef = db.collection("UserProfile").doc(request.auth.uid);
    const targetRef = db.collection("UserProfile").doc(uid);
    
    const [callerSnap, targetSnap] = await Promise.all([callerRef.get(), targetRef.get()]);
    
    if (!callerSnap.exists) {
      throw new HttpsError("permission-denied", "호출자 정보를 찾을 수 없습니다.");
    }

    const callerData = callerSnap.data();
    
    // SUPER_ADMIN은 모든 권한 허용
    if (callerData.role === "SUPER_ADMIN") {
      console.log(`[AdminReset] SUPER_ADMIN ${request.auth.uid} is resetting password for ${uid}`);
    } else if (callerData.role === "ADMIN") {
      // 일반 ADMIN인 경우 소속 회사 확인
      if (!targetSnap.exists) {
        throw new HttpsError("not-found", "대상을 찾을 수 없습니다.");
      }
      
      const targetData = targetSnap.data();
      if (callerData.companyId !== targetData.companyId) {
        throw new HttpsError(
          "permission-denied",
          "타사 직원의 정보는 관리할 수 없습니다."
        );
      }
    } else {
      throw new HttpsError(
        "permission-denied",
        "비밀번호를 초기화할 권한이 없습니다."
      );
    }

    // 4. 비밀번호 강제 업데이트
    await admin.auth().updateUser(uid, { password });
    
    console.log(`[AdminReset] Password for user ${uid} reset by ${request.auth.uid} (Company: ${callerData.companyId})`);

    return { 
      success: true, 
      message: "비밀번호가 성공적으로 초기화되었습니다." 
    };
  } catch (error) {
    console.error(`[AdminResetError]`, error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error.message || "비밀번호 초기화 중 오류가 발생했습니다.");
  }
});

/**
 * 신규 직원의 인증 계정(Auth)과 프로필(Firestore)을 동시에 생성합니다.
 * 호출자는 반드시 'ADMIN' 또는 'SUPER_ADMIN' 권한을 가지고 있어야 합니다.
 */
exports.adminCreateMember = onCall(async (request) => {
  // 1. 인증 정보 확인
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "인증이 필요한 요청입니다.");
  }

  const { name, email, password, teamId, joinDate } = request.data;

  // 2. 필수 데이터 검증
  if (!name || !email || !password) {
    throw new HttpsError("invalid-argument", "이름, 아이디, 비밀번호는 필수 입력 항목입니다.");
  }

  try {
    const db = admin.firestore(DATABASE_ID);
    
    // 3. 호출자(관리자) 정보 및 권한 조회
    const callerSnap = await db.collection("UserProfile").doc(request.auth.uid).get();
    if (!callerSnap.exists) {
      throw new HttpsError("permission-denied", "관리자 정보를 찾을 수 없습니다.");
    }
    const callerData = callerSnap.data();

    if (callerData.role !== "ADMIN" && callerData.role !== "SUPER_ADMIN") {
      throw new HttpsError("permission-denied", "직원을 등록할 권한이 없습니다.");
    }

    // 4. Firebase Auth 계정 생성
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: name,
    });

    // 5. Firestore UserProfile 생성
    const companyId = callerData.role === "SUPER_ADMIN" ? "PLATFORM" : callerData.companyId;
    
    // 팀 소속 정보가 있다면 divisionId 조회
    let divisionId = "";
    if (teamId) {
      const teamSnap = await db.collection("teams").doc(teamId).get();
      if (teamSnap.exists) {
        divisionId = teamSnap.data().divisionId || "";
      }
    }

    const userData = {
      uid: userRecord.uid,
      email: email.toLowerCase().trim(),
      name: name.trim(),
      role: "MEMBER",
      companyId: companyId,
      teamId: teamId || "",
      divisionId: divisionId,
      teamHistory: [],
      joinDate: joinDate || new Date().toISOString().split('T')[0],
      mustChangePassword: true, // 로그인 후 비밀번호 변경 강제
      status: "ACTIVE",
      createdAt: new Date().toISOString()
    };

    await db.collection("UserProfile").doc(userRecord.uid).set(userData);

    console.log(`[AdminCreateMember] New member ${userRecord.uid} created by ${request.auth.uid} (Company: ${companyId})`);

    return {
      success: true,
      uid: userRecord.uid,
      message: "신규 직원 계정 및 프로필이 성공적으로 생성되었습니다."
    };

  } catch (error) {
    console.error(`[AdminCreateMemberError]`, error);
    if (error.code === 'auth/email-already-in-use') {
      throw new HttpsError("already-exists", "이미 등록된 이메일 주소입니다.");
    }
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error.message || "직원 등록 중 오류가 발생했습니다.");
  }
});
