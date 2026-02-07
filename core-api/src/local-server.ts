import app from './app';
import dotenv from 'dotenv';

// 환경 변수 로드
dotenv.config();

const PORT = process.env.PORT || 3000;

// 서버 시작
app.listen(PORT, () => {
  console.log(`===========================================`);
  console.log(`evscrap Core API - Local Development Server`);
  console.log(`===========================================`);
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  - GET http://localhost:${PORT}/health`);
  console.log(`  - POST http://localhost:${PORT}/user/v1/tenants/submit`);
  console.log(`===========================================\n`);
});
