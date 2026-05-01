-- RedefineTables
PRAGMA defer_foreign_keys=ON;
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
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Course" ("categoryId", "createdAt", "description", "emailLanguage", "id", "imageAssetId", "name", "primarySalesCountry", "productLanguage", "salesPageUrl", "status", "updatedAt") SELECT "categoryId", "createdAt", "description", "emailLanguage", "id", "imageAssetId", "name", "primarySalesCountry", "productLanguage", "salesPageUrl", "status", "updatedAt" FROM "Course";
DROP TABLE "Course";
ALTER TABLE "new_Course" RENAME TO "Course";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
