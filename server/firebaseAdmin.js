"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminAuth = exports.adminDb = void 0;
const admin = __importStar(require("firebase-admin"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
// 서비스 계정 키 파일 경로 (상대 경로 또는 환경 변수)
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path_1.default.join(__dirname, 'serviceAccount.json');
try {
    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath),
        });
        console.log('Firebase Admin SDK initialized successfully.');
    }
}
catch (error) {
    console.error('Failed to initialize Firebase Admin SDK:', error);
    // 서비스 계정 키가 없는 경우에도 서버가 죽지 않게 처리 (환경 변수 또는 파일 확인 유도)
    console.warn('Proceeding without Firebase Admin authentication. Please check your serviceAccount.json file.');
}
// 데이터베이스 ID(weberp)를 명시하여 기본(default) 데이터베이스가 아닌 특정 데이터베이스를 사용합니다.
exports.adminDb = admin.firestore('weberp');
exports.adminAuth = admin.auth();
exports.default = admin;
//# sourceMappingURL=firebaseAdmin.js.map