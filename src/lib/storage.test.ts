import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildUploadObjectPath } from "./storage";

describe("storage", () => {
  it("buildUploadObjectPath includes kind and extension", () => {
    const objectPath = buildUploadObjectPath("branch", "jpg");
    assert.match(objectPath, /^branch\/\d+-[a-f0-9]+\.jpg$/);
  });

  it("buildUploadObjectPath works for staff uploads", () => {
    const objectPath = buildUploadObjectPath("staff", "webp");
    assert.match(objectPath, /^staff\/\d+-[a-f0-9]+\.webp$/);
  });
});
