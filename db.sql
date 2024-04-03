DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS runs;

CREATE TABLE IF NOT EXISTS runs (
  "id" BIGSERIAL PRIMARY KEY,
  "environment" VARCHAR(64) NOT NULL,
  "runName" VARCHAR(64) NOT NULL,
  "testName" VARCHAR(512) NOT NULL,
  "testId" VARCHAR(512) NOT NULL,
  "startTime" TIMESTAMP NOT NULL,
  "testFileName" TEXT NOT NULL,
  "outcome" VARCHAR(32) NOT NULL,
  "projectName" VARCHAR(128) NOT NULL,
  constraint "runTestName_idx" unique ("runName", "testName", "projectName")
);

CREATE TABLE IF NOT EXISTS comments (
  "id" BIGSERIAL PRIMARY KEY,
  "environment" VARCHAR(64) NOT NULL,
  "testName" VARCHAR(512) NOT NULL,
  "createDate" TIMESTAMP DEFAULT NOW(),
  "runName" VARCHAR(64) NOT NULL,
  "status" VARCHAR(32) DEFAULT 'unresolved',
  "threadId" BIGINT NULL,
  "isFirstComment" BOOLEAN DEFAULT FALSE,
  "user" TEXT NOT NULL,
  "body" TEXT NOT NULL
);

SELECT * FROM comments LIMIT 10;
