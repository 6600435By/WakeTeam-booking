import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isLocalUploadPhotoUrl,
  sanitizePhotoUrlForClient,
} from "./photo-url";

describe("photo-url", () => {
  it("detects local upload paths", () => {
    assert.equal(
      isLocalUploadPhotoUrl("/uploads/branch/abc.jpg"),
      true,
    );
    assert.equal(
      isLocalUploadPhotoUrl("https://xxx.supabase.co/storage/v1/object/public/uploads/branch/a.jpg"),
      false,
    );
    assert.equal(isLocalUploadPhotoUrl(null), false);
  });

  it("sanitizes local paths in production", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      assert.equal(
        sanitizePhotoUrlForClient("/uploads/branch/a.jpg"),
        null,
      );
      assert.equal(
        sanitizePhotoUrlForClient("https://cdn.example/a.jpg"),
        "https://cdn.example/a.jpg",
      );
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
