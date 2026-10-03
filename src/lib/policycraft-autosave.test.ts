import assert from "node:assert/strict";
import test from "node:test";
import { createDraftAutosave } from "./policycraft-autosave";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("serializes a slow save and coalesces the latest pending draft", async () => {
  const autosave = createDraftAutosave<string>(0);
  const calls: string[] = [];
  let lockVersion = 1;
  let releaseFirst!: () => void;
  const firstSave = new Promise<void>((resolve) => { releaseFirst = resolve; });

  const save = async (payload: string) => {
    calls.push(`${payload}:${lockVersion}`);
    if (payload === "first") await firstSave;
    lockVersion += 1;
  };

  autosave.schedule("first", save);
  await wait(5);
  autosave.schedule("second", save);
  await wait(5);

  assert.deepEqual(calls, ["first:1"]);
  releaseFirst();
  await wait(5);

  assert.deepEqual(calls, ["first:1", "second:2"]);
  autosave.cancel();
});

test("does not replay queued changes after a failed save", async () => {
  const autosave = createDraftAutosave<string>(0);
  const calls: string[] = [];
  let releaseFirst!: () => void;
  const firstSave = new Promise<void>((resolve) => { releaseFirst = resolve; });

  const save = async (payload: string) => {
    calls.push(payload);
    if (payload === "first") {
      await firstSave;
      throw new Error("conflict");
    }
  };

  autosave.schedule("first", save);
  await wait(5);
  autosave.schedule("second", save);
  releaseFirst();
  await wait(5);

  assert.deepEqual(calls, ["first"]);
  autosave.cancel();
});

test("flush writes the latest pending state immediately and waits for completion", async () => {
  const autosave = createDraftAutosave<string>(60_000);
  const calls: string[] = [];
  let release!: () => void;
  const saving = new Promise<void>((resolve) => { release = resolve; });
  const save = async (payload: string) => {
    calls.push(payload);
    await saving;
  };

  autosave.schedule("stale", save);
  autosave.schedule("latest", save);
  let flushed = false;
  const flush = autosave.flush().then(() => { flushed = true; });
  await wait(0);
  assert.deepEqual(calls, ["latest"]);
  assert.equal(flushed, false);

  release();
  await flush;
  assert.equal(flushed, true);
  autosave.cancel();
});

test("flush rejects a failed save instead of allowing navigation as if it succeeded", async () => {
  const autosave = createDraftAutosave<string>(60_000);
  autosave.schedule("draft", async () => { throw new Error("offline"); });
  await assert.rejects(autosave.flush(), /offline/);
  autosave.cancel();
});
