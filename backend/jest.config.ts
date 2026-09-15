import type { Config } from "jest";
import { pathsToModuleNameMapper } from "ts-jest";
import ts from "typescript";

const { config: tsconfig } = ts.readConfigFile(
  "./tsconfig.json",
  ts.sys.readFile,
);

const paths = tsconfig?.compilerOptions?.paths ?? {};

const config: Config = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testRegex: ".*\\.spec\\.ts$",
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],

  transform: {
    "^.+\\.(t|j)s$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.spec.json",
      },
    ],
  },

  moduleNameMapper: pathsToModuleNameMapper(paths, {
    prefix: "<rootDir>/",
  }),

  collectCoverageFrom: [
    "src/**/*.(t|j)s",
    "libs/**/*.(t|j)s",
    "apps/**/*.(t|j)s",
    "!src/generated/**",
  ],

  coverageDirectory: "./coverage",
  testEnvironment: "node",
};

export default config;