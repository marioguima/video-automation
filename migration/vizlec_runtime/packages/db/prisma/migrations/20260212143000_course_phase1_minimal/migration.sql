PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Course" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "categoryId" TEXT,
  "productLanguage" TEXT,
  "emailLanguage" TEXT,
  "primarySalesCountry" TEXT,
  "salesPageUrl" TEXT,
  "imageAssetId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "new_Course" (
  "id",
  "name",
  "description",
  "categoryId",
  "productLanguage",
  "emailLanguage",
  "primarySalesCountry",
  "salesPageUrl",
  "imageAssetId",
  "status",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "name",
  "description",
  "categoryId",
  "productLanguage",
  "emailLanguage",
  "primarySalesCountry",
  "salesPageUrl",
  "imageAssetId",
  COALESCE(NULLIF("status", ''), 'draft'),
  "createdAt",
  COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP)
FROM "Course";

DROP TABLE "Course";
ALTER TABLE "new_Course" RENAME TO "Course";

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
