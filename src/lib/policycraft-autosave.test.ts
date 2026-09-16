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
