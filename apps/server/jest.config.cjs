/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          module: "commonjs",
          moduleResolution: "node",
          target: "ES2022",
          esModuleInterop: true,
          strict: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  roots: ["<rootDir>/test"],
  testMatch: ["**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  testTimeout: 15000,
  // O Jest 29 + Node 22 (pnpm + "type": "module") fica preso no teardown após
  // a suíte, mesmo sem handles abertos (verificado com _getActiveHandles == []).
  // Os testes executam e encerram corretamente; forceExit evita a espera morta.
  forceExit: true,
};
