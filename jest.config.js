module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // expo 패키지는 ESM 으로 배포된다. 기본 설정은 node_modules 를 통째로 변환에서 제외하므로
  // process.env(expo/virtual/env) 를 읽는 모듈이 "Unexpected token 'export'" 로 깨진다.
  transformIgnorePatterns: [
    'node_modules/(?!(?:jest-)?react-native|@react-native(?:-community)?|expo(?:nent)?|@expo(?:nent)?/.*|@expo-google-fonts/.*|react-native-.*|@react-navigation/.*)',
  ],
};
