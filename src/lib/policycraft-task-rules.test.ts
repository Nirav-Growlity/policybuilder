import assert from "node:assert/strict";
import test from "node:test";
import { isPolicyCraftTaskAction, isPolicyCraftTaskStatus, parsePolicyCraftTaskDeadline, policyCraftTaskUnavailableReason } from "./policycraft-task-rules";

test("task due dates are the end of the selected day in India Standard Time", () => {
  assert.equal(parsePolicyCraftTaskDeadline("2026-10-05")?.toISOString(), "2026-10-05T18:29:59.999Z");
  assert.equal(parsePolicyCraftTaskDeadline("2026-01-01")?.toISOString(), "2026-01-01T18:29:59.999Z");
});

test("task due dates reject malformed and impossible calendar days", () => {
  for (const value of ["", "2026-1-05", "2026-02-29", "2026-13-01", "05-10-2026", null, 20261005]) {
    assert.equal(parsePolicyCraftTaskDeadline(value), null, String(value));
  }
});

test("task actions and statuses accept only supported lifecycle values", () => {
  for (const value of ["assigned", "in_progress", "completed", "cancelled"]) assert.equal(isPolicyCraftTaskStatus(value), true);
  for (const value of ["pending", "overdue", "done", null]) assert.equal(isPolicyCraftTaskStatus(value), false);
  for (const value of ["edit", "reassign", "cancel", "reopen"]) assert.equal(isPolicyCraftTaskAction(value), true);
  assert.equal(isPolicyCraftTaskAction("delete"), false);
});

test("task action availability reflects access state without treating completion as an access failure", () => {
  const available = { organizationDeleted: false, organizationExpired: false, managerActive: true, organizationAssigned: true };
  assert.equal(policyCraftTaskUnavailableReason(available), null);
  assert.equal(policyCraftTaskUnavailableReason({ ...available, managerActive: false }), "The assigned manager is disabled.");
  assert.equal(policyCraftTaskUnavailableReason({ ...available, organizationAssigned: false }), "The manager is no longer assigned to this organization.");
});
